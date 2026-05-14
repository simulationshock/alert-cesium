import { Cartesian2, Cartesian3, Viewer } from 'cesium';
import { CameraPickerPanel } from './CameraPickerPanel.js';
import { FireIncidentOverlay } from './FireIncidentOverlay.js';
import { FloatingCameraFeedCanvas, type FloatingCameraFeedOptions } from './FloatingCameraFeedCanvas.js';
import { WildfireCameraDataSource, type WildfireCameraDataSourceOptions } from './WildfireCameraDataSource.js';
import { WildfireCameraFlightController } from './WildfireCameraFlightController.js';
import { WildfireCameraMarkerManager, type MarkerManagerOptions } from './WildfireCameraMarkerManager.js';
import { WebXRSessionManager } from './WebXRSessionManager.js';
import type { CameraCluster, FeedState, FireIncidentOverlayOptions, ResolvedWildfireCamera } from './types.js';

export interface WebXRWildfireCameraSandboxOptions {
  dataSource?: WildfireCameraDataSource | WildfireCameraDataSourceOptions;
  markers?: MarkerManagerOptions;
  feed?: FloatingCameraFeedOptions;
  fireOverlay?: FireIncidentOverlay | FireIncidentOverlayOptions;
}

/** High-level wiring for the WebXR wildfire camera feature. */
export class WebXRWildfireCameraSandbox {
  readonly xr = new WebXRSessionManager();
  readonly dataSource: WildfireCameraDataSource;
  readonly markers: WildfireCameraMarkerManager;
  readonly feed: FloatingCameraFeedCanvas;
  readonly flights: WildfireCameraFlightController;
  readonly fireOverlay: FireIncidentOverlay | undefined;
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
    if (options.fireOverlay instanceof FireIncidentOverlay) {
      this.fireOverlay = options.fireOverlay;
    } else if (options.fireOverlay !== undefined) {
      this.fireOverlay = new FireIncidentOverlay(viewer, { ...options.fireOverlay, markers: this.markers });
    }
    // Remove frustum highlight when the user closes the feed panel.
    this.feed.addEventListener('feedstate', (e: Event) => {
      if ((e as CustomEvent<FeedState>).detail.status === 'closed') {
        this.markers.setSelectedCamera(null);
      }
    });
    this.patchXRSession();
  }

  async load(endpoint?: string): Promise<ResolvedWildfireCamera[]> {
    this.cameras = await this.dataSource.load(endpoint);
    this.markers.setCameras(this.cameras);
    await this.fireOverlay?.load();
    return [...this.cameras];
  }

  async selectCamera(cameraId: string): Promise<void> {
    const camera = this.cameras.find((candidate) => candidate.id === cameraId);
    if (!camera) throw new Error(`Unknown wildfire camera: ${cameraId}`);
    // Fly to a birds-eye position that frames the camera's FOV frustum rather
    // than landing right on top of the camera at ground level.
    const viewpoint = frustumBirdsEyeViewpoint(camera);
    await this.flights.flyToCamera(
      { ...camera, position: viewpoint },
      { duration: 2.25, maximumHeight: 120_000 }
    );
    // open() calls close() internally first, which fires the 'feedstate: closed'
    // event that would clear any previous selection highlight. Set the new
    // highlight after open() so it is never immediately wiped by that event.
    await this.feed.open(camera);
    this.markers.setSelectedCamera(camera);
  }

  refreshMarkers(): void {
    this.markers.refresh();
  }

  destroy(): void {
    this.feed.close();
    this.markers.destroy();
    this.picker.destroy();
    this.fireOverlay?.destroy();
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

/**
 * Returns a Cartesian3 position overhead the camera's FOV frustum at an altitude
 * that frames the full frustum with a comfortable margin. Falls back to a modest
 * birds-eye altitude when no FOV data is available.
 */
function frustumBirdsEyeViewpoint(camera: ResolvedWildfireCamera): Cartesian3 {
  let left  = camera.fovLeft;
  let right = camera.fovRight;

  // Synthesise FOV corners from azimuth + fieldOfView when the raw corners are absent.
  if ((!left || !right) && camera.azimuth !== undefined && camera.fieldOfView !== undefined) {
    const rangeDeg = 15 / 111;
    const halfFov  = (camera.fieldOfView / 2) * (Math.PI / 180);
    const az       = camera.azimuth * (Math.PI / 180);
    const cosLat   = Math.cos(camera.latitude * (Math.PI / 180));
    left  = [camera.longitude + (rangeDeg * Math.sin(az - halfFov)) / cosLat,
             camera.latitude  +  rangeDeg * Math.cos(az - halfFov)];
    right = [camera.longitude + (rangeDeg * Math.sin(az + halfFov)) / cosLat,
             camera.latitude  +  rangeDeg * Math.cos(az + halfFov)];
  }

  const lons: number[] = [camera.longitude];
  const lats: number[] = [camera.latitude];
  if (left)  { lons.push(left[0]);  lats.push(left[1]); }
  if (right) { lons.push(right[0]); lats.push(right[1]); }

  const west  = Math.min(...lons),  east  = Math.max(...lons);
  const south = Math.min(...lats),  north = Math.max(...lats);

  const extentDeg    = Math.max(east - west, north - south);
  const extentMeters = extentDeg * 111_320;
  // At Cesium's ~60° vertical FOV, visible ground = altitude × tan(30°) × 2 ≈ altitude.
  // Multiply by 1.8 to add margin; minimum 2 km for cameras without FOV data.
  const altitude = lons.length === 1 ? 4_000 : Math.max(extentMeters * 1.8, 2_000);

  return Cartesian3.fromDegrees((west + east) / 2, (south + north) / 2, altitude);
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
