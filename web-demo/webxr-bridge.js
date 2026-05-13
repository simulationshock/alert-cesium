/**
 * Proper WebXR bridge for Cesium.
 *
 * Cesium's built-in vrButton uses scene.useWebVR=true (legacy StereoCamera)
 * which just splits the canvas — no WebXR session is ever initiated.
 *
 * This bridge replaces it with a genuine immersive-vr session by:
 *  1. Intercepting gl.bindFramebuffer(*, null) to redirect Cesium's final
 *     render output to the XR session's framebuffer.
 *  2. Driving Cesium's render loop from the XR frame callback.
 *  3. Updating the Cesium camera orientation from the headset pose each frame.
 *  4. Requesting dom-overlay so UI panels (camera feed) remain visible in VR.
 */
export class WebXRCesiumBridge extends EventTarget {
  constructor(viewer) {
    super();
    this._viewer = viewer;
    this._session = null;
    this._gl = null;
    this._originalBindFB = null;
    this._xrFramebuffer = null;
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

    // Intercept gl.bindFramebuffer so every Cesium call that targets
    // framebuffer 0 (null) is silently redirected to the XR framebuffer.
    const origBind = gl.bindFramebuffer.bind(gl);
    this._originalBindFB = origBind;
    this._xrFramebuffer = xrLayer.framebuffer;
    gl.bindFramebuffer = (target, fb) => origBind(target, fb === null ? this._xrFramebuffer : fb);

    // Stop Cesium's automatic render loop; we drive it from XR frames.
    viewer.useDefaultRenderLoop = false;

    const onFrame = (_time, frame) => {
      session.requestAnimationFrame(onFrame);

      const pose = frame.getViewerPose(refSpace);
      if (!pose) return;

      this._applyHeadOrientation(pose.transform.orientation);
      viewer.scene.render(Cesium.JulianDate.now());
    };
    session.requestAnimationFrame(onFrame);

    session.addEventListener('end', () => {
      this._teardown();
      this.dispatchEvent(new Event('sessionend'));
    }, { once: true });
    return session;
  }

  /**
   * Maps XR headset quaternion (Y-up right-hand) to Cesium heading/pitch.
   * Yaw around physical vertical → heading; tilt up/down → pitch.
   */
  _applyHeadOrientation(q) {
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.x - q.y * q.z))));
    this._viewer.camera.setView({
      orientation: {
        heading: -yaw,
        pitch: pitch - Math.PI / 2,
        roll: 0,
      },
    });
  }

  _teardown() {
    if (this._gl && this._originalBindFB) {
      this._gl.bindFramebuffer = this._originalBindFB;
      this._originalBindFB = null;
      this._xrFramebuffer = null;
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
