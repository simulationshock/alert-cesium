# Feature Specification: WebXR Wildfire Camera Integration

**Feature Branch**: `002-webxr-wildfire-cameras`  
**Created**: 2026-05-09  
**Status**: Draft  
**Input**: User clarification/extension:
1. WebXR support over HTTPS.
2. Floating canvas with live camera feed and selection.
3. Mapping all alert wildfire cameras with proper georeferencing on Cesium.
4. Parabolic interpolation/flight to camera geolocations.
5. Intelligent culling and selective display of crowded markers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Immersive XR Access (Priority: P1)

A user wants to enter the San Diego sandbox using a VR/AR headset via a secure HTTPS connection to experience the geographic data in 3D space.

**Why this priority**: This defines the primary interface modality for the "sandbox" experience.

**Independent Test**: User opens the application in a WebXR-compatible browser over HTTPS, activates XR mode, and successfully enters the immersive environment.

**Acceptance Scenarios**:

1. **Given** a WebXR-compatible device, **When** the user accesses the site via HTTPS, **Then** the "Enter VR/AR" option is available.
2. **Given** the user is in XR mode, **When** they look around the Cesium globe, **Then** the movement is smooth and responsive to headset tracking.

---

### User Story 2 - Wildfire Camera Exploration (Priority: P1)

A user wants to see where all active wildfire alert cameras are located across the San Diego region to assess situational awareness.

**Why this priority**: This is the core data value of the system.

**Independent Test**: The Cesium globe renders markers for all available wildfire cameras, and each marker is positioned accurately based on its georeferenced coordinates.

**Acceptance Scenarios**:

1. **Given** the sandbox is loaded, **When** the system fetches wildfire camera data, **Then** markers are placed at the exact latitude/longitude of each camera.
2. **Given** a high density of cameras in one area, **When** the user zooms out, **Then** markers are intelligently culled/clustered to prevent visual clutter.
3. **Given** a user zooms in on a cluster, **When** the view narrows, **Then** the individual camera markers are revealed.

---

### User Story 3 - Teleportation & Smooth Navigation (Priority: P2)

A user wants to quickly move from their current position to a specific wildfire camera's location without jarring jumps.

**Why this priority**: Enhances the UX of exploring a large geographic area, especially in XR where sudden jumps can cause motion sickness.

**Independent Test**: The user selects a camera marker and the camera view smoothly interpolates in a parabolic arc to the camera's coordinates.

**Acceptance Scenarios**:

1. **Given** the user is at Position A, **When** they select a camera marker at Position B, **Then** the view transitions to Position B following a curved, parabolic path.
2. **Given** the flight animation, **When** it is in progress, **Then** the movement remains smooth and maintains a consistent speed.

---

### User Story 4 - Immersive Camera Feed (Priority: P2)

A user wants to view the live feed of a selected wildfire camera while still maintaining their context within the 3D environment.

**Why this priority**: Allows the user to correlate the live imagery with the 3D terrain.

**Independent Test**: The user selects a camera and a floating 2D canvas appears in their XR field of view, displaying the live video stream of that camera.

**Acceptance Scenarios**:

1. **Given** a selected camera, **When** the feed is requested, **Then** a floating UI canvas is instantiated in 3D space.
2. **Given** the floating canvas, **When** the user interacts with it, **Then** they can select options or close the feed.

---

### Edge Cases

- **Camera Feed Latency**: How is the "live" feed handled if the stream is lagging or unavailable? (Assumption: Placeholder "Feed Offline" image is shown).
- **WebXR Compatibility**: What happens if the browser does not support WebXR? (Assumption: Fallback to standard 3D web view).
- **Coordinate Precision**: How are cameras handled if the georeference data is slightly inaccurate? (Assumption: Markers are placed at the provided center point).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support WebXR sessions over secure HTTPS.
- **FR-002**: System MUST integrate with a wildfire camera data source to retrieve georeferenced locations.
- **FR-003**: System MUST render camera markers on the Cesium globe using the provided georeferences.
- **FR-004**: System MUST implement a clustering/culling algorithm to manage marker density in crowded areas.
- **FR-005**: System MUST implement a parabolic interpolation function for camera transitions (camera flight).
- **FR-006**: System MUST render a floating 3D UI canvas for displaying live camera streams.
- **FR-007**: System MUST allow the user to select a camera feed from the markers.

### Key Entities

- **Wildfire Camera**: An entity with a georeference (Lat/Long), a live stream URL, and a metadata ID.
- **XR Session**: The state of the immersive WebXR session.
- **Viewport Controller**: Manages the camera's position and interpolation path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can enter XR mode from a secure HTTPS connection in under 5 seconds.
- **SC-002**: Markers are culled/clustered such that no more than X markers overlap at any given zoom level.
- **SC-003**: Camera flight transitions take between 1-3 seconds and maintain a smooth frame rate (min 60fps in XR).
- **SC-004**: 100% of available wildfire cameras with valid georeferences are correctly mapped.

## Assumptions

- **HTTPS Requirement**: WebXR requires a secure context; it is assumed the deployment environment provides valid SSL/TLS certificates.
- **Data Source**: It is assumed there is an API or dataset providing the real-time georeferenced locations of wildfire alert cameras.
- **Live Feed Format**: Camera feeds are assumed to be in a standard web-compatible stream format (e.g., HLS, RTSP-over-Web).
- **Coordinate System**: Standard WGS84 coordinates are used for the georeferencing.
