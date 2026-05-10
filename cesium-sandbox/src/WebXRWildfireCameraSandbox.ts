import { Viewer } from 'cesium';
import { FloatingCameraFeedCanvas } from './FloatingCameraFeedCanvas';
import { WildfireCameraDataSource, type WildfireCameraDataSourceOptions } from './WildfireCameraDataSource';
import { WildfireCameraFlightController } from './WildfireCameraFlightController';
import { WildfireCameraMarkerManager, type MarkerManagerOptions } from './WildfireCameraMarkerManager';
import { WebXRSessionManager } from './WebXRSessionManager';
import type { ResolvedWildfireCamera } from './types';

export interface WebXRWildfireCameraSandboxOptions {
  dataSource?: WildfireCameraDataSource | WildfireCameraDataSourceOptions;
  markers?: MarkerManagerOptions;
}

/** High-level wiring for the WebXR wildfire camera feature. */
export class WebXRWildfireCameraSandbox {
  readonly xr = new WebXRSessionManager();
  readonly dataSource: WildfireCameraDataSource;
  readonly markers: WildfireCameraMarkerManager;
  readonly feed: FloatingCameraFeedCanvas;
  readonly flights: WildfireCameraFlightController;
  private cameras: ResolvedWildfireCamera[] = [];

  constructor(private readonly viewer: Viewer, options: WebXRWildfireCameraSandboxOptions = {}) {
    this.dataSource = options.dataSource instanceof WildfireCameraDataSource
      ? options.dataSource
      : new WildfireCameraDataSource(options.dataSource);
    this.feed = new FloatingCameraFeedCanvas(viewer);
    this.flights = new WildfireCameraFlightController(viewer.camera);
    this.markers = new WildfireCameraMarkerManager(viewer, {
      ...options.markers,
      onSelect: (selection) => {
        options.markers?.onSelect?.(selection);
        if (selection.camera) void this.selectCamera(selection.camera.id);
      }
    });
  }

  async load(endpoint?: string): Promise<ResolvedWildfireCamera[]> {
    this.cameras = await this.dataSource.load(endpoint);
    this.markers.setCameras(this.cameras);
    return [...this.cameras];
  }

  async selectCamera(cameraId: string): Promise<void> {
    const camera = this.cameras.find((candidate) => candidate.id === cameraId);
    if (!camera) throw new Error(`Unknown wildfire camera: ${cameraId}`);
    await this.flights.flyToCamera(camera, { duration: 2.25, maximumHeight: 120000 });
    await this.feed.open(camera);
  }

  refreshMarkers(): void {
    this.markers.refresh();
  }

  destroy(): void {
    this.feed.close();
    this.markers.clear();
  }
}
