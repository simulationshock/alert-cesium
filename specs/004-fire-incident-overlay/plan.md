# Implementation Plan: Live Fire Incident Overlay

**Branch**: `004-fire-incident-overlay` | **Date**: 2026-05-13 | **Spec**: `specs/004-fire-incident-overlay/spec.md`  
**Input**: Feature specification from `specs/004-fire-incident-overlay/spec.md`

## Summary

Add a `FireIncidentOverlay` class to the library that fetches active wildfire perimeter polygons from the NIFC/IRWIN ArcGIS FeatureServer (GeoJSON, no auth), renders them on the Cesium globe via `GeoJsonDataSource`, highlights camera markers that fall within or near fire perimeters, auto-refreshes on a configurable interval (default 5 minutes), and provides a toggle button UI. The implementation augments `WildfireCameraMarkerManager` with fire-proximity highlight state and wires the overlay into `WebXRWildfireCameraSandbox` as an optional composable.

## Technical Context

**Language/Version**: TypeScript 5.9.3, targeting the existing `tsconfig.json`  
**Primary Dependencies**: Cesium `^1.120.0` (`GeoJsonDataSource`, `Color`, `Viewer`, `DataSource`); browser `fetch` API; `setInterval`/`clearInterval`  
**Storage**: In-memory only; fire data is never persisted  
**Testing**: `npm run build` (`tsc --noEmit`) as the correctness gate; manual browser verification for visual rendering  
**Target Platform**: Browser-based Cesium globe application  
**Project Type**: TypeScript library module  
**Performance Goals**: Initial overlay render within 2 s of `load()` call; auto-refresh completes within 5 s; proximity computation adds < 50 ms per refresh cycle at 250 cameras × 100 fire perimeters  
**Constraints**: No Node.js-only APIs in `src/`; no new third-party runtime dependencies; must not interfere with existing camera flight, XR, auth, or marker rendering behavior  
**Scale/Scope**: ~100–500 fire perimeter polygons; ~250 camera markers maximum (existing cap)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Browser-First Module Architecture**: `FireIncidentOverlay` lives in `src/`. It uses browser `fetch` and Cesium — both browser-compatible. No `fs`, `path`, `http`, or `crypto`. PASS.
- **II. Immersive Comfort and Safety**: This feature adds only a polygon overlay and marker color changes. It does not touch camera motion, `flyTo`, or XR session entry/exit. PASS.
- **III. Explicit Outcome Contracts**: `load()` returns a typed `FireOverlayLoadResult` (`'loaded' | 'error'`), enabling callers to branch on outcome without inspecting internal state. PASS.
- **IV. Concern Isolation**: The new concern is "fire incident visualization." This feature explicitly rejects any changes to: camera flight navigation, OAuth2 auth, XR session management, or live video feed playback. The augmentation to `WildfireCameraMarkerManager` (adding `setFireHighlights()`) is additive and does not change existing behavior when no highlights are set. PASS.
- **V. Build-First Validation**: All changes pass `tsc --noEmit`. No auth or XR flight paths are touched, so no Playwright e2e updates are required. PASS.

**Gate status**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-fire-incident-overlay/
├── plan.md               # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── fire-incident-overlay.md  # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code

```text
src/
├── FireIncidentOverlay.ts           # NEW — main overlay class
├── types.ts                         # MODIFIED — add FireIncident, FireOverlayStatus, FireOverlayLoadResult, FireIncidentOverlayOptions, FireProximityStatus
├── WildfireCameraMarkerManager.ts   # MODIFIED — add setFireHighlights() method; update createCameraEntity() for fire highlight colors
├── WebXRWildfireCameraSandbox.ts    # MODIFIED — add fireOverlay option; wire overlay.load() in sandbox.load()
└── index.ts                         # MODIFIED — export FireIncidentOverlay and new types
```

**Structure Decision**: Single-module layout consistent with the existing library. One new source file (`FireIncidentOverlay.ts`) and targeted modifications to four existing files. No new packages, backends, or build targets.

## Phase 0: Research Summary

Detailed findings in `specs/004-fire-incident-overlay/research.md`.

Key decisions:

- **Data source**: NIFC/IRWIN ArcGIS FeatureServer (GeoJSON, no auth) as default; custom endpoint accepted via options.
- **Rendering**: Browser `fetch` → parse → `GeoJsonDataSource.load(object, styleOptions)` → `viewer.dataSources.add()`. On refresh: remove old DataSource, add new one.
- **Proximity detection**: Compute once per refresh. Bounding-box pre-filter → winding number (inside) → Haversine vertex distance (proximity). Cache as `Map<string, 'inside' | 'proximity'>`. No third-party geometry library.
- **Marker integration**: New `setFireHighlights()` on `WildfireCameraMarkerManager`; stored map read in `createCameraEntity()` to select color/size.
- **Toggle UI**: Minimal `<button>` injected into `viewer.container`; suppressible via `showToggleButton: false`.
- **Auto-refresh**: `setInterval` at configured cadence; cleared in `destroy()`; failures retain previous display.

## Phase 1: Design Summary

Design artifacts:

