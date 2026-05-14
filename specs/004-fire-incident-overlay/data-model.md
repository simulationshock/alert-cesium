# Data Model: Live Fire Incident Overlay

**Feature**: 004-fire-incident-overlay  
**Date**: 2026-05-13

## Entities

### FireIncident

Represents a single active wildfire incident as returned by the data source.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | Yes | Unique identifier; derived from feature ID or `IncidentName` slug |
| `name` | `string` | Yes | Human-readable incident name (e.g., "Highland Fire") |
| `acresBurned` | `number \| undefined` | No | GIS-computed acres; may be absent for new incidents |
| `percentContained` | `number \| undefined` | No | 0–100; may be absent |
| `dateUpdated` | `Date \| undefined` | No | Last data update timestamp from source |
| `geometry` | `GeoJSON.Polygon \| GeoJSON.MultiPolygon` | Yes | The perimeter boundary; WGS84 coordinates |
| `boundingBox` | `{ west, south, east, north: number }` | Yes | Derived from geometry; used for fast proximity pre-filter |

**Validation rules**:
- `geometry.coordinates` must be a non-empty array; features with missing or empty coordinate arrays are skipped silently (FR-010).
- `id` is normalized: if the source has no unique ID field, a slug is derived from `name` + index.

---

### FireProximity

A computed association between a camera and its nearest fire incident.

| Field | Type | Notes |
|-------|------|-------|
| `cameraId` | `string` | ID of the `ResolvedWildfireCamera` |
| `incidentId` | `string` | ID of the nearest `FireIncident` |
| `status` | `'inside' \| 'proximity'` | `'inside'`: camera falls within the perimeter polygon; `'proximity'`: within threshold but outside |
| `distanceKm` | `number \| undefined` | Approximate Haversine distance to nearest perimeter vertex; `undefined` for `'inside'` |

This entity is ephemeral — recomputed each time fire data refreshes. It is never persisted.

---

### FireOverlayState (internal)

Runtime state of the `FireIncidentOverlay` instance.

| Field | Type | Notes |
|-------|------|-------|
| `status` | `FireOverlayStatus` | Current lifecycle state |
| `incidents` | `FireIncident[]` | Last successfully loaded incidents |
| `highlights` | `Map<string, 'inside' \| 'proximity'>` | Camera ID → proximity status; passed to marker manager |
| `lastFetchedAt` | `Date \| undefined` | Timestamp of the last successful fetch |
| `lastError` | `Error \| undefined` | Most recent fetch/parse error; `undefined` when nominal |
| `visible` | `boolean` | Whether the overlay polygons are currently shown |

---

## Types to add to `src/types.ts`

```typescript
export type FireProximityStatus = 'inside' | 'proximity';

export interface FireIncident {
  id: string;
  name: string;
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

export interface FireIncidentOverlayOptions {
  /** GeoJSON endpoint URL. Defaults to NIFC/IRWIN Active Fires FeatureServer. */
  endpoint?: string;
  /** Camera proximity threshold in kilometers. Defaults to 5. */
  proximityThresholdKm?: number;
  /** Refresh interval in milliseconds. Defaults to 300_000 (5 minutes). Set to 0 to disable. */
  refreshIntervalMs?: number;
  /** Whether to inject a toggle button into viewer.container. Defaults to true. */
  showToggleButton?: boolean;
  /** Reference to the marker manager for fire proximity highlighting. Optional. */
  markers?: import('./WildfireCameraMarkerManager.js').WildfireCameraMarkerManager;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetcher?: typeof fetch;
}
```

---

## State Transitions

```
                          load() called
idle ────────────────────────────────────► loading
                                              │
                              fetch succeeds  │  fetch fails
                         ┌────────────────────┼───────────────────────┐
                         ▼                                             ▼
                       loaded ◄──── auto-refresh (setInterval) ────► error
                         │                                             │
                         │  (next refresh)                             │  (next refresh)
                         └───────────────────────────────────────────►┘
                                         loading

Notes:
- destroy() clears the interval and moves to a terminal state regardless of current status.
- toggle (setVisible) does not change status; it only shows/hides the Cesium DataSource.
- If a refresh fails, status becomes 'error' but previously loaded data stays visible.
```

---

## Coordinate System

All geometry coordinates are WGS84 decimal degrees (longitude, latitude), matching Cesium's `Cartesian3.fromDegrees()` convention and the GeoJSON specification (lon, lat order). Proximity computations use degrees for bounding box arithmetic and convert to kilometers using the Haversine formula with Earth radius 6371 km.
