import { Cartesian3, ConstantProperty, Viewer } from 'cesium';
import type { FeedState, ResolvedWildfireCamera } from './types.js';

export interface FloatingCameraFeedOptions {
  width?: number;
  height?: number;
  /** Base URL of a same-origin CORS proxy (e.g. "https://localhost:8443").
   *  When provided, an in-world Cesium billboard is created alongside the DOM panel.
   *  The proxy must expose /proxy?url=<encoded> with Access-Control-Allow-Origin: *.
   */
  proxyBase?: string;
}

/**
 * Displays a selected wildfire camera feed as a DOM overlay panel over the Cesium viewer.
 * When a proxyBase is provided, also renders an in-world billboard entity at the camera's
 * geographic position so the feed is visible in XR / immersive mode.
 */
export class FloatingCameraFeedCanvas extends EventTarget {
  private readonly viewer: Viewer;
  private readonly panel: HTMLDivElement;
  private readonly titleEl: HTMLSpanElement;
  private readonly badgeEl: HTMLSpanElement;
  private readonly imgEl: HTMLImageElement;
  private readonly proxyBase?: string;
  private pollInterval?: ReturnType<typeof setInterval>;
  private state?: FeedState;
  private billboardEntity?: any; // Cesium Entity

  constructor(viewer: Viewer, options: FloatingCameraFeedOptions = {}) {
    super();
    this.viewer = viewer;
    this.proxyBase = options.proxyBase;

    this.panel = document.createElement('div');
    this.panel.style.cssText = [
      'position:absolute', 'bottom:20px', 'right:20px', 'width:320px',
      'background:#111', 'border:2px solid rgba(255,255,255,0.3)',
      'border-radius:6px', 'overflow:hidden', 'display:none',
      'z-index:100', 'box-shadow:0 4px 24px rgba(0,0,0,0.6)',
      'font-family:sans-serif'
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#1a1a1a;';

    this.titleEl = document.createElement('span');
    this.titleEl.style.cssText = 'color:#fff;font:bold 13px sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

    this.badgeEl = document.createElement('span');
    this.badgeEl.style.cssText = 'color:#fff;font:bold 11px sans-serif;padding:2px 8px;border-radius:3px;flex-shrink:0;margin-left:8px;';

    header.appendChild(this.titleEl);
    header.appendChild(this.badgeEl);

    this.imgEl = document.createElement('img');
    this.imgEl.style.cssText = 'width:100%;display:block;';
    this.imgEl.alt = '';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = [
      'position:absolute', 'top:6px', 'right:8px', 'background:none',
      'border:none', 'color:#aaa', 'font-size:16px', 'cursor:pointer',
      'line-height:1', 'padding:0'
    ].join(';');
    closeBtn.onclick = () => this.close();

    this.panel.appendChild(header);
    this.panel.appendChild(this.imgEl);
    this.panel.appendChild(closeBtn);

    const container = viewer.container as HTMLElement;
    container.style.position = 'relative';
    container.appendChild(this.panel);
  }

  async open(camera: ResolvedWildfireCamera): Promise<FeedState> {
    this.close();
    this.state = { camera, status: 'loading' };
    this.titleEl.textContent = camera.name;
    this.setBadge('loading');
    this.panel.style.display = 'block';

    if (camera.imageUrl) {
      this.startImagePoll(camera);
    } else if (camera.streamUrl) {
      this.setOffline(camera, 'Stream not supported');
    } else {
      this.setOffline(camera, 'No feed available');
    }

    return this.state;
  }

  close(): void {
    if (this.pollInterval !== undefined) clearInterval(this.pollInterval);
    this.pollInterval = undefined;
    this.imgEl.src = '';
    this.panel.style.display = 'none';
    this.removeBillboard();
    if (this.state) {
      this.state = { ...this.state, status: 'closed' };
      this.dispatchEvent(new CustomEvent('feedstate', { detail: this.state }));
    }
  }

  getState(): FeedState | undefined {
    return this.state;
  }

  destroy(): void {
    this.close();
    this.panel.remove();
  }

  private startImagePoll(camera: ResolvedWildfireCamera): void {
    // DOM overlay: plain <img> (no crossOrigin needed)
    const refresh = (): void => {
      this.imgEl.src = `${camera.imageUrl}?t=${Date.now()}`;
    };
    this.imgEl.onload = () => {
      if (this.state?.status !== 'playing') {
        this.state = { camera, status: 'playing' };
        this.setBadge('live');
        this.dispatchEvent(new CustomEvent('feedstate', { detail: this.state }));
      }
    };
    this.imgEl.onerror = () => this.setOffline(camera, 'Feed unavailable');
    refresh();
    this.pollInterval = setInterval(() => {
      refresh();
      // Also refresh the XR billboard if active
      if (this.proxyBase && camera.imageUrl) {
        void this.refreshBillboard(camera);
      }
    }, 10_000);

    // Create the XR in-world billboard if a proxy is configured
    if (this.proxyBase && camera.imageUrl) {
      this.ensureBillboard(camera);
      void this.refreshBillboard(camera);
    }
  }

  private ensureBillboard(camera: ResolvedWildfireCamera): void {
    if (this.billboardEntity) return;
    const position = Cartesian3.fromDegrees(camera.longitude, camera.latitude, (camera as any).altitude ?? 100);
    this.billboardEntity = this.viewer.entities.add({
      position,
      billboard: {
        // Placeholder until first frame loads via proxy
        image: new ConstantProperty(this.makePlaceholderCanvas()),
        width: new ConstantProperty(320),
        height: new ConstantProperty(180),
        scaleByDistance: new ConstantProperty({ near: 100, nearValue: 1.5, far: 50_000, farValue: 0.3 } as any),
        disableDepthTestDistance: new ConstantProperty(Number.POSITIVE_INFINITY),
      } as any,
      label: {
        text: new ConstantProperty(camera.name),
        pixelOffset: new ConstantProperty({ x: 0, y: -110 } as any),
        font: new ConstantProperty('bold 13px sans-serif'),
        fillColor: new ConstantProperty({ red: 1, green: 1, blue: 1, alpha: 1 } as any),
        outlineWidth: new ConstantProperty(2),
        style: new ConstantProperty(2 /* FILL_AND_OUTLINE */),
        disableDepthTestDistance: new ConstantProperty(Number.POSITIVE_INFINITY),
      } as any,
    });
  }

  private async refreshBillboard(camera: ResolvedWildfireCamera): Promise<void> {
    if (!this.billboardEntity || !this.proxyBase || !camera.imageUrl) return;
    const proxyUrl = `${this.proxyBase}/proxy?url=${encodeURIComponent(camera.imageUrl + '?t=' + Date.now())}`;
    try {
      const canvas = await loadImageToCanvas(proxyUrl);
      // Assign a NEW ConstantProperty each cycle to force Cesium texture re-upload
      this.billboardEntity.billboard.image = new ConstantProperty(canvas);
      this.billboardEntity.billboard.width = new ConstantProperty(canvas.width);
      this.billboardEntity.billboard.height = new ConstantProperty(canvas.height);
    } catch {
      // Silently ignore — keep showing the previous frame
    }
  }

  private removeBillboard(): void {
    if (this.billboardEntity) {
      this.viewer.entities.remove(this.billboardEntity);
      this.billboardEntity = undefined;
    }
  }

  private makePlaceholderCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#aaa';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading feed…', canvas.width / 2, canvas.height / 2);
    return canvas;
  }

  private setOffline(camera: ResolvedWildfireCamera, message: string): void {
    this.state = { camera, status: 'offline', message };
    this.setBadge('offline');
    this.dispatchEvent(new CustomEvent('feedstate', { detail: this.state }));
  }

  private setBadge(mode: 'live' | 'offline' | 'loading'): void {
    const styles: Record<string, [string, string]> = {
      live:    ['LIVE',    '#e53935'],
      offline: ['OFFLINE', '#555'],
      loading: ['…',       '#555'],
    };
    const [text, bg] = styles[mode];
    this.badgeEl.textContent = text;
    this.badgeEl.style.background = bg;
  }
}

/** Loads an image via a CORS-enabled URL into an HTMLCanvasElement. */
function loadImageToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 320;
      canvas.height = img.naturalHeight || 180;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}
