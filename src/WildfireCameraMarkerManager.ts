import {
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  Entity,
  HorizontalOrigin,
  LabelStyle,
  PolygonHierarchy,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer
} from 'cesium';
import type { CameraCluster, FireProximityStatus, MarkerSelection, ResolvedWildfireCamera } from './types.js';

export interface MarkerManagerOptions {
  /** Screen-space size in pixels used to group crowded markers. */
  clusterPixelSize?: number;
  /** Maximum number of rendered marker/cluster entities. */
  maximumVisibleMarkers?: number;
  onSelect?: (selection: MarkerSelection) => void;
}

/** Renders georeferenced wildfire camera markers with view-dependent clustering/culling. */
export class WildfireCameraMarkerManager {
  private readonly viewer: Viewer;
  private readonly options: Required<Omit<MarkerManagerOptions, 'onSelect'>> & Pick<MarkerManagerOptions, 'onSelect'>;
  private cameras: ResolvedWildfireCamera[] = [];
  private entities: Entity[] = [];
  private fireHighlights: Map<string, FireProximityStatus> = new Map();
  private _visible = true;
  private readonly onCameraChanged: () => void;
  private _refreshTimer?: ReturnType<typeof setTimeout>;
  private readonly clickHandler: ScreenSpaceEventHandler;
  private pickerEl: HTMLDivElement | null = null;
  private pickerDismissHandler: ((e: MouseEvent) => void) | null = null;

  constructor(viewer: Viewer, options: MarkerManagerOptions = {}) {
    this.viewer = viewer;
    this.options = {
      clusterPixelSize: options.clusterPixelSize ?? 72,
      maximumVisibleMarkers: options.maximumVisibleMarkers ?? 250,
      onSelect: options.onSelect
    };
    // Debounce camera movement: refresh 100 ms after the last change event so
    // entities are never cleared mid-frame (camera.changed fires inside Cesium's
    // render loop; clearing entities there prevents them rendering that frame).
    this.onCameraChanged = () => {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => this.refresh(), 100);
    };
    this.viewer.camera.changed.addEventListener(this.onCameraChanged);

    this.clickHandler = new ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.clickHandler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = this.viewer.scene.pick(event.position);
      const entity: Entity | undefined = picked?.id instanceof Entity ? picked.id : undefined;

      if (!entity) {
        this.dismissPicker();
        return;
      }

      const selection: MarkerSelection | undefined = (entity as any).wildfireSelection;
      if (!selection) return;

