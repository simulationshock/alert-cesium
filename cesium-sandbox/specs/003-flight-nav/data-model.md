# Data Model: Parabolic Flight Navigation

## Entity: Wildfire Camera Location

A selectable wildfire camera destination on the globe.

**Fields**:

- `id: string` — stable identifier for selection and final destination checks.
- `name: string` — display name used by selection UI and diagnostics.
- `position: Cartesian3` — required Cesium world-coordinate destination.
- `metadata?: Record<string, unknown>` — optional source/status/feed details owned by adjacent camera-data features.

**Validation rules**:

- `id` must be non-empty for selected camera tracking.
- `position` must exist and contain finite `x`, `y`, and `z` values.
- `position` must not be a zero/near-zero vector because globe-relative normals become unstable.
- Missing optional metadata must not prevent navigation.

**Relationships**:

- Can become the active `Selected Destination`.
- Provides the destination for a `Camera Flight`.

## Entity: Selected Destination

The wildfire camera currently chosen as the latest intended navigation target.

**Fields**:

- `camera: WildfireCameraLocation | null` — latest valid selected destination.
- `selectedAt: number` — timestamp or monotonic marker for recency.
- `flightId?: string | number` — active or last associated flight token.

**Validation rules**:

- Updated only after destination validation succeeds.
- Latest valid selection supersedes earlier active selections.
- Invalid selections must not replace the previous valid selected destination unless product UI later requires an explicit cleared state.

**State transitions**:

```text
none -> selected-valid -> flight-active -> completed
                      \-> skipped-close
                      \-> redirected-by-new-selection -> flight-active
                      \-> canceled
invalid-selection -> no state mutation
```

## Entity: Camera Flight

A temporary camera navigation transition from the current Cesium viewpoint to a selected destination.

**Fields**:

- `id: string | number` — unique token for active flight ownership.
- `startPosition: Cartesian3` — snapshot of camera position at flight start or redirect.
- `targetPosition: Cartesian3` — validated destination position.
- `startOrientation` — snapshot of heading, pitch, and roll at flight start.
- `targetOrientation?` — optional heading, pitch, and roll overrides.
- `durationSeconds: number` — computed or caller-provided duration clamped to comfort bounds.
- `maximumHeightMeters: number` — computed or caller-provided parabolic arc height clamped to safe bounds.
- `startedAtMs: number` — monotonic start timestamp.
- `status: FlightStatus` — current lifecycle state.
- `outcome?: FlightOutcome` — terminal result.

**Validation rules**:

- `durationSeconds` must be positive and should not exceed the 4 second success criterion under default configuration.
- `maximumHeightMeters` must be non-negative and finite.
- Active frame updates must verify their flight token is still current before mutating the camera.
- Completion must set the final destination exactly once for the active token.

**State transitions**:

```text
idle -> active -> completed -> idle
idle -> skipped -> idle
active -> redirected -> active(new token)
active -> canceled -> idle
active -> failed-invalid -> idle
```

## Value Object: Flight Options

Caller-provided overrides for navigation behavior.

**Fields**:

- `duration?: number` — optional requested duration in seconds.
- `maximumHeight?: number` — optional requested arc height in meters.
- `heading?: number`
- `pitch?: number`
- `roll?: number`
- `zoomToHeight?: number` — optional future/settle behavior; should remain no-op unless implemented without snapping.
- `skipIfAlreadyFocused?: boolean` — optional close-range behavior flag; default true.

**Validation rules**:

- Numeric options must be finite.
- Invalid numeric overrides are ignored or reported without mutating camera position.
- Orientation interpolation should snapshot start values once, not read mutating camera orientation as the interpolation baseline each frame.

## Value Object: Flight Outcome

Terminal result returned by navigation calls.

**Values**:

- `completed` — arrived and framed selected camera.
- `skipped` — destination already close/focused enough; no significant motion needed.
- `redirected` — superseded by a later selection.
- `canceled` — explicitly canceled by caller.
- `invalid-destination` — rejected before camera mutation.

**Validation rules**:

- A superseded flight must not mark itself completed after a redirect.
- Invalid destination outcomes must produce zero viewpoint jumps.
