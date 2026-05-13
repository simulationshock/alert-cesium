<!--
SYNC IMPACT REPORT
==================
Version change: (none) → 1.0.0
Modified principles: N/A — initial population from blank placeholder template
Added sections: Core Principles (I–V), Technology Constraints, Development Workflow, Governance
Removed sections: All placeholder tokens replaced; template comments stripped
Templates updated:
  ✅ .specify/templates/plan-template.md — Constitution Check gate updated to reference principles by name
  ✅ .specify/templates/spec-template.md — No constitution-specific references; no update needed
  ✅ .specify/templates/tasks-template.md — No constitution-specific references; no update needed
Deferred TODOs:
  - RATIFICATION_DATE: set to 2026-05-09 (earliest traceable plan.md date); confirm if project predates this
-->

# ALERT Cesium Constitution

## Core Principles

### I. Browser-First Module Architecture

All code under `src/` MUST be importable and composable in a browser ESM environment
without a Node.js runtime. No Node.js-only APIs (`fs`, `path`, `http`, `crypto`) may
appear in the library core. Server utilities (HTTPS dev server, CORS proxy) MUST
remain isolated outside `src/` — currently in `serve.mjs`.

**Rationale**: The library is consumed by browser-based CesiumJS applications and
WebXR hosts. Node.js entanglement breaks the ESM distribution contract and prevents
the library from loading in secure browser contexts.

### II. Immersive Comfort and Safety

Camera motion MUST be smooth, distance-aware, and free of abrupt jumps, snaps, or
sudden stops. Operations MUST NOT force viewing mode transitions (WebXR entry or exit)
unless the user explicitly requests them. Every flight, cancellation, redirect, or
skip MUST leave the Cesium viewer in a valid, fully interactive state.

**Rationale**: The primary use context is immersive and large-screen. Disorienting
motion degrades usability and, in XR, can cause physical discomfort. Viewer state
corruption after any operation is a hard failure.

### III. Explicit Outcome Contracts

All async operations that mutate camera or session state MUST return a typed outcome
value. Silent state mutations, swallowed exceptions, and unresolved promise ambiguity
are prohibited. Callers MUST be able to branch on outcome
(`completed`, `skipped`, `redirected`, `canceled`, `invalid-destination`) without
inspecting internal module state.

**Rationale**: Camera flight, auth sessions, and XR sessions each have multiple
legitimate end states. Explicit typed contracts prevent callers from making incorrect
assumptions about viewer state after an operation resolves.

### IV. Concern Isolation

Navigation, data fetching, marker rendering, authentication, and WebXR session
management are discrete concerns and MUST NOT bleed across module boundaries within
a single feature. A feature MUST NOT add cross-concern implementation unless its
sole stated purpose is integration of those concerns. Each `plan.md` MUST include
a scope gate that explicitly names and rejects out-of-scope work.

**Rationale**: The project's module surface grows quickly. Isolation keeps each
module independently testable and replaceable, and prevents one feature's scope
from silently pulling in unrelated changes.

### V. Build-First Validation

`npm run build` (TypeScript compilation via `tsc`) is the non-negotiable correctness
gate for every change. All changes MUST pass `tsc --noEmit` before being considered
complete. Playwright e2e tests MUST pass for the auth and XR flight paths before
merging changes that touch those flows.

**Rationale**: This is a TypeScript library with no runtime type enforcement.
Compilation is the primary safety net. E2e tests cover the flows most likely to
regress silently when adjacent modules change.

## Technology Constraints

- **Language**: TypeScript 5.x
- **3D Engine**: CesiumJS ^1.120.0 — consumed via importmap or CDN IIFE shim
- **Runtime target**: Browser only for `src/`; Node.js only for `serve.mjs` and build tooling
- **WebXR**: Requires HTTPS secure context; self-signed certificate acceptable for local dev
  (see `serve.mjs` for the self-signed HTTPS server)
- **Auth**: OAuth2 with HTTPS-only session enforcement
- **Testing**: Playwright for e2e flows; `tsc --noEmit` for type validation;
  no unit test framework mandated yet
- **Build output**: `dist/` — compiled ESM files consumed by `web-demo/index.html`
  via `../dist/` relative path

New runtime dependencies added to `src/` MUST be evaluated for browser ESM
compatibility and bundle-size impact before adoption.

## Development Workflow

New features follow the Speckit cycle in order:

```
/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-implement
```

Each feature lives under `specs/###-feature-name/` and MUST include a populated
`plan.md` with a Constitution Check gate satisfied before implementation begins.
The gate MUST explicitly verify or waive each of the five Core Principles for that
feature's scope.

Feature branches follow the naming convention `feature/###-short-name`. The `specs/`
directory is the authoritative source for feature intent; `src/` is the authoritative
source for implementation.

## Governance

This constitution supersedes all other practices, planning documents, and prior
conventions. Amendments require:

1. A version bump following semantic versioning:
   - MAJOR: principle removal or incompatible redefinition
   - MINOR: new principle or section added
   - PATCH: clarification, wording, or non-semantic refinement
2. A Sync Impact Report embedded as an HTML comment at the top of this file.
3. Propagation review of all dependent templates (`plan-template.md`, `spec-template.md`,
   `tasks-template.md`) with ✅ updated or ⚠ pending status recorded in the report.
4. Re-evaluation of any open `plan.md` Constitution Check sections if principles change.

The Constitution Check section in each `plan.md` is the per-feature compliance review.
All new plans MUST cite the principles most relevant to their scope gate.

**Version**: 1.0.0 | **Ratified**: 2026-05-09 | **Last Amended**: 2026-05-10
