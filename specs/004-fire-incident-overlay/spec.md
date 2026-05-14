# Feature Specification: Live Fire Incident Overlay

**Feature Branch**: `004-fire-incident-overlay`  
**Created**: 2026-05-13  
**Status**: Draft  
**Input**: User description: "Fetch active wildfire incident perimeters from public APIs and display them as polygon overlays on the Cesium globe. When a camera marker falls within or near an active fire perimeter, highlight it visually. Include a toggle in the UI to show/hide the overlay. Overlay should auto-refresh on a configurable interval (default 5 minutes). No auth required for fire data endpoints. Target San Diego / Southern California as the initial bounding box but design for any region."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Active Fire Perimeters (Priority: P1)

An emergency operator opens the wildfire camera viewer and immediately sees the boundaries of all active fire incidents drawn on the globe. Without any additional action, they can identify where fires are burning, how large they are, and which geographic areas are affected.

**Why this priority**: This is the core value proposition of the feature — transforming the app from a camera browser into a situational awareness tool. All other stories depend on fire perimeter data being visible first.

**Independent Test**: Can be fully tested by loading the app and verifying that fire perimeter polygons appear on the globe over active incident areas, delivering immediate situational awareness value.

**Acceptance Scenarios**:

1. **Given** the app is loaded and the overlay is enabled, **When** active fire incidents exist in the data source, **Then** each incident's perimeter is drawn as a clearly visible polygon on the globe with consistent visual styling.
2. **Given** the overlay is enabled, **When** no active fire incidents are found, **Then** the globe shows no fire polygons and the app remains fully functional.
3. **Given** the app loads for the first time, **When** fire data is available, **Then** the perimeter overlay is visible by default without any user action required.

---

### User Story 2 - Identify At-Risk Cameras (Priority: P2)

An operator scanning the globe notices that some camera markers have changed appearance — they appear highlighted or differently styled. The operator understands at a glance that those cameras are located within or very near an active fire perimeter, and selects one to check its live feed.

**Why this priority**: Connecting fire location data to camera markers is what makes the overlay actionable. Without this, the operator must mentally compare fire polygons to camera positions.

**Independent Test**: Can be tested by verifying that camera markers located inside or within 5 km of a fire perimeter display with distinct visual styling compared to unaffected cameras.

**Acceptance Scenarios**:

1. **Given** fire perimeter data is loaded, **When** a camera marker falls within an active fire perimeter boundary, **Then** the marker is displayed with a visually distinct style (e.g., red highlight or alternate icon) compared to unaffected markers.
2. **Given** fire perimeter data is loaded, **When** a camera marker is within the proximity threshold of a fire perimeter but outside the boundary, **Then** the marker is also visually distinguished to indicate proximity.
3. **Given** a camera was previously highlighted as near a fire, **When** the fire data is refreshed and the incident is no longer active or the camera is no longer within range, **Then** the camera marker returns to its normal appearance.

---

### User Story 3 - Toggle Overlay Visibility (Priority: P3)

An operator finds the fire perimeter overlay visually cluttered while navigating to a specific camera in an unaffected area. They use a visible toggle control to hide the overlay, navigate to their target, then re-enable the overlay to resume situational awareness monitoring.

**Why this priority**: The overlay may occlude underlying map detail or camera markers. Operators need control over visual complexity without losing the underlying camera data.

**Independent Test**: Can be tested by toggling the overlay control and verifying that all fire polygons appear/disappear while camera markers and globe navigation remain unaffected.

**Acceptance Scenarios**:

1. **Given** the overlay is currently visible, **When** the operator activates the hide toggle, **Then** all fire perimeter polygons are removed from the globe immediately and camera markers revert to their default appearance.
2. **Given** the overlay is currently hidden, **When** the operator activates the show toggle, **Then** fire perimeter polygons reappear and at-risk camera highlighting is restored.
3. **Given** the overlay is toggled off, **When** an auto-refresh occurs in the background, **Then** the refresh completes silently and the updated data is applied when the overlay is next shown.

---

### User Story 4 - Automatic Data Refresh (Priority: P4)

An operator leaves the viewer open during an active fire response. Over time, fire perimeters grow or new incidents start. The displayed overlay updates automatically in the background, and the operator sees the latest fire boundaries without reloading the page.

**Why this priority**: Stale fire data is misleading during active incidents. Automatic refresh ensures the overlay remains useful during extended monitoring sessions.

**Independent Test**: Can be tested by verifying that the overlay data is re-fetched at the configured interval and that visible polygons update to reflect changes in the source data.

