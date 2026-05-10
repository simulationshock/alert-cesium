# Cesium Wildfire Camera Flight System

This module provides smooth, distance-aware parabolic camera flight animations for transitioning between wildfire camera locations in Cesium.

## Features

- **Parabolic Flight Animation**: Smooth camera transitions with arcing motion paths for natural-looking movement.
- **Distance-Aware Defaults**: Short, medium, and long flights automatically adjust duration and arc height, clamped to comfortable limits.
- **Latest Selection Wins**: Selecting a new camera during an active flight redirects from the current pose instead of queueing conflicting motion.
- **Safe Outcomes**: Invalid destinations, close-range skips, redirects, cancellations, and completions return explicit outcomes.
- **Viewing Mode Friendly**: Flights use camera pose updates only and do not force WebXR or other viewing mode exits.

## Installation

```bash
npm install               # install dependencies
npm run build             # compile TypeScript to `dist/`
```

The sandbox can be served as a static site after the build step.


```bash
npm install
npm run build
```

## Usage

```ts
import { Cartesian3 } from 'cesium';
import { WildfireCameraFlightController } from './src';

const flightController = new WildfireCameraFlightController(viewer.camera);

const outcome = await flightController.flyToCamera({
  id: 'camera-1',
  name: 'Mountain View Camera',
  position: Cartesian3.fromDegrees(-120.5, 38.2, 1000),
  metadata: { status: 'active' }
});

if (outcome.status === 'completed') {
  console.log('Camera framed');
}
```

## API

### `CameraFlight`

Low-level parabolic flight engine. It validates Cartesian destinations, computes distance-aware defaults, snapshots starting orientation once, and guards animation frames with active flight tokens.

### `WildfireCameraFlightController`

Selection-facing controller for wildfire camera destinations.

```ts
flyToCamera(camera, options?): Promise<CameraFlightOutcome>
cancelFlight(): CameraFlightOutcome | null
getSelectedCamera(): WildfireCameraLocation | null
getStatus(): CameraFlightStatus
```

Returned outcomes include `completed`, `skipped`, `redirected`, `canceled`, and `invalid-destination`.

## Verification

- Select near, medium, and far camera destinations and confirm smooth, continuous motion.
- Select Camera B while flying to Camera A and confirm Camera B is the final destination.
- Pass an invalid destination and confirm no camera jump occurs.
- Run `npm run build` before publishing changes.

## Running the Demo (Desktop & WebXR)

The sandbox ships a simple static HTML page that works in any modern desktop browser **and** on browsers that support WebXR (e.g., Chrome on Android, Oculus Browser, Edge on Windows Mixed Reality).

### 1. Build the library

```bash
npm install               # install dependencies (if not already done)
npm run build             # produces the `dist/` folder
```

### 2. Serve the demo

You can use any static server. Two common options:

```bash
# Python 3
python -m http.server 8000 -d web-demo
# Node.js (serve the `web-demo` folder)
npx serve web-demo -l 8000
```

Open your browser at `http://localhost:8000`. The page loads Cesium from the CDN, enables the **VR button** (`vrButton: true`) and instantiates `WebXRWildfireCameraSandbox`. On a regular desktop you’ll see the globe with the XR button disabled (or hidden). On an XR‑capable device the button will launch an immersive session.

### 3. HTTPS for XR devices

WebXR requires a **secure context**. For local testing you can use the self‑signed HTTPS guide from the `cesium-globe` README (the same steps apply here). Generate a certificate and serve with HTTPS, e.g.:

```bash
openssl genrsa -out localhost.key 2048
openssl req -new -x509 -key localhost.key -out localhost.crt -days 365 -subj "/CN=localhost"
npx serve web-demo -l 8443 --ssl-cert localhost.crt --ssl-key localhost.key
```

Then open `https://localhost:8443` on your XR device and accept the security exception. The XR button will become active, allowing you to test the sandbox in an immersive session.

