import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  HorizontalOrigin,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
} from 'cesium';
import type { RadioCategory, ResolvedEmergencyRadioFeed } from './types.js';

export interface RadioMarkerManagerOptions {
  clusterPixelSize?: number;
  maximumVisibleMarkers?: number;
  onSelect?: (feed: ResolvedEmergencyRadioFeed) => void;
}

const CATEGORY_STYLE: Record<RadioCategory, { bg: string; label: string }> = {
  law:      { bg: '#1565C0', label: 'PD'  },
  fire:     { bg: '#C62828', label: 'FD'  },
  ems:      { bg: '#2E7D32', label: '+'   },
  multi:    { bg: '#E65100', label: 'MC'  },
  aircraft: { bg: '#4527A0', label: 'AIR' },
  other:    { bg: '#37474F', label: 'R'   },
};

/** Cache one canvas icon per category so we don't redraw on every refresh. */
const iconCache = new Map<RadioCategory, HTMLCanvasElement>();

function getIcon(category: RadioCategory): HTMLCanvasElement {
  if (iconCache.has(category)) return iconCache.get(category)!;
  const { bg, label } = CATEGORY_STYLE[category];
  const size = 36;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;

  // Circle
  ctx.beginPath();
  ctx.arc(r, r, r - 3, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Label
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${label.length > 2 ? 9 : 13}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, r, r);

  iconCache.set(category, canvas);
  return canvas;
}

/** Renders California emergency radio feeds as category-icon markers on the globe. */
export class EmergencyRadioMarkerManager {
  private readonly viewer: Viewer;
  private readonly options: Required<Omit<RadioMarkerManagerOptions, 'onSelect'>> &
    Pick<RadioMarkerManagerOptions, 'onSelect'>;
  private feeds: ResolvedEmergencyRadioFeed[] = [];
  private entities: Entity[] = [];
  private _visible = true;
  private readonly onCameraChanged: () => void;
  private readonly onMoveEnd: () => void;
  private _refreshTimer?: ReturnType<typeof setTimeout>;
  private readonly clickHandler: ScreenSpaceEventHandler;
  private pickerEl: HTMLDivElement | null = null;
  private pickerDismissHandler: ((e: MouseEvent) => void) | null = null;

  constructor(viewer: Viewer, options: RadioMarkerManagerOptions = {}) {
    this.viewer = viewer;
    this.options = {
      clusterPixelSize: options.clusterPixelSize ?? 72,
      maximumVisibleMarkers: options.maximumVisibleMarkers ?? 300,
      onSelect: options.onSelect,
    };

    this.onCameraChanged = () => {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => this.refresh(), 100);
    };
    this.viewer.camera.changed.addEventListener(this.onCameraChanged);

    this.onMoveEnd = () => {
      if (!this._visible) return;
      clearTimeout(this._refreshTimer);
      this.refresh();
    };
    this.viewer.camera.moveEnd.addEventListener(this.onMoveEnd);

    this.clickHandler = new ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.clickHandler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = this.viewer.scene.pick(event.position);
      const entity: Entity | undefined =
        picked?.id instanceof Entity ? picked.id : undefined;

      if (!entity) {
        this.dismissPicker();
        return;
      }

      const clusterFeeds: ResolvedEmergencyRadioFeed[] | undefined = (entity as any).radioCluster;
      if (clusterFeeds) {
        if (clusterFeeds.length === 1) {
          this.dismissPicker();
          this.options.onSelect?.(clusterFeeds[0]);
        } else {
          this.showPicker(clusterFeeds, event.position);
        }
        return;
      }

