# Tasks: Live Fire Incident Overlay

**Input**: Design documents from `specs/004-fire-incident-overlay/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/fire-incident-overlay.md ✅, quickstart.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.  
**Tests**: Not requested in spec; no test tasks generated.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup

**Purpose**: No new project structure needed — this is an additive library feature. One new source file; four modified files.

- [x] T001 Verify `npm run build` passes clean before any changes (baseline check)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add shared types to `src/types.ts` that all user story phases depend on. Must complete before any US work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Add `FireProximityStatus`, `FireIncident`, `FireOverlayStatus`, `FireOverlayLoadResult`, and `FireIncidentOverlayOptions` type definitions to `src/types.ts`

**Checkpoint**: Types compile cleanly — run `tsc --noEmit` to confirm before proceeding.

---

## Phase 3: User Story 1 — View Active Fire Perimeters (Priority: P1) 🎯 MVP

**Goal**: Operators see active fire perimeter polygons on the Cesium globe when the app loads.

**Independent Test**: Load the app, call `overlay.load()`, and verify that red polygon outlines for active fire incidents appear on the globe over known active-fire areas (or over the seed San Diego region).

### Implementation for User Story 1

- [x] T003 [US1] Create `src/FireIncidentOverlay.ts` with class skeleton: constructor accepting `viewer: Viewer` and `options: FireIncidentOverlayOptions`; initialize resolved defaults (`endpoint`, `proximityThresholdKm: 5`, `refreshIntervalMs: 300_000`, `showToggleButton: true`); declare private fields `_status: FireOverlayStatus`, `_incidents: FireIncident[]`, `_visible: boolean`, `_dataSource: GeoJsonDataSource | undefined`, `_refreshHandle: ReturnType<typeof setInterval> | undefined`, `_lastFetchedAt: Date | undefined`
- [x] T004 [US1] Implement private `haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number` standalone function at module scope in `src/FireIncidentOverlay.ts`
- [x] T005 [US1] Implement private `computeBoundingBox(coordinates: number[][])` helper in `src/FireIncidentOverlay.ts` that returns `{ west, south, east, north }` by iterating the outer ring coordinate array
- [x] T006 [US1] Implement private `normalizeFeature(feature: unknown, index: number): FireIncident | undefined` in `src/FireIncidentOverlay.ts`: extract `IncidentName`/`name` for display name, derive `id` as slug from name + index, extract `GISAcres`/`PercentContained`/`DateCurrent` optionally, validate geometry type is `'Polygon'` or `'MultiPolygon'` with non-empty coordinates, compute `boundingBox` via `computeBoundingBox`, skip degenerate rings (< 3 points)
- [x] T007 [US1] Implement private `fetchIncidents(endpoint: string): Promise<FireIncident[]>` in `src/FireIncidentOverlay.ts`: call `this.fetcher(endpoint)`, check `response.ok`, parse JSON, expect a GeoJSON FeatureCollection, map `features` array through `normalizeFeature`, filter out `undefined` results
- [x] T008 [US1] Implement private `renderIncidents(incidents: FireIncident[]): Promise<void>` in `src/FireIncidentOverlay.ts`: if `_dataSource` exists, call `viewer.dataSources.remove(_dataSource, true)`; build a GeoJSON FeatureCollection object from `incidents`; call `GeoJsonDataSource.load(featureCollection, { stroke: Color.RED, fill: Color.RED.withAlpha(0.25), strokeWidth: 2 })`; assign to `_dataSource`; add to `viewer.dataSources` only if `_visible === true`
- [x] T009 [US1] Implement public `load(endpoint?: string): Promise<FireOverlayLoadResult>` in `src/FireIncidentOverlay.ts`: set `_status = 'loading'`; call `fetchIncidents`; on success set `_status = 'loaded'`, assign `_incidents`, set `_lastFetchedAt`, call `renderIncidents`, call `computeProximity` (stub returning empty map for now), push highlights to `options.markers?.setFireHighlights()`; on error set `_status = 'error'`, log warning, retain previous display; return typed `FireOverlayLoadResult`
- [x] T010 [US1] Add public getters `status`, `visible`, `incidents`, `lastFetchedAt` to `FireIncidentOverlay` in `src/FireIncidentOverlay.ts`
- [x] T011 [US1] Export `FireIncidentOverlay` from `src/index.ts` and export the new fire overlay types from `src/types.ts` via `src/index.ts`
- [x] T012 [US1] Run `npm run build` and fix any TypeScript errors

**Checkpoint**: `overlay.load()` fetches from NIFC and renders red polygons on the Cesium globe. US1 acceptance scenarios pass.

---

## Phase 4: User Story 2 — Identify At-Risk Cameras (Priority: P2)

**Goal**: Camera markers located within or near an active fire perimeter display with a red or orange highlight, distinguishing them from unaffected markers.

**Independent Test**: With fire data loaded and cameras set, verify that markers matching known fire-overlap positions render red (inside) or orange (proximity), and that markers outside the threshold render the default orange-red.

### Implementation for User Story 2

- [x] T013 [US2] Add `private fireHighlights: Map<string, FireProximityStatus> = new Map()` field to `WildfireCameraMarkerManager` in `src/WildfireCameraMarkerManager.ts`; import `FireProximityStatus` from `./types.js`
- [x] T014 [US2] Add public `setFireHighlights(highlights: Map<string, FireProximityStatus>): void` method to `WildfireCameraMarkerManager` in `src/WildfireCameraMarkerManager.ts`: store `highlights` in `this.fireHighlights`; call `this.refresh()`
- [x] T015 [US2] Update `createCameraEntity()` in `src/WildfireCameraMarkerManager.ts` to read `this.fireHighlights.get(camera.id)` and apply: `'inside'` → `Color.RED`, `pixelSize: 16`, `outlineWidth: 3`; `'proximity'` → `Color.ORANGE`, `pixelSize: 14`, `outlineWidth: 2`; `undefined` → unchanged defaults (`Color.ORANGERED`, `pixelSize: 12`, `outlineWidth: 2`)
- [x] T016 [P] [US2] Implement private `windingNumber(lonLat: [number, number], ring: number[][]): number` standalone function at module scope in `src/FireIncidentOverlay.ts`: standard winding number algorithm operating on `[lon, lat]` pairs
- [x] T017 [US2] Implement private `computeProximity(incidents: FireIncident[], cameras: ResolvedWildfireCamera[]): Map<string, FireProximityStatus>` in `src/FireIncidentOverlay.ts`: for each camera, for each incident, (1) bounding-box pre-filter with threshold padding of `proximityThresholdKm / 111` degrees, (2) if passes pre-filter run winding number on each polygon ring — classify `'inside'` if winding ≠ 0, (3) if not inside, compute Haversine distance to each outer-ring vertex — classify `'proximity'` if `distanceKm ≤ proximityThresholdKm`; `'inside'` takes priority over `'proximity'`; if a camera matches multiple incidents keep the highest-priority status
- [x] T018 [US2] Wire `computeProximity` into `load()` in `src/FireIncidentOverlay.ts`: replace stub call with real call passing `this._incidents` and the cameras from `options.markers?.getCameras() ?? []`; pass result to `options.markers?.setFireHighlights(highlights)`
- [x] T019 [US2] Run `npm run build` and fix any TypeScript errors

**Checkpoint**: At-risk cameras render red/orange; unaffected cameras render the default color. US2 acceptance scenarios pass.

---

## Phase 5: User Story 3 — Toggle Overlay Visibility (Priority: P3)

**Goal**: A visible button lets operators show or hide all fire perimeter polygons and the associated camera highlights.

**Independent Test**: Load the overlay, verify polygons are visible and at-risk markers are highlighted; click the toggle button; verify polygons disappear and markers revert to default; click again; verify polygons and highlights are restored.

### Implementation for User Story 3

- [x] T020 [US3] Implement public `setVisible(visible: boolean): void` in `src/FireIncidentOverlay.ts`: if transitioning to `true` and `_dataSource` exists, call `viewer.dataSources.add(_dataSource)`, then re-apply highlights via `options.markers?.setFireHighlights(_currentHighlights)`; if transitioning to `false` and `_dataSource` exists, call `viewer.dataSources.remove(_dataSource, false)` (keep in memory), call `options.markers?.setFireHighlights(new Map())` to clear highlights; update `_visible`
- [x] T021 [US3] Implement toggle button injection in `FireIncidentOverlay` constructor in `src/FireIncidentOverlay.ts`: if `options.showToggleButton !== false`, create a `<button>` element with text "🔥 Fire Overlay" (or "Hide Fire Overlay" when visible), append to `viewer.container`, wire `click` listener to call `this.setVisible(!this._visible)` and update button text; store as `private _toggleButton: HTMLButtonElement | undefined`
- [x] T022 [US3] Implement public `destroy(): void` in `src/FireIncidentOverlay.ts`: call `clearInterval(_refreshHandle)`, set `_refreshHandle = undefined`; if `_dataSource` exists call `viewer.dataSources.remove(_dataSource, true)`; if `_toggleButton` exists call `_toggleButton.remove()`; call `options.markers?.setFireHighlights(new Map())`
- [x] T023 [US3] Run `npm run build` and fix any TypeScript errors

**Checkpoint**: Toggle button appears in the viewer; clicking shows/hides perimeter polygons and toggles marker highlighting. US3 acceptance scenarios pass.

---

## Phase 6: User Story 4 — Automatic Data Refresh (Priority: P4)

**Goal**: Fire data refreshes automatically in the background at the configured interval; failures retain the existing display without disrupting the operator.

**Independent Test**: Observe that `overlay.lastFetchedAt` advances at approximately the configured interval; simulate a fetch failure and verify existing polygons remain visible and `overlay.status` transitions to `'error'` without clearing the display.

### Implementation for User Story 4

- [x] T024 [US4] Implement private `scheduleRefresh()` in `src/FireIncidentOverlay.ts`: if `options.refreshIntervalMs > 0`, call `setInterval(async () => { ... }, options.refreshIntervalMs)`; store handle in `_refreshHandle`; the interval callback runs the same fetch → render → proximity → setHighlights pipeline as `load()`, but on failure logs a warning, retains `_incidents` and `_dataSource`, and sets `_status = 'error'` without clearing the display
- [x] T025 [US4] Call `scheduleRefresh()` at the end of the first successful `load()` in `src/FireIncidentOverlay.ts` (only start the timer on first success; subsequent refreshes are driven by the interval)
- [x] T026 [US4] Ensure `destroy()` calls `clearInterval(_refreshHandle)` (already included in T022; verify the handle is correctly referenced after T025)
- [x] T027 [US4] Run `npm run build` and fix any TypeScript errors

**Checkpoint**: Auto-refresh runs silently; `overlay.lastFetchedAt` updates on each refresh. US4 acceptance scenarios pass.

---

## Phase 7: Sandbox Integration

**Purpose**: Wire `FireIncidentOverlay` into `WebXRWildfireCameraSandbox` so the full feature stack works via a single entry point.

- [x] T028 Add `fireOverlay?: FireIncidentOverlay | FireIncidentOverlayOptions` field to `WebXRWildfireCameraSandboxOptions` in `src/WebXRWildfireCameraSandbox.ts`; import `FireIncidentOverlay` and `FireIncidentOverlayOptions` from `./FireIncidentOverlay.js`
- [x] T029 In `WebXRWildfireCameraSandbox` constructor in `src/WebXRWildfireCameraSandbox.ts`: if `options.fireOverlay instanceof FireIncidentOverlay`, assign to `this.fireOverlay`; else if `options.fireOverlay` is a plain object, construct `new FireIncidentOverlay(viewer, { ...options.fireOverlay, markers: this.markers })`; else `this.fireOverlay = undefined`; expose as `readonly fireOverlay: FireIncidentOverlay | undefined`
- [x] T030 In `WebXRWildfireCameraSandbox.load()` in `src/WebXRWildfireCameraSandbox.ts`: after `this.markers.setCameras(cameras)`, add `await this.fireOverlay?.load()`
- [x] T031 In `WebXRWildfireCameraSandbox.destroy()` in `src/WebXRWildfireCameraSandbox.ts`: add `this.fireOverlay?.destroy()`
- [x] T032 Run `npm run build` — confirm zero TypeScript errors across all modified files

**Checkpoint**: `new WebXRWildfireCameraSandbox(viewer, { fireOverlay: {} })` loads camera data and fire data in one `sandbox.load()` call; fire polygons appear; at-risk cameras highlight; toggle button is present.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T033 [P] Verify `FireIncidentOverlay` exported types appear in `src/index.ts`: `FireIncidentOverlay`, `FireIncidentOverlayOptions`, `FireIncident`, `FireOverlayStatus`, `FireOverlayLoadResult`, `FireProximityStatus`
- [x] T034 [P] Verify `WildfireCameraMarkerManager.setFireHighlights()` is exported from `src/index.ts` (it is exported via the class itself; confirm no re-export of type is needed)
- [x] T035 Review `src/FireIncidentOverlay.ts` for any remaining `console.log` debug calls and convert to `console.warn` for error paths only
- [x] T036 Final `npm run build` clean pass — zero errors, zero warnings

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — can start as soon as types are added
- **US2 (Phase 4)**: Depends on Phase 3 (uses `_incidents` from `load()` and `renderIncidents` pipeline); also requires `getCameras()` to exist on `WildfireCameraMarkerManager` (already present)
- **US3 (Phase 5)**: Depends on Phase 3 (`_dataSource` must exist); T020 depends on T014 (`setFireHighlights` must exist)
- **US4 (Phase 6)**: Depends on Phase 3 (`load()` must exist); T026 depends on T022 (`destroy()` must exist)
- **Sandbox Integration (Phase 7)**: Depends on Phases 3–6 (all overlay functionality must be complete)
- **Polish (Phase 8)**: Depends on Phase 7

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependency on other stories
- **US2 (P2)**: Depends on US1 (`load()` and `_incidents` pipeline)
- **US3 (P3)**: Depends on US1 (`_dataSource` pipeline); integrates with US2 highlights
- **US4 (P4)**: Depends on US1 (`load()` pipeline); integrates with US2/US3 state

### Parallel Opportunities (within Phase 3)

- T003 (class skeleton) and T004 (haversineKm) and T005 (computeBoundingBox) can all start simultaneously — different logical units, all in the same new file
- T013 (fireHighlights field) and T016 (windingNumber) can run in parallel — T013 is in MarkerManager; T016 is in FireIncidentOverlay

---

## Parallel Example: User Story 1

```text
# After T002 (types) completes, launch these in parallel:
Task T003: Class skeleton in src/FireIncidentOverlay.ts
Task T004: haversineKm() function (module-scope, no deps)
Task T005: computeBoundingBox() helper (module-scope, no deps)

# Then sequentially (each depends on previous):
T006 normalizeFeature()  →  T007 fetchIncidents()  →  T008 renderIncidents()  →  T009 load()  →  T010 getters  →  T011 exports  →  T012 build check
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002)
3. Complete Phase 3: US1 (T003–T012)
4. **STOP and VALIDATE**: Open browser, call `overlay.load()`, confirm fire polygons appear
5. Ship MVP if needed

### Incremental Delivery

1. Setup + Foundational → types ready
2. US1 → overlay renders fire perimeters *(MVP)*
3. US2 → camera markers highlight near fires
4. US3 → toggle button controls visibility
5. US4 → data auto-refreshes every 5 minutes
6. Sandbox integration → full feature available via `WebXRWildfireCameraSandbox`

---

## Notes

- [P] tasks operate on different files or independent logic — safe to start simultaneously
- [Story] label maps each task to its user story for traceability
- No test tasks generated (not requested in spec)
- `tsc --noEmit` checkpoint after each phase catches type errors early
- The `computeProximity` stub in T009 (returns empty map) intentionally defers US2 work to Phase 4 without breaking US1
- `GeoJsonDataSource` must be imported from `'cesium'` — verify it is present in the Cesium ESM shim if needed
