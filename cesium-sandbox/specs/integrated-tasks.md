# Integrated Cesium Wildfire Sandbox – Task List

## 1️⃣ Auth Layer (OAuth2 + Auto‑registration)
- **Agent**: `openai-codex/gpt-5.5`
- **Description**: Implement the OAuth2 login flow, handle token exchange, create user records on first login, and enforce HTTPS‑only sessions.
- **Deliverables**:
  - `src/auth/provider.ts` – OAuth provider abstraction.
  - `src/auth/session.ts` – Secure session middleware.
  - `src/auth/user.ts` – Auto‑registration logic.
  - Unit tests covering login, token refresh, and registration.

## 2️⃣ 3D Core & Cesium Initialization
- **Agent**: `nvidia/qwen/qwen3-coder-480b-a35b-instruct`
- **Description**: Set up CesiumJS, center the globe on San Diego, and expose a basic camera controller.
- **Deliverables**:
  - `src/core/globe.ts` – Cesium init with San‑Diego coordinates.
  - `src/core/camera-controller.ts` – Basic orbit controls.
  - Integration with the auth session to hide the globe until logged in.

## 3️⃣ WebXR & Spatial UI (Floating Canvas)
- **Agent**: `nvidia/qwen/qwen3-coder-480b-a35b-instruct`
- **Description**: Enable WebXR entry, create a floating UI canvas that can display a live video stream, and wire it to the XR scene.
- **Deliverables**:
  - `src/ui/xr-manager.ts` – WebXR session handling.
  - `src/ui/spatial-canvas.ts` – 3‑D canvas component for live feeds.
  - Interaction logic to open/close the canvas.

## 4️⃣ Wildfire Camera Data Layer & Clustering
- **Agent**: `openai-codex/gpt-5.5`
- **Description**: Fetch georeferenced wildfire camera data, store it locally, and implement a clustering/culling algorithm to avoid marker overload.
- **Deliverables**:
  - `src/data/camera-api.ts` – API client for the wildfire feed service.
  - `src/data/clustering.ts` – Density‑based clustering (e.g., Supercluster).
  - Marker rendering integration in `src/core/globe.ts`.

## 5️⃣ Parabolic Navigation (Camera Flight)
- **Agent**: `nvidia/qwen/qwen3-coder-480b-a35b-instruct`
- **Description**: Implement smooth parabolic interpolation when the user selects a camera marker, to prevent motion‑sickness.
- **Deliverables**:
  - `src/core/flight-controller.ts` – Compute parabola trajectory and animate Cesium camera.
  - Configuration for speed/arc parameters.

## 6️⃣ End‑to‑End Testing & CI
- **Agent**: `openai-codex/gpt-5.5`
- **Description**: Write Playwright end‑to‑end tests that cover the full flow: login → XR entry → marker selection → video canvas → flight.
- **Deliverables**:
  - `tests/e2e/login.spec.ts`
  - `tests/e2e/xr-flight.spec.ts`
  - GitHub Actions workflow (`.github/workflows/ci.yml`) that runs the tests on push.

---
*All tasks are independent and can be worked on in parallel. Sub‑agents will be spawned with the appropriate high‑power model, and they inherit the `GH_TOKEN` from the parent environment for any GitHub API interactions.*