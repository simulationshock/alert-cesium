/**
 * WebXR bridge for Cesium — replaces legacy vrButton with a proper immersive-vr session.
 *
 * Two bugs in the naive approach are fixed here:
 *  1. Left-eye-only: blitFramebuffer is unreliable with opaque XR framebuffers.
 *     Instead, we render once per eye by intercepting gl.viewport to redirect
 *     Cesium's full-canvas call to each eye's XR region, and enabling gl.scissor
 *     per eye so gl.clear does not erase the first eye when rendering the second.
 *  2. World moves with head: heading/pitch Euler extraction has sign/offset issues
 *     and ScreenSpaceCameraController fights the orientation. Fix: convert the HMD
 *     quaternion directly to camera direction+up vectors via the local ENU frame,
 *     and disable the camera controller for the duration of the session.
 */
export class WebXRCesiumBridge extends EventTarget {
  constructor(viewer) {
    super();
    this._viewer = viewer;
    this._session = null;
    this._gl = null;
    this._originalBindFB = null;
    this._originalViewport = null;
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

    // Intercept bindFramebuffer: null → XR framebuffer
    const origBind = gl.bindFramebuffer.bind(gl);
    this._originalBindFB = origBind;
    gl.bindFramebuffer = (target, fb) =>
      origBind(target, fb === null ? xrLayer.framebuffer : fb);

    // Intercept viewport: redirect Cesium's full-canvas call to the current eye's XR viewport.
    // Simultaneously set the scissor rectangle so gl.clear is bounded to this eye's area;
    // without this, the second eye's clear would erase the first eye's render.
    const origViewport = gl.viewport.bind(gl);
    this._originalViewport = origViewport;
    const cw = canvas.width;
    const ch = canvas.height;
    let _eyeVP = null;
    gl.viewport = (x, y, w, h) => {
      if (_eyeVP && x === 0 && y === 0 && w === cw && h === ch) {
        origViewport(_eyeVP.x, _eyeVP.y, _eyeVP.width, _eyeVP.height);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(_eyeVP.x, _eyeVP.y, _eyeVP.width, _eyeVP.height);
      } else {
        origViewport(x, y, w, h);
      }
    };

    // Prevent Cesium's pointer/touch controller from fighting XR orientation
    viewer.scene.screenSpaceCameraController.enableInputs = false;
    viewer.useDefaultRenderLoop = false;

    const onFrame = (_t, frame) => {
      session.requestAnimationFrame(onFrame);
      const pose = frame.getViewerPose(refSpace);
      if (!pose || pose.views.length === 0) return;

      this._applyHeadOrientation(pose.transform.orientation);

      origBind(gl.FRAMEBUFFER, xrLayer.framebuffer);
      for (const view of pose.views) {
        _eyeVP = xrLayer.getViewport(view);
        viewer.scene.render(Cesium.JulianDate.now());
      }
      _eyeVP = null;
      gl.disable(gl.SCISSOR_TEST);
    };

    session.requestAnimationFrame(onFrame);
    session.addEventListener('end', () => {
      this._teardown();
      this.dispatchEvent(new Event('sessionend'));
    }, { once: true });

    return session;
  }

  /**
   * Converts the XR headset quaternion to Cesium camera direction + up in ECEF.
   *
   * XR local-floor: X=right, Y=up, Z=backward (right-hand Y-up).
   * The initial XR forward (−Z) maps to Cesium heading=0 (North).
   * ENU mapping: East←XR+X, North←XR−Z, Up←XR+Y.
   *
   * pose.transform.orientation rotates viewer-space vectors into local-floor space,
   * so forward_in_floor = R*(0,0,−1) and up_in_floor = R*(0,1,0).
   */
  _applyHeadOrientation(q) {
    const { x, y, z, w } = q;

    // Rotation matrix elements needed (R rotates viewer-space → local-floor)
    const r01 = 2*(x*y - w*z),      r02 = 2*(x*z + w*y);
    const r11 = 1 - 2*(x*x + z*z),  r12 = 2*(y*z - w*x);
    const r21 = 2*(y*z + w*x),       r22 = 1 - 2*(x*x + y*y);

    // Forward (0,0,−1) and up (0,1,0) in local-floor space
    const fxLF = -r02,  fyLF = -r12,  fzLF = -r22;
    const uxLF =  r01,  uyLF =  r11,  uzLF =  r21;

    // Local-floor → ENU:  (lx, ly, lz) → (lx, −lz, ly)
    // East=lf+X, North=lf−Z, Up=lf+Y
    const fE = fxLF, fN = -fzLF, fU = fyLF;
    const uE = uxLF, uN = -uzLF, uU = uyLF;

    // ENU → ECEF via the local frame at the camera's current position.
    // eastNorthUpToFixedFrame returns a column-major Matrix4:
    //   col0=[m0,m1,m2]=East, col1=[m4,m5,m6]=North, col2=[m8,m9,m10]=Up
    const m = Cesium.Transforms.eastNorthUpToFixedFrame(this._viewer.camera.position);
    const eX = m[0], eY = m[1], eZ = m[2];
    const nX = m[4], nY = m[5], nZ = m[6];
    const uX = m[8], uY = m[9], uZ = m[10];

    this._viewer.camera.setView({
      orientation: {
        direction: new Cesium.Cartesian3(
          eX*fE + nX*fN + uX*fU,
          eY*fE + nY*fN + uY*fU,
          eZ*fE + nZ*fN + uZ*fU,
        ),
        up: new Cesium.Cartesian3(
          eX*uE + nX*uN + uX*uU,
          eY*uE + nY*uN + uY*uU,
          eZ*uE + nZ*uN + uZ*uU,
        ),
      },
    });
  }

  _teardown() {
    const gl = this._gl;
    if (gl) {
      if (this._originalBindFB) {
        gl.bindFramebuffer = this._originalBindFB;
        this._originalBindFB = null;
      }
      if (this._originalViewport) {
        gl.viewport = this._originalViewport;
        this._originalViewport = null;
      }
      gl.disable(gl.SCISSOR_TEST);
      this._gl = null;
    }
    this._viewer.scene.screenSpaceCameraController.enableInputs = true;
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
