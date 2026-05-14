# Research: Live Fire Incident Overlay

**Feature**: 004-fire-incident-overlay  
**Date**: 2026-05-13

## Decision 1: Fire Perimeter Data Source

**Decision**: Use the NIFC/IRWIN Active Fires ArcGIS FeatureServer as the default endpoint. Design the class to accept a custom endpoint URL so consumers can substitute any GeoJSON source.

**Default endpoint**:
```
https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Active_Fires/FeatureServer/0/query
  ?where=1%3D1
  &outFields=IncidentName,GISAcres,PercentContained,CreateDate,DateCurrent
  &outSR=4326
  &f=geojson
```

**Rationale**: NIFC/IRWIN is the authoritative interagency source for active US wildfire perimeters. The ArcGIS FeatureServer returns standard GeoJSON (Polygon/MultiPolygon features), requires no authentication, and updates multiple times per day. A bounding box filter (`geometry=` + `geometryType=esriGeometryEnvelope`) can optionally be appended to limit results to a region.

**Alternatives considered**:
- *NASA FIRMS*: Returns point hotspots, not perimeter polygons. Not suitable.
- *CAL FIRE Incident Pages*: No machine-readable GeoJSON API; requires scraping.
- *ESRI Living Atlas Wildfires*: Similar quality but less authoritative; the NIFC service is the upstream source.

**CORS note**: The `services3.arcgis.com` domain supports CORS for browser `fetch`. No proxy required for typical use.

---

## Decision 2: Cesium Rendering Strategy

**Decision**: Fetch fire GeoJSON with the browser `fetch` API, then call `GeoJsonDataSource.load(parsedObject, styleOptions)` with the parsed in-memory object. Add the DataSource to `viewer.dataSources`. On refresh, remove the old DataSource and add a new one built from the latest fetch.

**Rationale**: Loading from an in-memory object rather than a URL gives full control over error handling, retry logic, caching, and refresh timing. Cesium's `GeoJsonDataSource` handles complex polygon and multi-polygon geometries, coordinate transformation, and entity creation internally. Styling (stroke color, fill color, stroke width) is applied at load time via the options argument.

**Styling defaults**:
- Stroke: `Color.RED`
- Fill: `Color.RED.withAlpha(0.25)`
- Stroke width: 2px
- Clamp to ground: false (the overlay is volumetrically above terrain)

**Alternatives considered**:
- *Custom entity rendering per polygon ring*: Full control but duplicates Cesium's built-in polygon tessellation logic unnecessarily.
- *Primitive API*: Lower-level, significantly more code for no gain at this scale (~100 polygons).

---

## Decision 3: Camera Proximity Detection

**Decision**: Compute proximity entirely when fire data loads or refreshes — not per frame. Store results in a `Map<string, 'inside' | 'proximity'>`. Pass this map to `WildfireCameraMarkerManager` via a new `setFireHighlights()` method. The marker manager reads from the map during its normal `refresh()` to select entity color/size.

**Algorithm**:
1. **Bounding box pre-filter** (fast rejection): For each fire perimeter, compute the lat/lon bounding box from its coordinate array. Reject cameras whose lat/lon falls outside the expanded box (box + proximity threshold in degrees).
2. **Point-in-polygon** (winding number): For cameras passing the pre-filter, run the winding number algorithm on the raw lat/lon coordinate ring. Any camera with winding number ≠ 0 is classified `'inside'`.
3. **Proximity distance** (Haversine to nearest vertex): For cameras outside the polygon but within the expanded bounding box, compute Haversine distance to each polygon vertex. If the minimum vertex distance is ≤ the configured threshold (default 5 km), classify as `'proximity'`.

**Rationale**: Proximity detection runs at most once per refresh cycle (every 5 minutes by default), so O(cameras × perimeter vertices) complexity is acceptable. No third-party geometry library is needed; the winding number and Haversine formulas are small self-contained functions.

**Alternatives considered**:
- *turf.js `booleanPointInPolygon`*: Accurate and well-tested, but adds ~180 KB to the browser bundle. Rejected per the constitution's bundle-size evaluation requirement for new dependencies.
- *Cesium BoundingSphere*: Fast but spherical — inaccurate for elongated fire shapes. Rejected for false positives.
- *Per-frame check*: Unnecessary overhead. Fire data updates every 5 minutes; proximity results need not be recomputed more often.

---

## Decision 4: Marker Highlighting Integration

**Decision**: Add a `setFireHighlights(highlights: Map<string, 'inside' | 'proximity'>): void` method to `WildfireCameraMarkerManager`. Store the map as instance state. In `createCameraEntity()`, read the camera's ID from the map to select color and pixel size:
- `'inside'`: `Color.RED`, `pixelSize: 16`, outlineWidth: 3
- `'proximity'`: `Color.ORANGE`, `pixelSize: 14`, outlineWidth: 2
- No entry: `Color.ORANGERED`, `pixelSize: 12`, outlineWidth: 2 (existing default)

Call `this.markers.refresh()` after `setFireHighlights()` so the new colors appear immediately.

**Rationale**: The existing `refresh()` cycle already rebuilds all entities from `this.cameras`. Injecting highlight state into the map allows a single code path to handle normal and fire-proximity rendering without duplicating entity creation logic.

**Alternatives considered**:
- *Directly mutate entity properties on existing entities*: Fragile — the marker manager clears and recreates entities on every `refresh()`, so any direct mutation is lost.
- *Separate overlay entity layer*: An additional set of highlight-ring entities drawn around at-risk markers. Adds complexity and Z-fighting risk.

---

## Decision 5: Toggle UI

**Decision**: `FireIncidentOverlay` exposes a `setVisible(visible: boolean)` method and a `get visible()` getter. The class also injects a single `<button>` element into `viewer.container` by default. The button can be disabled via `options.showToggleButton = false` for headless or custom-UI usage.

**Rationale**: Following the pattern established by `CameraPickerPanel` (a DOM-overlay class that injects HTML into `viewer.container`), the overlay manages its own minimal UI. This keeps the consumer API simple while staying consistent with the existing pattern.

**Alternatives considered**:
- *No built-in button, delegate to consumer*: Simpler class, but the spec requires a visible UI control that the feature must provide.
- *Cesium toolbar button*: Cesium's toolbar is not part of the public TypeScript API; using it requires fragile DOM traversal.

---

## Decision 6: Auto-Refresh Architecture

**Decision**: Use `setInterval` with the configured interval (default 300,000 ms / 5 minutes). Store the handle and clear it in `destroy()`. On each tick, run the same fetch-and-render pipeline used for the initial load. If a fetch fails during a refresh, log a warning, retain the current DataSource, and keep existing highlights unchanged.

**Rationale**: `setInterval` is the simplest correct solution for periodic background work in a browser module. No scheduler abstraction is needed at this scale.

**Alternatives considered**:
- *setTimeout-based retry loop*: Adds complexity with no user-visible benefit for a 5-minute cadence.
- *Visibility-aware refresh (Page Visibility API)*: Useful for mobile battery savings but adds complexity; can be added later.