**Acceptance Scenarios**:

1. **Given** the overlay is enabled and the refresh interval has elapsed, **When** the background refresh runs, **Then** the displayed perimeters are replaced with the latest fetched data without any visible flash or interruption.
2. **Given** a fire data fetch fails during auto-refresh, **When** the error occurs, **Then** the previously displayed data remains visible and the operator is not disrupted; an unobtrusive error indicator may appear.
3. **Given** a custom refresh interval is configured, **When** the interval elapses, **Then** the data is refreshed at the configured cadence rather than the default 5-minute interval.

---

### Edge Cases

- What happens when the fire data API returns an empty feature collection (no active fires)?
- What happens when the fire data API is unreachable or returns an error on initial load?
- What happens when a fire perimeter polygon is very large and covers many camera markers simultaneously?
- What happens when a fire perimeter polygon is malformed or contains invalid coordinates?
- What happens when the user rapidly toggles the overlay on/off during a fetch in progress?
- How does the system behave when the configured bounding region has no active fires?
- What happens when camera marker data and fire perimeter data finish loading at different times?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display active fire incident perimeters as closed polygon boundaries on the globe when the overlay is enabled.
- **FR-002**: System MUST fetch fire perimeter data from a publicly accessible, authentication-free source.
- **FR-003**: System MUST automatically refresh fire data at a configurable interval, defaulting to 5 minutes when no interval is specified.
- **FR-004**: System MUST visually distinguish camera markers located within an active fire perimeter boundary from unaffected markers.
- **FR-005**: System MUST visually distinguish camera markers within a configurable proximity threshold of a fire perimeter (default: 5 km) from unaffected markers.
- **FR-006**: Users MUST be able to toggle fire perimeter overlay visibility on and off via a visible UI control.
- **FR-007**: System MUST continue displaying previously fetched perimeter data when a refresh attempt fails, without interrupting the operator's session.
- **FR-008**: System MUST support configuration of a geographic bounding region for fetching fire data; it must not be permanently hardcoded to San Diego/Southern California.
- **FR-009**: System MUST restore fire-proximity highlighting on camera markers whenever the overlay is re-enabled after being hidden.
- **FR-010**: System MUST handle malformed or invalid perimeter geometries gracefully, skipping invalid features without crashing.

### Key Entities

- **Fire Incident**: An active wildfire event identified by a unique ID, name, and geographic extent. Has a lifecycle (active/contained/out) and may update in size or status over time.
- **Fire Perimeter**: The geographic boundary of a fire incident, represented as a closed polygon. May be a simple polygon or a multi-polygon for complex fire shapes.
- **Proximity Association**: A computed relationship between a camera and one or more fire incidents, indicating whether the camera is inside a perimeter, within the proximity threshold, or unaffected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can identify the location and approximate extent of all active fires in the monitored region within 30 seconds of enabling the overlay.
- **SC-002**: Camera markers near or within fire perimeters are visually distinguishable from unaffected markers without any additional operator interaction.
- **SC-003**: Fire data displayed is never older than one refresh interval plus fetch time; operators do not need to manually trigger updates.
- **SC-004**: The overlay toggle responds within 500 ms of activation, with no disruption to globe navigation or camera marker interaction.
- **SC-005**: The application remains fully operable (camera browsing, feed viewing, globe navigation) when fire data is unavailable or the fetch fails.
- **SC-006**: 100% of camera markers correctly reflect their fire-proximity status after each data refresh, with no stale highlighting remaining for resolved incidents.

## Assumptions

- Fire perimeter data is available in GeoJSON format (FeatureCollection of Polygon/MultiPolygon) from a publicly accessible endpoint without authentication.
- The initial geographic focus is San Diego/Southern California, but the bounding region is a configuration parameter, not a hardcoded value.
- "Near a fire" defaults to within 5 km of the nearest perimeter boundary; this threshold is configurable.
- The overlay is additive — it does not replace or interfere with existing camera marker rendering or flight navigation behavior.
- Auto-refresh runs silently in the background; no loading spinner is required unless the initial fetch has not yet completed.
- The overlay toggle persists only for the current session; the default state on page load is overlay visible.
- Desktop browser is the primary target; WebXR/mobile compatibility for the overlay is a secondary concern and out of scope for this feature.
- Polygon fill opacity is kept low enough to not obscure underlying globe terrain and labels.
- Camera markers that are both inside a perimeter and within the proximity zone are treated as "inside" (higher priority state) for highlighting purposes.
