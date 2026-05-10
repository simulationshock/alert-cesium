# Contract: Flight Navigation Public API

This feature exposes TypeScript module contracts for Cesium camera flight behavior. It does not add HTTP APIs or persistent storage.

## Module Exports

From `src/index.ts`:

```ts
export { CameraFlight } from './CameraFlight';
export { WildfireCameraFlightController } from './WildfireCameraFlightController';
export type {
  WildfireCameraLocation,
  CameraFlightOptions,
  CameraFlightOutcome,
  CameraFlightStatus
};
```

## `WildfireCameraLocation`

```ts
interface WildfireCameraLocation {
  id: string;
  name: string;
  position: Cartesian3;
  metadata?: Record<string, unknown>;
}
```

**Contract requirements**:

- `position` is mandatory for navigation.
- Invalid positions must be rejected before any camera movement.
- Metadata is pass-through and must not affect flight validity.

## `CameraFlightOptions`

```ts
interface CameraFlightOptions {
  duration?: number;
  maximumHeight?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  zoomToHeight?: number;
  skipIfAlreadyFocused?: boolean;
}
```

**Contract requirements**:

- Omitted options use distance-aware defaults.
- Provided finite numeric options may override defaults but still must respect safety clamps.
- Invalid option values must not cause a camera jump.

## `CameraFlightOutcome`

```ts
type CameraFlightOutcome =
  | { status: 'completed'; cameraId?: string }
  | { status: 'skipped'; cameraId?: string; reason: 'already-focused' }
  | { status: 'redirected'; cameraId?: string; redirectedToId?: string }
  | { status: 'canceled'; cameraId?: string }
  | { status: 'invalid-destination'; cameraId?: string; reason: string };
```

**Contract requirements**:

- A valid flight that reaches the selected destination resolves with `completed`.
- A close/current destination may resolve with `skipped` without visible motion.
- A superseded active flight resolves with `redirected`; the newer flight owns final destination state.
- Invalid destinations resolve or reject consistently as `invalid-destination` before camera mutation. Prefer resolving with an outcome for expected user-input invalidity.

## `WildfireCameraFlightController.flyToCamera`

```ts
flyToCamera(
  camera: WildfireCameraLocation,
  options?: CameraFlightOptions
): Promise<CameraFlightOutcome>
```

**Preconditions**:

- Controller was constructed with a valid Cesium `Camera`.
- `camera.position` is a valid finite `Cartesian3`.

**Postconditions**:

- Valid selections begin navigation within the responsiveness target during normal operation.
- The selected camera is clearly framed on `completed`.
- The latest valid camera selection is the final destination after repeated selections.
- Current viewing mode is preserved.
- Cesium camera remains interactive after completed, skipped, canceled, redirected, and invalid outcomes.

## `CameraFlight.flyTo`

```ts
flyTo(
  targetPosition: Cartesian3,
  options?: CameraFlightOptions
): Promise<CameraFlightOutcome>
```

**Preconditions**:

- `targetPosition` is a finite non-zero Cartesian position.

**Postconditions**:

- Uses a smooth parabolic path from the current camera position to the target.
- Uses stable easing with no abrupt acceleration, sudden stop, or sharp reversal.
- Frame callbacks from old flight tokens cannot mutate the camera after redirect/cancel.

## Selection/Redirect Behavior

```text
select Camera A -> flight A active
select Camera B before A completes -> A resolves redirected, B starts from current pose
B completes -> selected destination is Camera B
```

The contract forbids queued camera flights for individual marker selection in this feature. Latest valid selection wins.