      if (selection.camera) {
        this.dismissPicker();
        this.options.onSelect?.(selection);
      } else if (selection.cluster) {
        const { cameras } = selection.cluster;
        if (cameras.length === 1) {
          this.dismissPicker();
          this.options.onSelect?.({ camera: cameras[0] });
        } else {
          this.showPicker(cameras, event.position);
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  setCameras(cameras: ResolvedWildfireCamera[]): void {
    this.cameras = cameras;
    this.refresh();
  }

  getCameras(): ResolvedWildfireCamera[] {
    return [...this.cameras];
  }

  setFireHighlights(highlights: Map<string, FireProximityStatus>): void {
    this.fireHighlights = highlights;
    this.refresh();
  }

  setVisible(visible: boolean): void {
    if (this._visible === visible) return;
    this._visible = visible;
    if (visible) {
      this.refresh();
    } else {
      this.clear();
    }
  }

  get visible(): boolean { return this._visible; }

  refresh(): void {
    if (!this._visible) return;
    this.clear();
    const clusters = this.clusterVisibleCameras();
    const visible = clusters.slice(0, this.options.maximumVisibleMarkers);

    for (const cluster of visible) {
      if (cluster.cameras.length === 1) {
        // Solo camera: individual dot + FOV cone.
        const camera = cluster.cameras[0];
        for (const fovEntity of this.createFovEntities(camera)) {
          this.entities.push(fovEntity);
          this.viewer.entities.add(fovEntity);
        }
        const dot = this.createCameraEntity(camera);
        this.entities.push(dot);
        this.viewer.entities.add(dot);
      } else {
        // 2+ cameras in same screen cell: cluster entity; picker on click.
        const entity = this.createClusterEntity(cluster);
        this.entities.push(entity);
        this.viewer.entities.add(entity);
      }
    }
  }

  clear(): void {
    for (const entity of this.entities) {
      this.viewer.entities.remove(entity);
    }
    this.entities = [];
  }

  destroy(): void {
    this.dismissPicker();
    this.viewer.camera.changed.removeEventListener(this.onCameraChanged);
    clearTimeout(this._refreshTimer);
    this.clickHandler.destroy();
    this.clear();
  }

  selectCamera(cameraId: string): MarkerSelection | undefined {
    const camera = this.cameras.find((candidate) => candidate.id === cameraId);
    if (!camera) return undefined;
    const selection = { camera };
    this.options.onSelect?.(selection);
    return selection;
  }

  private showPicker(cameras: ResolvedWildfireCamera[], pos: { x: number; y: number }): void {
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
      'min-width:160px',
      'max-height:260px',
      'overflow-y:auto',
    ].join(';');

    for (const camera of cameras) {
      const btn = document.createElement('button');
      btn.textContent = camera.name;
      btn.style.cssText = [
        'display:block', 'width:100%', 'padding:6px 14px',
        'background:none', 'border:none', 'color:#eee',
        'text-align:left', 'cursor:pointer', 'font:13px sans-serif',
        'white-space:nowrap',
      ].join(';');
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
      btn.addEventListener('click', () => {
        this.options.onSelect?.({ camera });
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

  private clusterVisibleCameras(): CameraCluster[] {
    const buckets = new Map<string, ResolvedWildfireCamera[]>();
    const scene = this.viewer.scene;
    // EllipsoidalOccluder reliably identifies back-of-globe cameras regardless
    // of pitch — worldToWindowCoordinates returns null in top-down views even
    // for visible surface points, so we can't use it as a visibility gate.
    // Normalize the viewer position once; a surface camera is on the visible
    // hemisphere when dot(viewerDir, cameraDir) > 0.  This works at any pitch
    // including straight down, unlike worldToWindowCoordinates which returns
    // null for surface points in top-down views.
    const viewerDir = Cartesian3.normalize(scene.camera.positionWC, new Cartesian3());

    for (const camera of this.cameras) {
      const camDir = Cartesian3.normalize(camera.position, new Cartesian3());
      if (Cartesian3.dot(viewerDir, camDir) <= 0) continue; // back of globe

      const screen = SceneTransforms.worldToWindowCoordinates(
        scene, camera.position, new Cartesian2());
      // Use screen-space grid cell when available; fall back to a coarse
      // geographic key for cameras the projector can't place (view edge cases).
      const key = screen
        ? `${Math.floor(screen.x / this.options.clusterPixelSize)}:${Math.floor(screen.y / this.options.clusterPixelSize)}`
        : `geo:${Math.round(camera.longitude * 4)}:${Math.round(camera.latitude * 4)}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(camera);
      buckets.set(key, bucket);
    }

    // On-screen clusters first so the maximumVisibleMarkers limit only
    // trims geographic-fallback edge clusters, never viewport-visible ones.
    const onScreen: CameraCluster[] = [];
    const geoFallback: CameraCluster[] = [];
    for (const [id, cams] of buckets) {
      const cluster = this.createCluster(id, cams);
      (id.startsWith('geo:') ? geoFallback : onScreen).push(cluster);
    }
    return [...onScreen, ...geoFallback].slice(0, this.options.maximumVisibleMarkers);
  }

  private createCluster(id: string, cameras: ResolvedWildfireCamera[]): CameraCluster {
    const latitude = average(cameras.map((camera) => camera.latitude));
    const longitude = average(cameras.map((camera) => camera.longitude));
    const height = average(cameras.map((camera) => camera.height ?? 0));
    return {
      id,
      cameras,
      latitude,
      longitude,
      position: Cartesian3.fromDegrees(longitude, latitude, height)
    };
  }

  private createCameraEntity(camera: ResolvedWildfireCamera): Entity {
    const fireStatus = this.fireHighlights.get(camera.id);
    const pointColor = fireStatus === 'inside' ? Color.RED : fireStatus === 'proximity' ? Color.ORANGE : Color.ORANGERED;
    const pixelSize = fireStatus === 'inside' ? 16 : fireStatus === 'proximity' ? 14 : 12;
    const outlineWidth = fireStatus === 'inside' ? 3 : 2;
    const entity = new Entity({
      id: `wildfire-camera:${camera.id}`,
      name: camera.name,
      position: camera.position,
      point: {
        pixelSize,
        color: pointColor,
        outlineColor: Color.WHITE,
        outlineWidth,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: camera.name,
        font: '13px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cartesian2(0, -18),
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        // Only show labels when close enough that cameras are well-separated
        distanceDisplayCondition: new DistanceDisplayCondition(0, 30_000),
      },
      properties: { wildfireCamera: camera, markerType: 'camera' }
    });
    (entity as any).wildfireSelection = { camera };
    return entity;
  }

  private resolveFovCorners(camera: ResolvedWildfireCamera): [[number, number], [number, number]] | undefined {
    let left: [number, number] | undefined = camera.fovLeft;
    let right: [number, number] | undefined = camera.fovRight;

    if ((!left || !right) && camera.azimuth !== undefined && camera.fieldOfView !== undefined) {
      const rangeDeg = 15 / 111;
      const halfFov = (camera.fieldOfView / 2) * (Math.PI / 180);
      const az = camera.azimuth * (Math.PI / 180);
      const cosLat = Math.cos(camera.latitude * (Math.PI / 180));
      left = [
        camera.longitude + (rangeDeg * Math.sin(az - halfFov)) / cosLat,
        camera.latitude + rangeDeg * Math.cos(az - halfFov),
      ];
      right = [
        camera.longitude + (rangeDeg * Math.sin(az + halfFov)) / cosLat,
        camera.latitude + rangeDeg * Math.cos(az + halfFov),
      ];
    }

    return left && right ? [left, right] : undefined;
  }

  private createFovEntities(camera: ResolvedWildfireCamera): Entity[] {
    const corners = this.resolveFovCorners(camera);
    if (!corners) return [];
    const [left, right] = corners;

    const fireStatus = this.fireHighlights.get(camera.id);
    const fillColor = fireStatus === 'inside'
      ? Color.RED.withAlpha(0.22)
      : fireStatus === 'proximity'
        ? Color.ORANGE.withAlpha(0.22)
        : Color.CYAN.withAlpha(0.15);
    const lineColor = fireStatus === 'inside'
      ? Color.RED.withAlpha(0.9)
      : fireStatus === 'proximity'
        ? Color.ORANGE.withAlpha(0.9)
        : Color.CYAN.withAlpha(0.8);

    const camPos  = Cartesian3.fromDegrees(camera.longitude, camera.latitude);
    const leftPos = Cartesian3.fromDegrees(left[0], left[1]);
    const rightPos = Cartesian3.fromDegrees(right[0], right[1]);

    return [
      new Entity({
        id: `wildfire-camera-fov-fill:${camera.id}`,
        polygon: {
          hierarchy: new PolygonHierarchy([camPos, leftPos, rightPos]),
          material: fillColor,
          clampToGround: true,
        } as any,
      }),
      new Entity({
        id: `wildfire-camera-fov-line:${camera.id}`,
        polyline: {
          positions: [camPos, leftPos, rightPos, camPos],
          width: 1.5,
          material: lineColor,
          clampToGround: true,
        } as any,
      }),
    ];
  }

  private createClusterEntity(cluster: CameraCluster): Entity {
    const entity = new Entity({
      id: `wildfire-camera-cluster:${cluster.id}`,
      name: `${cluster.cameras.length} wildfire cameras`,
      position: cluster.position,
      point: {
        pixelSize: Math.min(32, 14 + cluster.cameras.length),
        color: Color.DARKORANGE.withAlpha(0.88),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: String(cluster.cameras.length),
        font: 'bold 15px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      properties: { wildfireCluster: cluster, markerType: 'cluster' }
    });
    (entity as any).wildfireSelection = { cluster };
    return entity;
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
