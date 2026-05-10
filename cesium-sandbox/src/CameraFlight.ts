import { Camera, Cartesian3, Math as CesiumMath } from 'cesium';
import type { CameraFlightOptions, CameraFlightOutcome, ResolvedCameraFlightOptions } from './types';

const MIN_DURATION_SECONDS = 0.35;
const MAX_DURATION_SECONDS = 4.0;
const MIN_ARC_HEIGHT_METERS = 0;
const MAX_ARC_HEIGHT_METERS = 2_500_000;
const DEFAULT_NEAR_DISTANCE_METERS = 1_000;
const DEFAULT_FAR_DISTANCE_METERS = 6_000_000;
const MIN_VALID_RADIUS_METERS = 1;

type ActiveFlight = {
  token: number;
  cameraId?: string;
  animationId: number | null;
  resolve: (outcome: CameraFlightOutcome) => void;
};

type InternalFlightOptions = CameraFlightOptions & {
  cameraId?: string;
  redirectedToId?: string;
};

/**
 * Parabolic camera flight animation for smooth transitions between wildfire camera locations.
 */
export class CameraFlight {
  private camera: Camera;
  private activeFlight: ActiveFlight | null = null;
  private nextToken = 1;

  constructor(camera: Camera) {
    this.camera = camera;
  }

  /**
   * Fly to a target position using a distance-aware parabolic path.
   */
  flyTo(targetPosition: Cartesian3, options: InternalFlightOptions = {}): Promise<CameraFlightOutcome> {
    if (!CameraFlight.isValidCartesian(targetPosition)) {
      return Promise.resolve({
        status: 'invalid-destination',
        cameraId: options.cameraId,
        reason: 'Target position must be a finite non-zero Cartesian3'
      });
    }

    if (this.activeFlight) {
      this.finishActiveFlight({
        status: 'redirected',
        cameraId: this.activeFlight.cameraId,
        redirectedToId: options.cameraId ?? options.redirectedToId
      });
    }

    const startPosition = Cartesian3.clone(this.camera.position, new Cartesian3());
    if (!CameraFlight.isValidCartesian(startPosition)) {
      return Promise.resolve({
        status: 'invalid-destination',
        cameraId: options.cameraId,
        reason: 'Current camera position is not usable for flight navigation'
      });
    }

    const distance = Cartesian3.distance(startPosition, targetPosition);
    const resolvedOptions = this.resolveOptions(distance, options);
    const startOrientation = {
      heading: this.camera.heading,
      pitch: this.camera.pitch,
      roll: this.camera.roll
    };
    const targetOrientation = {
      heading: options.heading ?? startOrientation.heading,
      pitch: options.pitch ?? startOrientation.pitch,
      roll: options.roll ?? startOrientation.roll
    };
    const startTime = performance.now();
    const token = this.nextToken++;

    return new Promise<CameraFlightOutcome>((resolve) => {
      this.activeFlight = {
        token,
        cameraId: options.cameraId,
        animationId: null,
        resolve
      };

      const animate = (currentTime: number) => {
        if (!this.activeFlight || this.activeFlight.token !== token) {
          return;
        }

        const elapsedSeconds = (currentTime - startTime) / 1000;
        const progress = Math.min(elapsedSeconds / resolvedOptions.duration, 1);
        const easedProgress = this.easeInOutCubic(progress);

        if (progress >= 1) {
          this.camera.setView({
            destination: targetPosition,
            orientation: targetOrientation
          });
          this.finishActiveFlight({ status: 'completed', cameraId: options.cameraId });
          return;
        }

        const currentPosition = this.calculateParabolicPosition(
          startPosition,
          targetPosition,
          resolvedOptions.maximumHeight,
          easedProgress
        );

        this.camera.setView({
          destination: currentPosition,
          orientation: {
            heading: this.interpolateAngle(startOrientation.heading, targetOrientation.heading, easedProgress),
            pitch: this.interpolateAngle(startOrientation.pitch, targetOrientation.pitch, easedProgress),
            roll: this.interpolateAngle(startOrientation.roll, targetOrientation.roll, easedProgress)
          }
        });

        const frameId = requestAnimationFrame(animate);
        if (this.activeFlight?.token === token) {
          this.activeFlight.animationId = frameId;
        } else {
          cancelAnimationFrame(frameId);
        }
      };

      const frameId = requestAnimationFrame(animate);
      if (this.activeFlight?.token === token) {
        this.activeFlight.animationId = frameId;
      } else {
        cancelAnimationFrame(frameId);
      }
    });
  }

