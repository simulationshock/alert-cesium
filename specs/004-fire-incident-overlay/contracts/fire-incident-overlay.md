# Contract: Fire Incident Overlay

**Feature**: 004-fire-incident-overlay  
**Date**: 2026-05-13  
**Stability**: Draft

This document defines the public TypeScript API surface for the `FireIncidentOverlay` class and the augmented `WildfireCameraMarkerManager`.

---

## FireIncidentOverlay

### Constructor

```typescript
new FireIncidentOverlay(viewer: Viewer, options?: FireIncidentOverlayOptions)
```

**Behavior**: Initializes the overlay in `'idle'` state. Does not fetch data until `load()` is called. If `options.showToggleButton` is `true` (default), injects a toggle button into `viewer.container`. Auto-refresh timer is NOT started until `load()` succeeds.

---

### Methods

#### `load(endpoint?: string): Promise<FireOverlayLoadResult>`

Fetches fire perimeter data from `endpoint` (or the configured/default endpoint). Renders perimeters on the globe. Starts the auto-refresh timer on first successful load. Returns a typed outcome.

```typescript
// Outcomes:
{ status: 'loaded'; incidentCount: number; highlightedCameraCount: number }
{ status: 'error'; incidentCount: 0; highlightedCameraCount: 0; error: Error }
```

**Preconditions**: `viewer` is a valid Cesium `Viewer` instance.  
**Postconditions on `'loaded'`**: Fire perimeter polygons are visible in the globe (if `visible === true`). `this.status === 'loaded'`. Auto-refresh timer is active.  
**Postconditions on `'error'`**: Globe is unchanged. `this.status === 'error'`. Previously loaded data (if any) remains displayed. Auto-refresh timer is NOT started if this is the first load.

---

#### `setVisible(visible: boolean): void`

Shows or hides all fire perimeter polygons. Does not affect data fetching or the auto-refresh timer. If `visible` transitions from `false` to `true`, fire proximity highlights are re-applied to camera markers.

---

#### `destroy(): void`

Clears the auto-refresh timer, removes the DataSource from the viewer, removes the toggle button from the DOM, and clears all fire highlights from the marker manager. Safe to call multiple times.

---

### Properties

| Property | Type | Notes |
|----------|------|-------|
| `status` | `FireOverlayStatus` | Read-only. Current lifecycle state. |
| `visible` | `boolean` | Read-only. Current visibility. Use `setVisible()` to change. |
| `incidents` | `readonly FireIncident[]` | Read-only. Last successfully loaded incidents. Empty before first successful load. |
| `lastFetchedAt` | `Date \| undefined` | Read-only. Timestamp of last successful fetch. |

---

## WildfireCameraMarkerManager (augmented)

### New Method

#### `setFireHighlights(highlights: Map<string, 'inside' | 'proximity'>): void`

Stores the provided highlight map and calls `refresh()` to rebuild all marker entities with updated colors and sizes.

**Behavior**:
- Cameras in the map with `'inside'` status → `Color.RED`, `pixelSize: 16`
- Cameras in the map with `'proximity'` status → `Color.ORANGE`, `pixelSize: 14`
- Cameras absent from the map → existing default color/size (unchanged)
- Passing an empty map clears all fire highlights and restores defaults.

**When to call**: Called by `FireIncidentOverlay` after each successful data load or refresh, and when `setVisible(true)` is called after the overlay was hidden.

---

## WebXRWildfireCameraSandbox (augmented)

### New option field

```typescript
interface WebXRWildfireCameraSandboxOptions {
  // ... existing fields ...
  fireOverlay?: FireIncidentOverlay | FireIncidentOverlayOptions;
}
```

If provided as `FireIncidentOverlayOptions`, the sandbox constructs a `FireIncidentOverlay` internally and wires `this.markers` to it. If provided as a pre-constructed `FireIncidentOverlay`, the sandbox uses it as-is. In either case, `this.fireOverlay` is exposed as a public property.

The sandbox calls `this.fireOverlay.load()` as part of its `load()` method, after camera data is loaded (so camera positions are known for proximity computation).

---

## Error Handling Contract

| Scenario | Behavior |
|----------|----------|
| Fetch fails (network error) | Returns `{ status: 'error', ... }`; logs warning; retains previous display |
| HTTP non-2xx response | Same as fetch failure |
| Malformed JSON | Same as fetch failure |
| GeoJSON feature with missing/invalid geometry | Feature is skipped silently; valid features continue to render |
| GeoJSON feature with degenerate polygon (< 3 points) | Feature is skipped silently |
| `load()` called while a load is already in progress | Second call proceeds normally; both may complete; last-to-complete wins |
| `destroy()` called during an in-flight fetch | Fetch completes but its result is discarded; DataSource is not re-added |
