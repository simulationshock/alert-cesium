export type WebXRMode = 'immersive-vr' | 'immersive-ar';

export interface WebXRAvailability {
  secureContext: boolean;
  supported: boolean;
  vrSupported: boolean;
  arSupported: boolean;
  reason?: string;
}

/** Handles secure-context checks and lifecycle for browser WebXR sessions. */
export class WebXRSessionManager extends EventTarget {
  private activeSession: any = null;

  async getAvailability(): Promise<WebXRAvailability> {
    const secureContext = typeof window !== 'undefined' && window.isSecureContext;
    const xr = typeof navigator !== 'undefined' ? (navigator as any).xr : undefined;

    if (!secureContext) {
      return { secureContext, supported: false, vrSupported: false, arSupported: false, reason: 'HTTPS is required for WebXR.' };
    }

    if (!xr?.isSessionSupported) {
      return { secureContext, supported: false, vrSupported: false, arSupported: false, reason: 'WebXR is not available in this browser.' };
    }

    const [vrSupported, arSupported] = await Promise.all([
      xr.isSessionSupported('immersive-vr').catch(() => false),
      xr.isSessionSupported('immersive-ar').catch(() => false)
    ]);

    return { secureContext, supported: vrSupported || arSupported, vrSupported, arSupported };
  }

  async enter(mode: WebXRMode = 'immersive-vr', options: any = {}): Promise<any> {
    const availability = await this.getAvailability();
    if (!availability.secureContext || !availability.supported) {
      throw new Error(availability.reason ?? 'WebXR unavailable.');
    }

    const xr = (navigator as any).xr;
    this.activeSession = await xr.requestSession(mode, {
      requiredFeatures: options.requiredFeatures ?? ['local-floor'],
      optionalFeatures: options.optionalFeatures ?? ['bounded-floor', 'hand-tracking', 'layers']
    });

    this.activeSession.addEventListener?.('end', () => {
      this.activeSession = null;
      this.dispatchEvent(new Event('sessionend'));
    });
    this.dispatchEvent(new CustomEvent('sessionstart', { detail: { session: this.activeSession, mode } }));
    return this.activeSession;
  }

  async exit(): Promise<void> {
    if (this.activeSession?.end) {
      await this.activeSession.end();
    }
    this.activeSession = null;
  }

  get session(): any {
    return this.activeSession;
  }

  async bindButton(button: HTMLButtonElement, preferredMode: WebXRMode = 'immersive-vr'): Promise<void> {
    const availability = await this.getAvailability();
    button.disabled = !availability.supported;
    button.textContent = availability.supported ? `Enter ${preferredMode === 'immersive-ar' ? 'AR' : 'VR'}` : 'WebXR unavailable';
    button.title = availability.reason ?? '';
    button.onclick = () => void this.enter(preferredMode);
  }
}
