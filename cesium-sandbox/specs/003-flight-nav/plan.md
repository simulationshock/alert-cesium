# Implementation Plan: Parabolic Flight Navigation

**Branch**: `003-flight-nav` | **Date**: 2026-05-09 | **Spec**: `specs/003-flight-nav/spec.md`  
**Input**: Feature specification from `specs/003-flight-nav/spec.md`

## Summary

Implement smooth, distance-aware parabolic camera navigation from the current Cesium viewpoint to a selected wildfire camera location. The implementation builds on the existing TypeScript Cesium module by hardening `CameraFlight` and `WildfireCameraFlightController`: validate destinations, compute adaptive duration and arc height from travel distance, preserve orientation/viewing mode, support latest-selection-wins redirection, and expose a small public contract for camera destinations and flight status.

## Technical Context

**Language/Version**: TypeScript 5.x targeting the existing `tsconfig.json` project  
**Primary Dependencies**: Cesium `^1.120.0`; browser `requestAnimationFrame`; existing public module exports from `src/index.ts`  
**Storage**: N/A; camera flight state is in-memory only  
**Testing**: `npm run build` (`tsc`) for type safety; add unit-style tests or deterministic harnesses if a test runner is introduced later  
**Target Platform**: Browser-based Cesium globe application/library  
**Project Type**: Frontend TypeScript library/module for Cesium camera navigation  
**Performance Goals**: Valid selections begin motion within 250 ms; 95% of flights complete within 4 seconds; per-frame work remains lightweight enough for smooth render cadence during normal Cesium operation  
**Constraints**: Preserve current viewing mode; no navigation on invalid locations; latest camera selection wins during active flight; avoid jumps/snaps on cancel, redirect, skip, or completion  
**Scale/Scope**: Single Cesium viewer/camera controller instance; short/medium/long wildfire camera navigation; no fetching, clustering, or marker rendering changes in this feature

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The current constitution file is still the generated placeholder and defines no enforceable project-specific gates. Planning applies these practical gates from the feature spec instead:

- **User-value gate**: Every planned change must support selection-driven navigation to wildfire camera destinations.
- **Comfort gate**: Camera movement must be smooth, continuous, distance-aware, and free of visible snapping.
- **Safety/state gate**: Invalid destinations, repeated selections, completed flights, skipped flights, and canceled flights must leave Cesium in a valid interactive state.
- **Scope gate**: Do not add camera data fetching, marker clustering, or live video playback here.

**Gate status**: PASS. No constitution violations or unresolved clarifications.

## Project Structure

### Documentation (this feature)

```text
specs/003-flight-nav/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── flight-navigation.md
└── tasks.md              # Created later by /speckit.tasks, not by this plan
```

### Source Code (repository root)

```text
src/
├── CameraFlight.ts                       # Low-level parabolic flight engine
├── WildfireCameraFlightController.ts     # Selection-facing controller and latest-selection-wins behavior
└── index.ts                              # Public exports and types

package.json                             # build script and Cesium dependency
tsconfig.json                            # TypeScript compiler settings
README.md                                # usage examples to update if API changes
```

**Structure Decision**: Use the existing single TypeScript module layout. The feature is a browser/Cesium library behavior change, not a separate app or service, so no backend, storage, or multi-package structure is needed.

## Phase 0: Research Summary

Detailed findings are captured in `specs/003-flight-nav/research.md`.

Key decisions:

- Use a custom `requestAnimationFrame` animation loop instead of Cesium `camera.flyTo` because the feature requires explicit parabolic path shaping, redirect control, and distance-aware behavior.
- Compute duration and maximum arc height from current-to-target distance, with configurable min/max bounds.
- Treat a new selection during active motion as a redirect from the current camera pose to the new destination, not as a queued flight.
- Validate Cartesian destinations before starting motion; invalid input is a no-op with a rejected/failed result rather than a viewpoint mutation.

## Phase 1: Design Summary

Design artifacts are captured in:

- `specs/003-flight-nav/data-model.md`
- `specs/003-flight-nav/contracts/flight-navigation.md`
- `specs/003-flight-nav/quickstart.md`

Implementation approach:

1. Introduce explicit TypeScript interfaces for wildfire camera destinations, flight options, flight status, and flight outcomes.
2. Refactor `CameraFlight.flyTo` to snapshot start orientation once, compute adaptive path parameters, and avoid interpolating from mutating current orientation each frame.
3. Replace cancel-then-resolve ambiguity with deterministic redirect/cancel semantics so superseded flights cannot overwrite latest destination state.
4. Add destination validation and close-range skip/settle behavior in `WildfireCameraFlightController`.
5. Export public types from `src/index.ts` and update README examples if the public API changes.

## Post-Design Constitution Check

**Gate status**: PASS.

- User-value: The public controller remains selection-driven and destination-focused.
- Comfort: Distance-aware duration/height and stable orientation interpolation are included in design.
- Safety/state: Invalid, skipped, redirected, and completed flight outcomes are represented explicitly.
- Scope: No data-fetch, clustering, marker rendering, or video playback work is introduced.

## Complexity Tracking

No constitution gate violations or exceptional complexity accepted for this feature.
