import type { ResolvedWildfireCamera } from './types.js';

/** HTML overlay panel listing co-located cameras for the user to pick from. */
export class CameraPickerPanel {
  private readonly panel: HTMLDivElement;
  private readonly listEl: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.style.cssText = [
      'position:absolute', 'bottom:20px', 'left:20px', 'width:260px',
      'background:#111', 'border:2px solid rgba(255,255,255,0.3)',
      'border-radius:6px', 'overflow:hidden', 'display:none',
      'z-index:100', 'box-shadow:0 4px 24px rgba(0,0,0,0.6)',
      'font-family:sans-serif'
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#1a1a1a;';

    const titleEl = document.createElement('span');
    titleEl.textContent = 'Select Camera';
    titleEl.style.cssText = 'color:#fff;font:bold 13px sans-serif;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#aaa;font-size:16px;cursor:pointer;padding:0;line-height:1;';
    closeBtn.onclick = () => this.close();

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    this.listEl = document.createElement('div');
    this.listEl.style.cssText = 'max-height:320px;overflow-y:auto;';

    this.panel.appendChild(header);
    this.panel.appendChild(this.listEl);
    container.appendChild(this.panel);
  }

  open(cameras: ResolvedWildfireCamera[], onPick: (camera: ResolvedWildfireCamera) => void): void {
    this.listEl.innerHTML = '';

    for (const camera of cameras) {
      const btn = document.createElement('button');
      btn.textContent = camera.name || camera.id;
      btn.style.cssText = [
        'display:block', 'width:100%', 'text-align:left',
        'padding:10px 14px', 'background:none', 'border:none',
        'border-bottom:1px solid rgba(255,255,255,0.08)',
        'color:#ddd', 'font:13px sans-serif', 'cursor:pointer'
      ].join(';');
      btn.onmouseenter = () => { btn.style.background = 'rgba(255,255,255,0.08)'; };
      btn.onmouseleave = () => { btn.style.background = 'none'; };
      btn.onclick = () => {
        this.close();
        onPick(camera);
      };
      this.listEl.appendChild(btn);
    }

    this.panel.style.display = 'block';
  }

  close(): void {
    this.panel.style.display = 'none';
  }

  destroy(): void {
    this.close();
    this.panel.remove();
  }
}