  /**
   * Cancel current flight animation without mutating the current camera pose.
   */
  cancelFlight(): CameraFlightOutcome | null {
    if (!this.activeFlight) {
      return null;
    }

    const outcome: CameraFlightOutcome = {
      status: 'canceled',
      cameraId: this.activeFlight.cameraId
    };
    this.finishActiveFlight(outcome);
    return outcome;
  }

  /**
   * Check if camera is currently flying.
   */
  isFlightActive(): boolean {
    return this.activeFlight !== null;
  }

  getStatus(): 'idle' | 'active' {
    return this.activeFlight ? 'active' : 'idle';
  }

  static isValidCartesian(position: unknown): position is Cartesian3 {
    if (!position || typeof position !== 'object') {
      return false;
    }

    const candidate = position as Partial<Cartesian3>;
    return (
      Number.isFinite(candidate.x) &&
      Number.isFinite(candidate.y) &&
      Number.isFinite(candidate.z) &&
      Math.sqrt((candidate.x ?? 0) ** 2 + (candidate.y ?? 0) ** 2 + (candidate.z ?? 0) ** 2) > MIN_VALID_RADIUS_METERS
    );
  }

  static resolveDistanceAwareOptions(distanceMeters: number, options: CameraFlightOptions = {}): ResolvedCameraFlightOptions {
    const distanceRatio = CameraFlight.clamp(
      (distanceMeters - DEFAULT_NEAR_DISTANCE_METERS) / (DEFAULT_FAR_DISTANCE_METERS - DEFAULT_NEAR_DISTANCE_METERS),
      0,
      1
    );

    const defaultDuration = 0.6 + distanceRatio * 2.9;
    const defaultArcHeight = Math.min(Math.max(distanceMeters * 0.22, 2_500), 1_500_000);

    return {
      duration: CameraFlight.clampFinite(options.duration, defaultDuration, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS),
      maximumHeight: CameraFlight.clampFinite(options.maximumHeight, defaultArcHeight, MIN_ARC_HEIGHT_METERS, MAX_ARC_HEIGHT_METERS),
      heading: Number.isFinite(options.heading) ? options.heading : undefined,
      pitch: Number.isFinite(options.pitch) ? options.pitch : undefined,
      roll: Number.isFinite(options.roll) ? options.roll : undefined
    };
  }

  private resolveOptions(distanceMeters: number, options: CameraFlightOptions): ResolvedCameraFlightOptions {
    return CameraFlight.resolveDistanceAwareOptions(distanceMeters, options);
  }

  private finishActiveFlight(outcome: CameraFlightOutcome): void {
    const flight = this.activeFlight;
    if (!flight) {
      return;
    }

    if (flight.animationId !== null) {
      cancelAnimationFrame(flight.animationId);
    }

    this.activeFlight = null;
    flight.resolve(outcome);
  }

  /**
   * Smooth acceleration/deceleration without abrupt stops.
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Calculate position along a parabolic path between two points.
   */
  private calculateParabolicPosition(start: Cartesian3, end: Cartesian3, maximumHeight: number, progress: number): Cartesian3 {
    const linearPosition = Cartesian3.lerp(start, end, progress, new Cartesian3());
    const normalSource = CameraFlight.isValidCartesian(linearPosition) ? linearPosition : Cartesian3.midpoint(start, end, new Cartesian3());
    const surfaceNormal = Cartesian3.normalize(normalSource, new Cartesian3());
    const height = Math.sin(progress * Math.PI) * maximumHeight;
    const heightOffset = Cartesian3.multiplyByScalar(surfaceNormal, height, new Cartesian3());

    return Cartesian3.add(linearPosition, heightOffset, new Cartesian3());
  }

  /**
   * Interpolate angle values while handling wraparound.
   */
  private interpolateAngle(startAngle: number, endAngle: number, progress: number): number {
    let start = startAngle;
    let end = endAngle;

    while (end - start > Math.PI) {
      end -= CesiumMath.TWO_PI;
    }
    while (end - start < -Math.PI) {
      end += CesiumMath.TWO_PI;
    }

    return start + (end - start) * progress;
  }

  private static clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
    return CameraFlight.clamp(Number.isFinite(value) ? (value as number) : fallback, min, max);
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
