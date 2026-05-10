# Research: Parabolic Flight Navigation

## Decision: Keep a custom requestAnimationFrame flight loop

**Rationale**: The feature requires a user-visible parabolic path, adaptive path height, predictable redirect behavior, and no snapping when a second destination is selected. A custom frame loop gives direct control over position interpolation, easing, cancellation, and completion semantics.

**Alternatives considered**:

- **Cesium `camera.flyTo`**: Good built-in navigation, but less direct control over exact parabolic path and latest-selection-wins redirect behavior.
- **Entity tracking**: Useful for following moving objects, but wildfire camera destinations are fixed points and this feature is a one-shot navigation transition.

## Decision: Use distance-aware duration and arc height

**Rationale**: The specification requires short flights to remain brief without excessive altitude changes, while distant flights should rise high enough to preserve travel context. Duration and maximum arc height should be derived from `Cartesian3.distance(start, destination)` and clamped to comfortable bounds.

Recommended defaults:

- Minimum duration: about 0.6 seconds for a close settle.
- Maximum duration: 4.0 seconds to satisfy SC-002.
- Near-distance arc: small height offset or skip if already focused.
- Long-distance arc: larger height offset capped to avoid disorienting globe jumps.

**Alternatives considered**:

- **Fixed duration and height**: Simpler, but creates overdramatic nearby flights and under-contextualized long flights.
- **User-provided-only settings**: Flexible, but violates the need for reliable defaults across near, medium, and far destinations.

## Decision: Latest selected destination wins immediately

**Rationale**: Repeated selections should not queue or stack conflicting movements. The cleanest behavior is to end the active flight token, use the current camera pose as the new start, and begin a new flight to the latest selected camera.

**Alternatives considered**:

- **Queue selections**: Predictable internally, but not responsive for rapid map exploration.
- **Ignore selections during flight**: Prevents conflicts, but fails P3 responsiveness.
- **Hard cancel then jump to new path**: Risks visible snapping. Redirect from current pose avoids this.

## Decision: Validate destinations before mutating the camera

**Rationale**: Invalid or incomplete camera locations must cause zero viewpoint jumps. The controller should reject or return an invalid result before changing selected destination state or starting animation.

Validation should reject:

- Missing camera object or missing position.
- Non-finite Cartesian coordinate components.
- Zero/near-zero Cartesian vectors that cannot produce a stable surface normal.

**Alternatives considered**:

- **Let Cesium throw**: Leaves state and user experience unpredictable.
- **Best-effort coercion**: Can move to unintended locations and violates SC-005.

## Decision: Preserve viewing mode and avoid XR-specific changes

**Rationale**: The feature must preserve the current viewing mode, including immersive modes, unless the user explicitly exits. The flight implementation should act on the existing Cesium camera only and avoid changing viewer mode, scene mode, fullscreen/XR state, or application shell state.

**Alternatives considered**:

- **Exit immersive mode before flight**: Simpler for debugging, but directly violates FR-006.
- **Dedicated immersive navigation path**: Out of scope for this feature; can be added later if mode-specific comfort rules are needed.

## Decision: Define explicit public outcomes

**Rationale**: Callers need predictable behavior for completed, skipped, canceled, redirected, and invalid flights. Explicit outcomes make testing and UI integration clearer than a `Promise<void>` that resolves for every terminal state.

**Alternatives considered**:

- **Keep `Promise<void>` only**: Backward-compatible but ambiguous.
- **Throw for every non-completed state**: Makes expected states like skip or redirect harder to handle.
