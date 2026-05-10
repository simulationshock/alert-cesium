import { Cartesian2, Cartesian3, Viewer } from 'cesium';
import { CameraPickerPanel } from './CameraPickerPanel.js';
import { FloatingCameraFeedCanvas, type FloatingCameraFeedOptions } from './FloatingCameraFeedCanvas.js';
import { WildfireCameraDataSource, type WildfireCameraDataSourceOptions } from './WildfireCameraDataSource.js';
import { WildfireCameraFlightController } from './WildfireCameraFlightController.js';
import { WildfireCameraMarkerManager, type MarkerManagerOptions } from './WildfireCameraMarkerManager.js';
import { WebXRSessionManager } from './WebXRSessionManager.js';
import type { CameraCluster, ResolvedWildfireCamera } from './types.js';

export interface WebXRWildfireCameraSandboxOptions {
  dataSource?: WildfireCameraDataSource | WildfireCameraDataSourceOptions;
  markers?: MarkerManagerOptions;
  feed?: FloatingCameraFeedOptions;
}

/** High-level wiring for the WebXR wildfire camera feature. */
export class WebXRWildfireCameraSandbox {
  readonly xr = new WebXRSessionManager();
  readonly dataSource: WildfireCameraDataSource;
  readonly markers: WildfireCameraMarkerManager;
  readonly feed: FloatingCameraFeedCanvas;
  readonly flights: WildfireCameraFlightController;
  private readonly picker: CameraPickerPanel;
  private cameras: ResolvedWildfireCamera[] = [];

  constructor(private readonly viewer: Viewer, options: WebXRWildfireCameraSandboxOptions = {}) {
    this.dataSource = options.dataSource instanceof WildfireCameraDataSource
      ? options.dataSource
      : new WildfireCameraDataSource(options.dataSource);
    this.feed = new FloatingCameraFeedCanvas(viewer, options.feed);
    this.flights = new WildfireCameraFlightController(viewer.camera);
    this.picker = new CameraPickerPanel(viewer.container as HTMLElement);
    this.markers = new WildfireCameraMarkerManager(viewer, {
      ...options.markers,
      onSelect: (selection) => {
        options.markers?.onSelect?.(selection);
        if (selection.camera) void this.selectCamera(selection.camera.id);
        if (selection.cluster) void this.handleClusterSelect(selection.cluster);
      }
    });
    this.patchXRSession();
  }

  async load(endpoint?: string): Promise<ResolvedWildfireCamera[]> {
    this.cameras = await this.dataSource.load(endpoint);
    this.markers.setCameras(this.cameras);
    return [...this.cameras];
  }

  async selectCamera(cameraId: string): Promise<void> {
    console.log('[Sandbox] selectCamera', cameraId);
    const camera = this.cameras.find((candidate) => candidate.id === cameraId);
    if (!camera) { console.warn('[Sandbox] camera not found:', cameraId); throw new Error(`Unknown wildfire camera: ${cameraId}`); }
    console.log('[Sandbox] camera found:', camera.name, 'imageUrl:', camera.imageUrl);
    const flightResult = await this.flights.flyToCamera(camera, { duration: 2.25, maximumHeight: 120000 });
    console.log('[Sandbox] flight result:', flightResult);
    const feedState = await this.feed.open(camera);
    console.log('[Sandbox] feed state:', feedState);
  }

  refreshMarkers(): void {
    this.markers.refresh();
  }

  destroy(): void {
    this.feed.close();
    this.markers.destroy();
    this.picker.destroy();
  }

  /**
   * Monkeypatches navigator.xr.requestSession so that every XR session
   * (including the one Cesium creates internally via the VR button) gets a
   * `select` event listener for gaze-based camera picking.
   */
  private patchXRSession(): void {
    const xr = (navigator as any).xr;
    if (!xr) return;

    const originalRequest = xr.requestSession.bind(xr) as (...args: unknown[]) => Promise<any>;
    xr.requestSession = async (...args: unknown[]): Promise<any> => {
      const session = await originalRequest(...args);
      session.addEventListener('select', () => this.handleXRSelect());
      return session;
    };
  }

  /** Called on XR controller trigger press — gaze-picks at canvas center. */
  private handleXRSelect(): void {
    const canvas = this.viewer.canvas;
    const center = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const picked = this.viewer.scene.pick(center);
    if (!picked?.id) return;

    const entity = picked.id;
    const sel = (entity as any).wildfireSelection as { camera?: ResolvedWildfireCamera; cluster?: CameraCluster } | undefined;
    if (!sel) return;

    if (sel.camera) void this.selectCamera(sel.camera.id);
    if (sel.cluster) void this.handleClusterSelect(sel.cluster);
  }

  private async handleClusterSelect(cluster: CameraCluster): Promise<void> {
    const spread = geographicSpreadDegrees(cluster.cameras);

    if (spread > 0.01) {
      // Cameras are geographically spread — fly in so they can uncluster naturally.
      const altitude = Math.max(8_000, Math.min(spread * 400_000, 300_000));
      this.viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(cluster.longitude, cluster.latitude, altitude),
      });
    } else {
      // Cameras are co-located (same tower / ridge) — show a picker.
      this.picker.open(cluster.cameras, (camera) => {
        void this.selectCamera(camera.id);
      });
    }
  }
}

/** Returns the diagonal of the bounding box of camera positions, in degrees. */
function geographicSpreadDegrees(cameras: ResolvedWildfireCamera[]): number {
  if (cameras.length <= 1) return 0;
  const lats = cameras.map(c => c.latitude);
  const lons = cameras.map(c => c.longitude);
  const latSpread = Math.max(...lats) - Math.min(...lats);
  const lonSpread = Math.max(...lons) - Math.min(...lons);
  return Math.sqrt(latSpread ** 2 + lonSpread ** 2);
}
