import type { Cartesian3 } from 'cesium';

export interface WildfireCamera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  height?: number;
  streamUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ResolvedWildfireCamera extends WildfireCamera {
  height: number;
  position: Cartesian3;
}

export interface CameraCluster {
  id: string;
  cameras: ResolvedWildfireCamera[];
  latitude: number;
  longitude: number;
  position: Cartesian3;
}

export type MarkerSelection =
  | { camera: ResolvedWildfireCamera; cluster?: never }
  | { cluster: CameraCluster; camera?: never };

export type FeedStatus = 'loading' | 'playing' | 'offline' | 'closed';

export interface FeedState {
  camera: ResolvedWildfireCamera;
  status: FeedStatus;
  message?: string;
}

export interface WildfireCameraLocation {
  id: string;
  name: string;
  position: Cartesian3;
  metadata?: Record<string, unknown>;
}

export interface CameraFlightOptions {
  duration?: number;
  maximumHeight?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  zoomToHeight?: number;
  skipIfAlreadyFocused?: boolean;
}

export type CameraFlightOutcome =
  | { status: 'completed'; cameraId?: string }
  | { status: 'skipped'; cameraId?: string; reason: 'already-focused' }
  | { status: 'redirected'; cameraId?: string; redirectedToId?: string }
  | { status: 'canceled'; cameraId?: string }
  | { status: 'invalid-destination'; cameraId?: string; reason: string };

export type CameraFlightStatus = 'idle' | 'active' | 'completed' | 'skipped' | 'redirected' | 'canceled' | 'invalid-destination';

export interface ResolvedCameraFlightOptions {
  duration: number;
  maximumHeight: number;
  heading?: number;
  pitch?: number;
  roll?: number;
}
