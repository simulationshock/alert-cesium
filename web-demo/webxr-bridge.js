/**
 * Proper WebXR bridge for Cesium.
 *
 * Cesium's built-in vrButton uses scene.useWebVR=true (legacy StereoCamera)
 * which just splits the canvas — no WebXR session is ever initiated.
 *
 * This bridge replaces it with a genuine immersive-vr session by:
 *  1. Intercepting gl.bindFramebuffer(*, null) so Cesium's render output
 *     lands in the XR session's framebuffer instead of the canvas.
 *  2. Resizing the canvas to the left-eye viewport dimensions so Cesium's
 *     internal viewport matches the eye resolution, then blitting that output
 *     to the right-eye viewport so both eyes receive content.
 *  3. Driving Cesium's render loop from the XR frame callback.
 *  4. Mapping headset yaw/pitch directly to Cesium camera heading/pitch
 *     (XR pitch 0 = horizon, -π/2 = looking down at Earth — same as Cesium).
 *  5. Requesting dom-overlay so UI panels remain visible in VR.
 */
export class WebXRCesiumBridge extends EventTarget {
  constructor(viewer) {
    super();
    this._viewer = viewer;
    this._session = null;
    this._gl = null;
    this._canvas = null;
    this._originalBindFB = null;
    this._xrFramebuffer = null;
    this._origCanvasWidth = 0;
    this._origCanvasHeight = 0;
  }

  static async isSupported() {
    try {
      return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'));
    } catch {
      return false;
    }
  }

  async enter() {
    const viewer = this._viewer;
    const canvas = viewer.scene.canvas;
    this._canvas = canvas;

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('Could not get WebGL context from Cesium canvas.');
    this._gl = gl;

    await gl.makeXRCompatible();

    const session = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking', 'dom-overlay'],
      domOverlay: { root: document.body },
    });
    this._session = session;

    const xrLayer = new XRWebGLLayer(session, gl, { framebufferScaleFactor: 1.0 });
    await session.updateRenderState({ baseLayer: xrLayer });
    const refSpace = await session.requestReferenceSpace('local-floor');

    // Redirect every Cesium call to gl.bindFramebuffer(*, null) → XR framebuffer.
    // Cesium's internal rendering always targets null (the canvas default FBO),
    // so this single intercept is enough to capture all of its output.
    const origBind = gl.bindFramebuffer.bind(gl);
    this._originalBindFB = origBind;
    this._xrFramebuffer = xrLayer.framebuffer;
    gl.bindFramebuffer = (target, fb) => origBind(target, fb === null ? this._xrFramebuffer : fb);

    // Save the original canvas dimensions so we can restore them on exit.
    this._origCanvasWidth = canvas.width;
    this._origCanvasHeight = canvas.height;

    viewer.useDefaultRenderLoop = false;

    let eyesReady = false;

    const onFrame = (_time, frame) => {
      session.requestAnimationFrame(onFrame);

      const pose = frame.getViewerPose(refSpace);
      if (!pose || pose.views.length === 0) return;

      // On the first real frame, resize the canvas to the left eye's pixel
      // dimensions. Cesium uses canvas.width/height for its gl.viewport call,
      // so this makes the rendered region exactly fill the left-eye area of
      // the XR framebuffer (Quest 2 left eye always starts at x=0, y=0).
      if (!eyesReady) {
        const lv = xrLayer.getViewport(pose.views[0]);
        canvas.width = lv.width;
        canvas.height = lv.height;
        eyesReady = true;
      }

      this._applyHeadOrientation(pose.transform.orientation);
      viewer.scene.render(Cesium.JulianDate.now());

      // Copy the left-eye render into the right-eye viewport so both eyes
      // receive content (monoscopic — no parallax, but fine for a globe).
      if (pose.views.length >= 2) {
        const lv = xrLayer.getViewport(pose.views[0]);
        const rv = xrLayer.getViewport(pose.views[1]);
        origBind(gl.READ_FRAMEBUFFER, xrLayer.framebuffer);
        origBind(gl.DRAW_FRAMEBUFFER, xrLayer.framebuffer);
        gl.blitFramebuffer(
          lv.x, lv.y, lv.x + lv.width, lv.y + lv.height,
          rv.x, rv.y, rv.x + rv.width, rv.y + rv.height,
          gl.COLOR_BUFFER_BIT, gl.LINEAR,
        );
        // Re-bind FRAMEBUFFER → XR for Cesium's next frame.
        origBind(gl.FRAMEBUFFER, xrLayer.framebuffer);
      }
    };

    session.requestAnimationFrame(onFrame);

    session.addEventListener('end', () => {
      this._teardown();
      this.dispatchEvent(new Event('sessionend'));
    }, { once: true });

    return session;
  }

  /**
   * Maps the XR headset quaternion (Y-up right-hand) to Cesium heading/pitch.
   *
   * In the local-floor reference space:
   *   pitch = 0   → looking at the horizon  (same as Cesium pitch 0)
   *   pitch = -π/2 → looking straight down at Earth (same as Cesium pitch -π/2)
   *
   * No offset is applied — the XR and Cesium pitch conventions are identical.
   */
  _applyHeadOrientation(q) {
    const yaw   = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.x - q.y * q.z))));
    this._viewer.camera.setView({
      orientation: { heading: -yaw, pitch, roll: 0 },
    });
  }

  _teardown() {
    if (this._gl && this._originalBindFB) {
      this._gl.bindFramebuffer = this._originalBindFB;
      this._originalBindFB = null;
      this._xrFramebuffer = null;
    }
    if (this._canvas) {
      this._canvas.width = this._origCanvasWidth;
      this._canvas.height = this._origCanvasHeight;
    }
    this._viewer.useDefaultRenderLoop = true;
    this._session = null;
  }

  async exit() {
    await this._session?.end();
  }

  get isActive() {
    return this._session !== null;
  }
}
