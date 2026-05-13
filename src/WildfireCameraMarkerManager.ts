import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  HorizontalOrigin,
  LabelStyle,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer
} from 'cesium';
import type { CameraCluster, MarkerSelection, ResolvedWildfireCamera } from './types.js';

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

  refresh(): void {
    this.clear();
    const clusters = this.clusterVisibleCameras();
    const visible = clusters.slice(0, this.options.maximumVisibleMarkers);

    for (const cluster of visible) {
      const entity = cluster.cameras.length === 1
        ? this.createCameraEntity(cluster.cameras[0])
        : this.createClusterEntity(cluster);
      this.entities.push(entity);
      this.viewer.entities.add(entity);
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
        : `world:${Math.round(camera.longitude * 10)}:${Math.round(camera.latitude * 10)}`;
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
    const entity = new Entity({
      id: `wildfire-camera:${camera.id}`,
      name: camera.name,
      position: camera.position,
      point: {
        pixelSize: 12,
        color: Color.ORANGERED,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
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
