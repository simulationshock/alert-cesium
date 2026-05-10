# Tasks: Parabolic Flight Navigation

**Input**: `specs/003-flight-nav/spec.md`, `plan.md`, `data-model.md`, and `contracts/flight-navigation.md`

## Phase 1: Setup

- [X] T001 Verify TypeScript/Cesium project structure and build command.
- [X] T002 Create/verify ignore files for Node/TypeScript outputs.

## Phase 2: Core Implementation

- [X] T003 Add public flight/navigation contracts and shared types in `src/types.ts`.
- [X] T004 Refactor `src/CameraFlight.ts` for validated destinations, distance-aware duration/arc height, stable orientation snapshots, cancellation, and redirect-safe animation tokens.
- [X] T005 Refactor `src/WildfireCameraFlightController.ts` for valid selection tracking, close-range skip behavior, latest-selection-wins redirects, and outcome reporting.
- [X] T006 Export public flight API types from `src/index.ts`.

## Phase 3: Integration and Docs

- [X] T007 Preserve compatibility with adjacent wildfire camera modules using shared camera/feed/marker types.
- [X] T008 Update `README.md` with the outcome-returning navigation API and verification guidance.

## Phase 4: Validation

- [X] T009 Run TypeScript validation with `npx tsc --pretty false --noEmit`.
- [X] T010 Run package build with `npm run build`.
