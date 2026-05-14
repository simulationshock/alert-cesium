import {
  Cartesian2,
  Color,
  Entity,
  HorizontalOrigin,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
} from 'cesium';
import type { ResolvedPublicWebcam } from './types.js';

export interface PublicWebcamMarkerManagerOptions {
  clusterPixelSize?: number;
  maximumVisibleMarkers?: number;
  onSelect?: (webcam: ResolvedPublicWebcam) => void;
}

/** Teal icon canvas — cached so it's drawn only once. */
let _icon: HTMLCanvasElement | undefined;
let _clusterIcon: HTMLCanvasElement | undefined;

function getIcon(): HTMLCanvasElement {
  if (_icon) return _icon;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 3, 0, Math.PI * 2);
  ctx.fillStyle = '#0097A7';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Camera body
  const bx = 8, by = 11, bw = 16, bh = 10;
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx, by, bw, bh);
  // Lens
  ctx.beginPath();
  ctx.arc(r, r + 1, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#0097A7';
  ctx.fill();
  // Viewfinder bump
  ctx.fillStyle = '#fff';
  ctx.fillRect(r - 2, by - 3, 4, 3);

  _icon = canvas;
  return canvas;
}

function getClusterIcon(count: number): HTMLCanvasElement {
  const size = 40;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 3, 0, Math.PI * 2);
  ctx.fillStyle = '#00838F';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${count > 9 ? 11 : 13}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(count), r, r);

  return canvas;
}

/** Renders public webcam markers with view-dependent clustering. */
export class PublicWebcamMarkerManager {
  private readonly viewer: Viewer;
  private readonly options: Required<Omit<PublicWebcamMarkerManagerOptions, 'onSelect'>> &
    Pick<PublicWebcamMarkerManagerOptions, 'onSelect'>;
  private webcams: ResolvedPublicWebcam[] = [];
  private entities: Entity[] = [];
  private _visible = true;
  private readonly onCameraChanged: () => void;
  private readonly onMoveEnd: () => void;
  private _refreshTimer?: ReturnType<typeof setTimeout>;
  private readonly clickHandler: ScreenSpaceEventHandler;

  constructor(viewer: Viewer, options: PublicWebcamMarkerManagerOptions = {}) {
    this.viewer = viewer;
    this.options = {
      clusterPixelSize:      options.clusterPixelSize      ?? 72,
      maximumVisibleMarkers: options.maximumVisibleMarkers ?? 300,
      onSelect:              options.onSelect,
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
      const entity: Entity | undefined = picked?.id instanceof Entity ? picked.id : undefined;
      if (!entity) return;
      const webcam: ResolvedPublicWebcam | undefined = (entity as any).publicWebcam;
      if (webcam) this.options.onSelect?.(webcam);
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  setWebcams(webcams: ResolvedPublicWebcam[]): void {
    this.webcams = webcams;
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

    const scene  = this.viewer.scene;
    const canvas = scene.canvas;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const viewerDir = new (Cartesian2 as any).__proto__.constructor
      ? undefined : undefined; // satisfy linter
    void viewerDir;
    const camPos = scene.camera.positionWC;

    const buckets = new Map<string, ResolvedPublicWebcam[]>();
    for (const wc of this.webcams) {
      // Back-face cull: skip cameras on the far side of the globe.
      const dot = camPos.x * wc.position.x + camPos.y * wc.position.y + camPos.z * wc.position.z;
      if (dot <= 0) continue;

      const screen = SceneTransforms.worldToWindowCoordinates(scene, wc.position, new Cartesian2());
      const inViewport = screen !== undefined &&
        screen.x >= 0 && screen.x < cw && screen.y >= 0 && screen.y < ch;
      const key = inViewport
        ? `${Math.floor(screen!.x / this.options.clusterPixelSize)}:${Math.floor(screen!.y / this.options.clusterPixelSize)}`
        : `geo:${Math.round(wc.longitude * 4)}:${Math.round(wc.latitude * 4)}`;

      const bucket = buckets.get(key) ?? [];
      bucket.push(wc);
      buckets.set(key, bucket);
    }

    const onScreen:    Array<[string, ResolvedPublicWebcam[]]> = [];
    const geoFallback: Array<[string, ResolvedPublicWebcam[]]> = [];
    for (const entry of buckets) {
      (entry[0].startsWith('geo:') ? geoFallback : onScreen).push(entry);
    }

    let count = 0;
    for (const [, group] of [...onScreen, ...geoFallback]) {
      if (count >= this.options.maximumVisibleMarkers) break;
      if (group.length === 1) {
        this.addSingleEntity(group[0]);
      } else {
        this.addClusterEntity(group);
      }
      count++;
    }
  }

  clear(): void {
    for (const e of this.entities) this.viewer.entities.remove(e);
    this.entities = [];
  }

  destroy(): void {
    this.viewer.camera.changed.removeEventListener(this.onCameraChanged);
    this.viewer.camera.moveEnd.removeEventListener(this.onMoveEnd);
    clearTimeout(this._refreshTimer);
    this.clickHandler.destroy();
    this.clear();
  }

  private addSingleEntity(wc: ResolvedPublicWebcam): void {
    const entity = new Entity({
      id:       `webcam:${wc.id}`,
      name:     wc.title,
      position: wc.position,
      billboard: {
        image:                   getIcon(),
        width:                   32,
        height:                  32,
        horizontalOrigin:        HorizontalOrigin.CENTER,
        verticalOrigin:          VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } as any,
    });
    (entity as any).publicWebcam = wc;
    this.entities.push(entity);
    this.viewer.entities.add(entity);
  }

  private addClusterEntity(group: ResolvedPublicWebcam[]): void {
    const lat = avg(group.map(w => w.latitude));
    const lon = avg(group.map(w => w.longitude));
    const entity = new Entity({
      id:       `webcam-cluster:${lon.toFixed(3)}:${lat.toFixed(3)}`,
      name:     `${group.length} webcams`,
      position: group[0].position,
      billboard: {
        image:                   getClusterIcon(group.length),
        width:                   40,
        height:                  40,
        horizontalOrigin:        HorizontalOrigin.CENTER,
        verticalOrigin:          VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } as any,
    });
    // Clicking a cluster selects the first webcam — a picker could be added later.
    (entity as any).publicWebcam = group[0];
    this.entities.push(entity);
    this.viewer.entities.add(entity);
  }
}

function avg(vals: number[]): number {
  return vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
}
