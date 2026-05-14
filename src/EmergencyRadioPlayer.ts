import type { ResolvedEmergencyRadioFeed } from './types.js';

const CATEGORY_LABEL: Record<string, string> = {
  law: 'Law Enforcement', fire: 'Fire', ems: 'EMS',
  multi: 'Multi-Agency', aircraft: 'Aviation', other: 'Radio',
};

const CATEGORY_COLOR: Record<string, string> = {
  law: '#1565C0', fire: '#C62828', ems: '#2E7D32',
  multi: '#E65100', aircraft: '#4527A0', other: '#37474F',
};

/** Floating audio player for emergency radio feeds. Positioned top-right. */
export class EmergencyRadioPlayer extends EventTarget {
  private readonly panel: HTMLDivElement;
  private readonly titleEl: HTMLSpanElement;
  private readonly badgeEl: HTMLSpanElement;
  private readonly countyEl: HTMLSpanElement;
  private readonly statusEl: HTMLSpanElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly fallbackBtn: HTMLAnchorElement;
  private audio: HTMLAudioElement | null = null;
  private currentFeed: ResolvedEmergencyRadioFeed | null = null;
  private _playing = false;

  constructor(container: HTMLElement) {
    super();

    this.panel = document.createElement('div');
    this.panel.style.cssText = [
      'position:absolute', 'top:16px', 'right:16px', 'width:300px',
      'background:#111', 'border:2px solid rgba(255,255,255,0.25)',
      'border-radius:8px', 'overflow:hidden', 'display:none',
      'z-index:300', 'box-shadow:0 4px 24px rgba(0,0,0,0.6)',
      'font-family:sans-serif',
    ].join(';');

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 12px;background:#1a1a1a;gap:6px;';

    this.badgeEl = document.createElement('span');
    this.badgeEl.style.cssText = 'font:bold 10px sans-serif;padding:2px 7px;border-radius:3px;flex-shrink:0;color:#fff;';

    this.titleEl = document.createElement('span');
    this.titleEl.style.cssText = 'color:#fff;font:bold 13px sans-serif;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#aaa;font-size:15px;cursor:pointer;padding:0;flex-shrink:0;line-height:1;';
    closeBtn.onclick = () => this.close();

    header.append(this.badgeEl, this.titleEl, closeBtn);

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 14px;display:flex;flex-direction:column;gap:8px;';

    this.countyEl = document.createElement('span');
    this.countyEl.style.cssText = 'color:#aaa;font:12px sans-serif;';

    this.statusEl = document.createElement('span');
    this.statusEl.style.cssText = 'color:#ccc;font:12px sans-serif;';

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;gap:10px;';

    this.playBtn = document.createElement('button');
    this.playBtn.style.cssText = [
      'padding:6px 18px', 'background:#333', 'border:1px solid rgba(255,255,255,0.3)',
      'border-radius:5px', 'color:#fff', 'font:bold 13px sans-serif',
      'cursor:pointer', 'flex-shrink:0',
    ].join(';');
    this.playBtn.onclick = () => this._playing ? this.stop() : this.play();

    this.fallbackBtn = document.createElement('a');
    this.fallbackBtn.textContent = 'Open on Broadcastify ↗';
    this.fallbackBtn.target = '_blank';
    this.fallbackBtn.rel = 'noopener';
    this.fallbackBtn.style.cssText = 'color:#7ab;font:11px sans-serif;text-decoration:none;white-space:nowrap;';

    controls.append(this.playBtn, this.fallbackBtn);
    body.append(this.countyEl, this.statusEl, controls);
    this.panel.append(header, body);

    container.style.position = 'relative';
    container.appendChild(this.panel);

    this.setPlayBtn(false);
  }

  open(feed: ResolvedEmergencyRadioFeed): void {
    this.close();
    this.currentFeed = feed;

    this.badgeEl.textContent = CATEGORY_LABEL[feed.category] ?? 'Radio';
    this.badgeEl.style.background = CATEGORY_COLOR[feed.category] ?? '#555';
    this.titleEl.textContent = feed.name;
    this.countyEl.textContent = feed.county ? `${feed.county} County` : '';
    this.fallbackBtn.href = feed.webUrl ?? `https://www.broadcastify.com/listen/feed/${feed.id}`;
    this.setStatus('Ready');
    this.setPlayBtn(false);
    this.panel.style.display = 'block';
    this.play();
  }

  close(): void {
    this.stop();
    this.panel.style.display = 'none';
    this.currentFeed = null;
    this.dispatchEvent(new CustomEvent('close'));
  }

  private play(): void {
    if (!this.currentFeed?.streamUrl) {
      this.setStatus('No stream URL available');
      return;
    }
    if (this.audio) { this.audio.pause(); this.audio = null; }

    this.setStatus('Connecting…');
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = this.currentFeed.streamUrl;

    audio.addEventListener('playing', () => {
      this._playing = true;
      this.setPlayBtn(true);
      this.setStatus('Live');
    });
    audio.addEventListener('waiting', () => this.setStatus('Buffering…'));
    audio.addEventListener('error', () => {
      this._playing = false;
      this.setPlayBtn(false);
      this.setStatus('Stream unavailable — try Broadcastify link →');
    });
    audio.addEventListener('ended', () => {
      this._playing = false;
      this.setPlayBtn(false);
      this.setStatus('Stream ended');
    });

    this.audio = audio;
    audio.play().catch(() => {
      this.setStatus('Autoplay blocked — press ▶ to start');
      this.setPlayBtn(false);
    });
  }

  private stop(): void {
    this._playing = false;
    if (this.audio) { this.audio.pause(); this.audio.src = ''; this.audio = null; }
    this.setPlayBtn(false);
    this.setStatus('Stopped');
  }

  private setPlayBtn(playing: boolean): void {
    this.playBtn.textContent = playing ? '⏹ Stop' : '▶ Play';
  }

  private setStatus(msg: string): void {
    this.statusEl.textContent = msg;
  }

  destroy(): void {
    this.close();
    this.panel.remove();
  }
}