      const feed: ResolvedEmergencyRadioFeed | undefined = (entity as any).radioFeed;
      if (feed) {
        this.dismissPicker();
        this.options.onSelect?.(feed);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  setFeeds(feeds: ResolvedEmergencyRadioFeed[]): void {
    this.feeds = feeds;
    this.refresh();
  }

  setVisible(visible: boolean): void {
    if (this._visible === visible) return;
    this._visible = visible;
    visible ? this.refresh() : this.clear();
  }

  get visible(): boolean { return this._visible; }

  refresh(): void {
    if (!this._visible) return;
    this.clear();

    const scene = this.viewer.scene;
    const canvas = scene.canvas;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const viewerDir = Cartesian3.normalize(scene.camera.positionWC, new Cartesian3());

    // Bucket by screen cell (viewport-only) or geographic fallback.
    const buckets = new Map<string, ResolvedEmergencyRadioFeed[]>();
    for (const feed of this.feeds) {
      const camDir = Cartesian3.normalize(feed.position, new Cartesian3());
      if (Cartesian3.dot(viewerDir, camDir) <= 0) continue;

      const screen = SceneTransforms.worldToWindowCoordinates(scene, feed.position, new Cartesian2());
      const inViewport = screen !== undefined &&
        screen.x >= 0 && screen.x < cw && screen.y >= 0 && screen.y < ch;
      const key = inViewport
        ? `${Math.floor(screen!.x / this.options.clusterPixelSize)}:${Math.floor(screen!.y / this.options.clusterPixelSize)}`
        : `geo:${Math.round(feed.longitude * 4)}:${Math.round(feed.latitude * 4)}`;
      const b = buckets.get(key) ?? [];
      b.push(feed);
      buckets.set(key, b);
    }

    const onScreen: Array<[string, ResolvedEmergencyRadioFeed[]]> = [];
    const geoFallback: Array<[string, ResolvedEmergencyRadioFeed[]]> = [];
    for (const entry of buckets) {
      (entry[0].startsWith('geo:') ? geoFallback : onScreen).push(entry);
    }

    let count = 0;
    for (const [key, feeds] of [...onScreen, ...geoFallback]) {
      if (count >= this.options.maximumVisibleMarkers) break;
      if (feeds.length === 1) {
        this.addFeedEntity(feeds[0]);
      } else {
        this.addClusterEntity(key, feeds);
      }
      count++;
    }
  }

  clear(): void {
    this.dismissPicker();
    for (const entity of this.entities) this.viewer.entities.remove(entity);
    this.entities = [];
  }

  destroy(): void {
    this.viewer.camera.changed.removeEventListener(this.onCameraChanged);
    this.viewer.camera.moveEnd.removeEventListener(this.onMoveEnd);
    clearTimeout(this._refreshTimer);
    this.clickHandler.destroy();
    this.clear();
  }

  private showPicker(feeds: ResolvedEmergencyRadioFeed[], pos: { x: number; y: number }): void {
    this.dismissPicker();

    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute',
      `left:${pos.x + 12}px`,
      `top:${pos.y - 8}px`,
      'background:#1a1a1a',
      'border:1px solid rgba(255,255,255,0.25)',
      'border-radius:6px',
      'padding:4px 0',
      'z-index:500',
      'box-shadow:0 4px 16px rgba(0,0,0,0.55)',
      'min-width:190px',
      'max-height:280px',
      'overflow-y:auto',
    ].join(';');

    for (const feed of feeds) {
      const style = CATEGORY_STYLE[feed.category];
      const btn = document.createElement('button');
      btn.style.cssText = [
        'display:flex', 'align-items:center', 'gap:8px',
        'width:100%', 'padding:6px 12px',
        'background:none', 'border:none', 'color:#eee',
        'text-align:left', 'cursor:pointer', 'font:13px sans-serif',
        'white-space:nowrap',
      ].join(';');

      const badge = document.createElement('span');
      badge.textContent = style.label;
      badge.style.cssText = [
        `background:${style.bg}`, 'color:#fff',
        'font:bold 9px sans-serif', 'padding:2px 5px',
        'border-radius:3px', 'flex-shrink:0',
      ].join(';');

      const name = document.createElement('span');
      name.textContent = feed.name;
      name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';

      btn.append(badge, name);
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
      btn.addEventListener('click', () => {
        this.options.onSelect?.(feed);
        this.dismissPicker();
      });
      el.appendChild(btn);
    }

    const container = this.viewer.container as HTMLElement;
    container.style.position = 'relative';
    container.appendChild(el);
    this.pickerEl = el;

    const dismiss = (e: MouseEvent) => {
      if (!this.pickerEl?.contains(e.target as Node)) this.dismissPicker();
    };
    this.pickerDismissHandler = dismiss;
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
  }

  private dismissPicker(): void {
    if (this.pickerDismissHandler) {
      document.removeEventListener('mousedown', this.pickerDismissHandler);
      this.pickerDismissHandler = null;
    }
    if (this.pickerEl) {
      this.pickerEl.remove();
      this.pickerEl = null;
    }
  }

  private addFeedEntity(feed: ResolvedEmergencyRadioFeed): void {
    const entity = new Entity({
      id: `radio-feed:${feed.id}`,
      name: feed.name,
      position: feed.position,
      billboard: {
        image: getIcon(feed.category),
        width: 36,
        height: 36,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } as any,
    });
    (entity as any).radioFeed = feed;
    this.entities.push(entity);
    this.viewer.entities.add(entity);
  }

  private addClusterEntity(bucketKey: string, feeds: ResolvedEmergencyRadioFeed[]): void {
    const lat = avg(feeds.map(f => f.latitude));
    const lon = avg(feeds.map(f => f.longitude));
    // Dominant category in this cell
    const counts: Partial<Record<RadioCategory, number>> = {};
    for (const f of feeds) counts[f.category] = (counts[f.category] ?? 0) + 1;
    const dominant = (Object.entries(counts) as [RadioCategory, number][])
      .sort((a, b) => b[1] - a[1])[0][0];

    const entity = new Entity({
      id: `radio-cluster:${bucketKey}`,
      name: `${feeds.length} radio feeds`,
      position: Cartesian3.fromDegrees(lon, lat),
      billboard: {
        image: getIcon(dominant),
        width: Math.min(48, 30 + feeds.length * 2),
        height: Math.min(48, 30 + feeds.length * 2),
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } as any,
      label: {
        text: String(feeds.length),
        font: 'bold 11px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        pixelOffset: new Cartesian2(14, -14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } as any,
    });
    (entity as any).radioCluster = feeds;
    this.entities.push(entity);
    this.viewer.entities.add(entity);
  }
}

function avg(vals: number[]): number {
  return vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
}
