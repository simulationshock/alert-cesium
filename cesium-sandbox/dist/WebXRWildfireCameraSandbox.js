import { FloatingCameraFeedCanvas } from './FloatingCameraFeedCanvas.js';
import { WildfireCameraDataSource } from './WildfireCameraDataSource.js';
import { WildfireCameraFlightController } from './WildfireCameraFlightController.js';
import { WildfireCameraMarkerManager } from './WildfireCameraMarkerManager.js';
import { WebXRSessionManager } from './WebXRSessionManager.js';
/** High-level wiring for the WebXR wildfire camera feature. */
export class WebXRWildfireCameraSandbox {
    constructor(viewer, options = {}) {
        this.viewer = viewer;
        this.xr = new WebXRSessionManager();
        this.cameras = [];
        this.dataSource = options.dataSource instanceof WildfireCameraDataSource
            ? options.dataSource
            : new WildfireCameraDataSource(options.dataSource);
        this.feed = new FloatingCameraFeedCanvas(viewer);
        this.flights = new WildfireCameraFlightController(viewer.camera);
        this.markers = new WildfireCameraMarkerManager(viewer, {
            ...options.markers,
            onSelect: (selection) => {
                options.markers?.onSelect?.(selection);
                if (selection.camera)
                    void this.selectCamera(selection.camera.id);
            }
        });
    }
    async load(endpoint) {
        this.cameras = await this.dataSource.load(endpoint);
        this.markers.setCameras(this.cameras);
        return [...this.cameras];
    }
    async selectCamera(cameraId) {
        const camera = this.cameras.find((candidate) => candidate.id === cameraId);
        if (!camera)
            throw new Error(`Unknown wildfire camera: ${cameraId}`);
        await this.flights.flyToCamera(camera, { duration: 2.25, maximumHeight: 120000 });
        await this.feed.open(camera);
    }
    refreshMarkers() {
        this.markers.refresh();
    }
    destroy() {
        this.feed.close();
        this.markers.clear();
    }
}
//# sourceMappingURL=WebXRWildfireCameraSandbox.js.map