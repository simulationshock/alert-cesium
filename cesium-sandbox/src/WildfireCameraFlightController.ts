import { Camera, Cartesian3 } from 'cesium';
import { CameraFlight } from './CameraFlight.js';
import type { CameraFlightOptions, CameraFlightOutcome, CameraFlightStatus, WildfireCameraLocation } from './types.js';

const DEFAULT_FOCUS_DISTANCE_METERS = 25;

/**
 * High-level wildfire camera selection controller.
 *
 * Latest valid selection wins; invalid selections are no-ops and do not mutate the selected camera.
 */
export class WildfireCameraFlightController {
  private camera: Camera;
  private cameraFlight: CameraFlight;
  private selectedCamera: WildfireCameraLocation | null = null;
  private selectedAt: number | null = null;

  constructor(camera: Camera) {
    this.camera = camera;
    this.cameraFlight = new CameraFlight(camera);
  }

  /**
   * Fly to a specific wildfire camera location with parabolic animation.
   */
  async flyToCamera(cameraData: WildfireCameraLocation, options: CameraFlightOptions = {}): Promise<CameraFlightOutcome> {
    const validationError = this.validateCamera(cameraData);
    if (validationError) {
      return {
        status: 'invalid-destination',
        cameraId: cameraData?.id,
        reason: validationError
      };
    }

    const currentPosition = Cartesian3.clone(this.camera.position, new Cartesian3());
    const distance = Cartesian3.distance(currentPosition, cameraData.position);
    const skipIfAlreadyFocused = options.skipIfAlreadyFocused !== false;

    this.selectedCamera = cameraData;
    this.selectedAt = performance.now();

    if (skipIfAlreadyFocused && distance <= DEFAULT_FOCUS_DISTANCE_METERS) {
      return {
        status: 'skipped',
        cameraId: cameraData.id,
        reason: 'already-focused'
      };
    }

    const outcome = await this.cameraFlight.flyTo(cameraData.position, {
      ...options,
      cameraId: cameraData.id
    });

    if (outcome.status === 'completed') {
      this.selectedCamera = cameraData;
    }

    return outcome;
  }

  /**
   * Fly to multiple camera locations in sequence. Reuses the same latest-selection semantics for each step.
   */
  async flyToCameras(
    cameraLocations: Array<Pick<WildfireCameraLocation, 'position' | 'metadata'> & Partial<Pick<WildfireCameraLocation, 'id' | 'name'>>>,
    options: CameraFlightOptions & { delayBetweenFlights?: number } = {}
  ): Promise<CameraFlightOutcome[]> {
    const delay = Number.isFinite(options.delayBetweenFlights) ? Math.max(options.delayBetweenFlights ?? 0, 0) : 1000;
    const outcomes: CameraFlightOutcome[] = [];

    for (let i = 0; i < cameraLocations.length; i++) {
      const camera = cameraLocations[i];
      const outcome = await this.flyToCamera({
        id: camera.id ?? `camera-${i}`,
        name: camera.name ?? `Camera ${i + 1}`,
        position: camera.position,
        metadata: camera.metadata
      }, options);
      outcomes.push(outcome);

      if (outcome.status === 'canceled' || outcome.status === 'redirected') {
        break;
      }

      if (i < cameraLocations.length - 1 && delay > 0) {
        await this.delay(delay);
      }
    }

    return outcomes;
  }

  /**
   * Get the latest valid selected camera.
   */
  getSelectedCamera(): WildfireCameraLocation | null {
    return this.selectedCamera;
  }

  getSelectedAt(): number | null {
    return this.selectedAt;
  }

  getStatus(): CameraFlightStatus {
    return this.cameraFlight.isFlightActive() ? 'active' : 'idle';
  }

  /**
   * Cancel any active flight without snapping the current viewpoint.
   */
  cancelFlight(): CameraFlightOutcome | null {
    return this.cameraFlight.cancelFlight();
  }

  private validateCamera(cameraData: WildfireCameraLocation): string | null {
    if (!cameraData || typeof cameraData !== 'object') {
      return 'Camera destination is required';
    }

    if (typeof cameraData.id !== 'string' || cameraData.id.trim().length === 0) {
      return 'Camera id must be a non-empty string';
    }

    if (!CameraFlight.isValidCartesian(cameraData.position)) {
      return 'Camera position must be a finite non-zero Cartesian3';
    }

    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
