import {
  Cartesian2,
  Cartesian3,
  Color,
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
  private readonly onMoveEnd: () => void;
  private readonly onCameraChanged: () => void;
  private readonly clickHandler: ScreenSpaceEventHandler;

  constructor(viewer: Viewer, options: MarkerManagerOptions = {}) {
    this.viewer = viewer;
    this.options = {
      clusterPixelSize: options.clusterPixelSize ?? 72,
      maximumVisibleMarkers: options.maximumVisibleMarkers ?? 250,
      onSelect: options.onSelect
    };
    this.onMoveEnd = () => this.refresh();
    this.onCameraChanged = () => this.refresh();
    this.viewer.camera.moveEnd.addEventListener(this.onMoveEnd);
    this.viewer.camera.changed.addEventListener(this.onCameraChanged);

    this.clickHandler = new ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.clickHandler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = this.viewer.scene.pick(event.position);
      console.log('[MarkerManager] click picked:', picked);
      const entity: Entity | undefined = picked?.id instanceof Entity ? picked.id : undefined;
      console.log('[MarkerManager] entity:', entity?.id, 'selection:', (entity as any)?.wildfireSelection);

      if (!entity) return;
      const selection: MarkerSelection | undefined = (entity as any).wildfireSelection;
      if (selection) {
        console.log('[MarkerManager] firing onSelect with:', selection);
        this.options.onSelect?.(selection);
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
      if (cluster.cameras.length <= 4) {
        for (const camera of cluster.cameras) {
          for (const fovEntity of this.createFovEntities(camera)) {
            this.entities.push(fovEntity);
            this.viewer.entities.add(fovEntity);
          }
        }
      }
      if (cluster.cameras.length === 1) {
        const entity = this.createCameraEntity(cluster.cameras[0]!);
        this.entities.push(entity);
        this.viewer.entities.add(entity);
      } else {
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
    this.viewer.camera.moveEnd.removeEventListener(this.onMoveEnd);
    this.viewer.camera.changed.removeEventListener(this.onCameraChanged);
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

  private clusterVisibleCameras(): CameraCluster[] {
    const buckets = new Map<string, ResolvedWildfireCamera[]>();
    const scene = this.viewer.scene;

    for (const camera of this.cameras) {
      const screen = SceneTransforms.worldToWindowCoordinates(scene, camera.position, new Cartesian2());
      const key = screen
        ? `${Math.floor(screen.x / this.options.clusterPixelSize)}:${Math.floor(screen.y / this.options.clusterPixelSize)}`
        : `offscreen:${camera.id}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(camera);
      buckets.set(key, bucket);
    }

    return [...buckets.entries()].map(([id, bucket]) => this.createCluster(id, bucket));
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
        font: '14px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cartesian2(0, -22),
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
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
