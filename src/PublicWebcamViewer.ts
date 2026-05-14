import type { ResolvedPublicWebcam } from './types.js';

/**
 * Floating panel that shows a public webcam feed.
 * Positioned top-left so it doesn't conflict with the camera feed panel
 * (bottom-right) or the radio player (top-right).
 *
 * Behaviour:
 *  - If the webcam has a `playerUrl`: embeds it in an <iframe>.
 *  - If the webcam has a `previewUrl`: polls a refreshing <img> every 30 s.
 *  - Otherwise shows a placeholder with a link to the webcam's detail page.
 */
export class PublicWebcamViewer extends EventTarget {
  private readonly panel:    HTMLDivElement;
  private readonly titleEl:  HTMLSpanElement;
  private readonly locationEl: HTMLSpanElement;
  private readonly mediaEl:  HTMLDivElement;
  private readonly statusEl: HTMLSpanElement;
  private pollInterval?: ReturnType<typeof setInterval>;
  private current?: ResolvedPublicWebcam;

  constructor(container: HTMLElement) {
    super();

    this.panel = document.createElement('div');
    this.panel.style.cssText = [
      'position:absolute', 'top:16px', 'left:16px', 'width:300px',
      'background:#111', 'border:2px solid rgba(255,255,255,0.25)',
      'border-radius:8px', 'overflow:hidden', 'display:none',
      'z-index:300', 'box-shadow:0 4px 24px rgba(0,0,0,0.6)',
      'font-family:sans-serif',
    ].join(';');

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 12px;background:#1a1a1a;gap:6px;';

    const badge = document.createElement('span');
    badge.textContent = 'CAM';
    badge.style.cssText = 'font:bold 10px sans-serif;padding:2px 7px;border-radius:3px;flex-shrink:0;color:#fff;background:#0097A7;';

    this.titleEl = document.createElement('span');
    this.titleEl.style.cssText = 'color:#fff;font:bold 13px sans-serif;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#aaa;font-size:15px;cursor:pointer;padding:0;flex-shrink:0;line-height:1;';
    closeBtn.onclick = () => this.close();

    header.append(badge, this.titleEl, closeBtn);

    // ── Media area ──────────────────────────────────────────────────────────
    this.mediaEl = document.createElement('div');
    this.mediaEl.style.cssText = 'width:100%;background:#000;position:relative;';

    // ── Footer ──────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:8px 12px;display:flex;align-items:center;gap:8px;background:#1a1a1a;';

    this.locationEl = document.createElement('span');
    this.locationEl.style.cssText = 'color:#aaa;font:11px sans-serif;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    this.statusEl = document.createElement('span');
    this.statusEl.style.cssText = 'color:#888;font:10px sans-serif;flex-shrink:0;';

    footer.append(this.locationEl, this.statusEl);
    this.panel.append(header, this.mediaEl, footer);

    container.style.position = 'relative';
    container.appendChild(this.panel);
  }

  open(webcam: ResolvedPublicWebcam): void {
    this.close();
    this.current = webcam;
    this.titleEl.textContent = webcam.title;
    this.locationEl.textContent = [webcam.city, webcam.region].filter(Boolean).join(', ') || '';
    this.mediaEl.innerHTML = '';
    this.panel.style.display = 'block';

    if (webcam.playerUrl) {
      this.showIframe(webcam);
    } else if (webcam.previewUrl) {
      this.showImagePoll(webcam);
    } else {
      this.showNoPreview(webcam);
    }
  }

  close(): void {
    if (this.pollInterval !== undefined) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    this.mediaEl.innerHTML = '';
    this.panel.style.display = 'none';
    this.current = undefined;
    this.dispatchEvent(new CustomEvent('close'));
  }

  destroy(): void {
    this.close();
    this.panel.remove();
  }

  private showIframe(webcam: ResolvedPublicWebcam): void {
    const iframe = document.createElement('iframe');
    iframe.src = webcam.playerUrl!;
    iframe.allow = 'autoplay';
    iframe.style.cssText = 'width:100%;height:180px;border:none;display:block;';
    this.mediaEl.appendChild(iframe);
    this.statusEl.textContent = 'Live';
    this.addDetailLink(webcam);
  }

  private showImagePoll(webcam: ResolvedPublicWebcam): void {
    const img = document.createElement('img');
    img.style.cssText = 'width:100%;display:block;';
    img.alt = '';
    this.mediaEl.appendChild(img);

    const refresh = () => { img.src = `${webcam.previewUrl}?t=${Date.now()}`; };
    img.onload  = () => { this.statusEl.textContent = 'Live'; };
    img.onerror = () => { this.statusEl.textContent = 'Unavailable'; };
    refresh();
    this.pollInterval = setInterval(refresh, 30_000);
    this.addDetailLink(webcam);
  }

  private showNoPreview(webcam: ResolvedPublicWebcam): void {
    const placeholder = document.createElement('div');
    placeholder.style.cssText = 'width:100%;height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;';

    const msg = document.createElement('span');
    msg.textContent = 'Preview requires Windy API key';
    msg.style.cssText = 'color:#888;font:11px sans-serif;text-align:center;padding:0 12px;';

    this.mediaEl.appendChild(placeholder);
    placeholder.appendChild(msg);
    this.statusEl.textContent = '';
    this.addDetailLink(webcam);
  }

  private addDetailLink(webcam: ResolvedPublicWebcam): void {
    if (!webcam.detailUrl) return;
    const footer = this.panel.lastElementChild as HTMLElement;

    const link = document.createElement('a');
    link.textContent = 'View on Windy ↗';
    link.style.cssText = 'color:#7ab;font:10px sans-serif;text-decoration:none;white-space:nowrap;flex-shrink:0;';
    link.onclick = (e) => {
      e.preventDefault();
      window.open(webcam.detailUrl, 'windy-webcam', 'width=900,height=600,resizable=yes');
    };
    footer.appendChild(link);
  }
}