- `specs/004-fire-incident-overlay/data-model.md` — `FireIncident`, `FireProximity`, `FireOverlayState` entities; state transition diagram; new types for `src/types.ts`
- `specs/004-fire-incident-overlay/contracts/fire-incident-overlay.md` — `FireIncidentOverlay` public API; `WildfireCameraMarkerManager.setFireHighlights()` contract; `WebXRWildfireCameraSandbox` augmentation; error handling table
- `specs/004-fire-incident-overlay/quickstart.md` — Usage examples for standalone, with markers, via sandbox, programmatic toggle, custom endpoint, cleanup

## Implementation Phases

### Phase 2: Types (`src/types.ts`)

Add to the existing `types.ts`:

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
  endpoint?: string;
  proximityThresholdKm?: number;
  refreshIntervalMs?: number;
  showToggleButton?: boolean;
  markers?: import('./WildfireCameraMarkerManager.js').WildfireCameraMarkerManager;
  fetcher?: typeof fetch;
}
```

### Phase 3: Marker Manager Augmentation (`src/WildfireCameraMarkerManager.ts`)

1. Add `private fireHighlights: Map<string, FireProximityStatus> = new Map()` instance field.
2. Add public method `setFireHighlights(highlights: Map<string, FireProximityStatus>): void` — stores the map and calls `this.refresh()`.
3. In `createCameraEntity()`, read `this.fireHighlights.get(camera.id)` and apply:
   - `'inside'` → `Color.RED`, `pixelSize: 16`, `outlineWidth: 3`
   - `'proximity'` → `Color.ORANGE`, `pixelSize: 14`, `outlineWidth: 2`
   - `undefined` → existing `Color.ORANGERED`, `pixelSize: 12`, `outlineWidth: 2`
4. Import `FireProximityStatus` from `./types.js`.

### Phase 4: FireIncidentOverlay (`src/FireIncidentOverlay.ts`)

New class. Responsibilities:

1. **Constructor**: Accept `viewer: Viewer` and `options: FireIncidentOverlayOptions`. Resolve defaults. Optionally inject toggle button.
2. **`load(endpoint?)`**: Fetch → parse → normalize to `FireIncident[]` → render via `GeoJsonDataSource` → compute proximity → push highlights to `markers.setFireHighlights()` → start refresh timer → return `FireOverlayLoadResult`.
3. **Private `fetchIncidents(endpoint)`**: `fetch(url)` → parse JSON → normalize GeoJSON FeatureCollection → validate → return `FireIncident[]`. Skips invalid/degenerate features.
4. **Private `normalizeFeature(feature)`**: Convert one GeoJSON feature to `FireIncident`. Derive `id` from `IncidentName` or feature index. Compute `boundingBox` from coordinate extremes.
5. **Private `renderIncidents(incidents)`**: Remove old `_dataSource` from `viewer.dataSources` if present. Call `GeoJsonDataSource.load(geoJsonObject, { stroke: Color.RED, fill: Color.RED.withAlpha(0.25), strokeWidth: 2 })`. Add new DataSource. Respect `this._visible`.
6. **Private `computeProximity(incidents, cameras)`**: Return `Map<string, FireProximityStatus>`. Algorithm: bounding box pre-filter → winding number → Haversine to nearest vertex.
7. **Private `windingNumber(point, ring)`**: Standard winding number for point-in-polygon on lat/lon ring.
8. **Private `haversineKm(lat1, lon1, lat2, lon2)`**: Haversine distance in km.
9. **`setVisible(visible)`**: Set `this._visible`; show/hide DataSource; if newly visible, re-apply highlights.
10. **`destroy()`**: `clearInterval`, remove DataSource, remove button, clear highlights.
11. **Public getters**: `status`, `visible`, `incidents`, `lastFetchedAt`.

### Phase 5: Sandbox Integration (`src/WebXRWildfireCameraSandbox.ts`)

1. Add `fireOverlay?: FireIncidentOverlay | FireIncidentOverlayOptions` to `WebXRWildfireCameraSandboxOptions`.
2. In constructor: if `options.fireOverlay` is a `FireIncidentOverlay`, assign to `this.fireOverlay`; otherwise if it is an options object, construct `new FireIncidentOverlay(viewer, { ...options.fireOverlay, markers: this.markers })`.
3. Expose `readonly fireOverlay: FireIncidentOverlay | undefined` as a public property.
4. In `load()`: after `this.markers.setCameras(cameras)`, call `await this.fireOverlay?.load()`.
5. In `destroy()`: call `this.fireOverlay?.destroy()`.

### Phase 6: Exports (`src/index.ts`)

Export `FireIncidentOverlay` and the new types:

```typescript
export { FireIncidentOverlay } from './FireIncidentOverlay.js';
export type { FireIncident, FireOverlayStatus, FireOverlayLoadResult, FireIncidentOverlayOptions, FireProximityStatus } from './types.js';
```

### Phase 7: Build Validation

Run `npm run build` (tsc) and confirm zero type errors.

## Scope Gate

This plan explicitly does **not** include:

- Changes to camera flight (`CameraFlight.ts`, `WildfireCameraFlightController.ts`)
- Auth system changes (`src/auth/`)
- WebXR session management changes (`WebXRSessionManager.ts`)
- Live video feed changes (`FloatingCameraFeedCanvas.ts`)
- Changes to `WildfireCameraDataSource.ts`
- New build tooling or deployment pipeline changes
- Playwright e2e test additions (no auth/XR paths touched)
