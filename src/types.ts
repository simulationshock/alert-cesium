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
  /** Current pan bearing in degrees clockwise from north (0–360). */
  azimuth?: number;
  /** Horizontal field of view in degrees. */
  fieldOfView?: number;
  /** [lon, lat] of the left FOV edge at current zoom. */
  fovLeft?: [number, number];
  /** [lon, lat] of the right FOV edge at current zoom. */
  fovRight?: [number, number];
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

// --- Fire Incident Overlay types ---

export type FireProximityStatus = 'inside' | 'proximity';

export interface FireIncident {
  id: string;
  name: string;
  county?: string;
  acresBurned?: number;
  percentContained?: number;
  dateUpdated?: Date;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
  boundingBox: { west: number; south: number; east: number; north: number };
}

export type FireOverlayStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface FireOverlayLoadResult {
  status: 'loaded' | 'error';
  incidentCount: number;
  highlightedCameraCount: number;
  error?: Error;
}

/** Structural interface for any marker manager that supports fire proximity highlighting. */
export interface FireHighlightTarget {
  setFireHighlights(highlights: Map<string, FireProximityStatus>): void;
  getCameras(): ResolvedWildfireCamera[];
}

export interface FireIncidentOverlayOptions {
  /** GeoJSON endpoint URL. Defaults to NIFC/IRWIN Active Fires FeatureServer. */
  endpoint?: string;
  /** Camera proximity threshold in kilometers. Defaults to 5. */
  proximityThresholdKm?: number;
  /** Refresh interval in milliseconds. Defaults to 300_000 (5 min). Set to 0 to disable. */
  refreshIntervalMs?: number;
  /** Whether to inject a toggle button into viewer.container. Defaults to true. */
  showToggleButton?: boolean;
  /** Marker manager reference for fire proximity highlighting. */
  markers?: FireHighlightTarget;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetcher?: typeof fetch;
}

// --- Live Flight types ---

export type AircraftKind = 'plane' | 'helicopter';

export interface FlightPoint {
  longitude: number;
  latitude: number;
  altitude: number;   // metres above sea level
  heading: number;    // degrees CW from north
  speed: number;      // m/s
  timestamp: number;  // Date.now() ms
}

export interface LiveFlight {
  icao24: string;
  callsign: string;
  originCountry: string;
  longitude: number;
  latitude: number;
  altitude: number;   // barometric altitude, metres
  speed: number;      // m/s
  heading: number;    // degrees CW from north
  verticalRate: number; // m/s, positive = climbing
  kind: AircraftKind;
}

export interface FlightCircle {
  lat: number;
  lon: number;
  /** Radius in nautical miles (max 250 per adsb.fi API). */
  nm: number;
}

export interface LiveFlightDataSourceOptions {
  /** Bounding box [west, south, east, north]. Defaults to California. */
  bbox?: [number, number, number, number];
  /**
   * Explicit query circles. When provided, overrides bbox.
   * Use multiple circles to cover regions wider than 250 nm.
   */
  circles?: FlightCircle[];
  /** Poll interval in ms. Defaults to 15 000. */
  refreshIntervalMs?: number;
  /** How long to keep track history. Defaults to 3 600 000 (1 hr). */
  trackDurationMs?: number;
  fetcher?: typeof fetch;
  /** Base URL of the CORS proxy server (e.g. 'https://current-01.simulationshock.com'). */
  proxyUrl?: string | null;
}

export interface LiveFlightMarkerManagerOptions {
  /** Camera altitude above which markers are hidden. Defaults to 2 000 000 m. */
  visibilityMaxAltitude?: number;
  onSelect?: (flight: LiveFlight | null) => void;
}

// --- Public Webcam types ---

export interface PublicWebcam {
  id: string;
  title: string;
  city?: string;
  region?: string;
  latitude: number;
  longitude: number;
  status?: string;
  /** Refreshing still-image URL (changes periodically). */
  previewUrl?: string;
  /** Static thumbnail URL. */
  thumbnailUrl?: string;
  /** Iframe embed URL for the live player. */
  playerUrl?: string;
  /** Link to the webcam detail page. */
  detailUrl?: string;
}

export interface ResolvedPublicWebcam extends PublicWebcam {
  position: Cartesian3;
}

// --- Emergency Radio types ---

export type RadioCategory = 'law' | 'fire' | 'ems' | 'multi' | 'aircraft' | 'other';

export interface EmergencyRadioFeed {
  id: string;
  name: string;
  county?: string;
  latitude: number;
  longitude: number;
  category: RadioCategory;
  /** Direct audio stream URL (e.g. Broadcastify CDN). */
  streamUrl?: string;
  /** Broadcastify web player URL. */
  webUrl?: string;
  listeners?: number;
}

export interface ResolvedEmergencyRadioFeed extends EmergencyRadioFeed {
  position: Cartesian3;
}
