# Quickstart: Parabolic Flight Navigation

## Prerequisites

- Node.js and npm available in the development environment.
- Existing Cesium sandbox dependencies installed.

```bash
cd cesium-sandbox
npm install
```

## Build Check

Run TypeScript compilation after implementation changes:

```bash
npm run build
```

Expected result: `tsc` completes without type errors.

## Basic Usage

```ts
import { Cartesian3 } from 'cesium';
import { WildfireCameraFlightController } from './src';

const controller = new WildfireCameraFlightController(viewer.camera);

await controller.flyToCamera({
  id: 'camera-1',
  name: 'Mountain View Camera',
  position: Cartesian3.fromDegrees(-120.5, 38.2, 1000),
  metadata: { status: 'active' }
});
```

## Verify Core Scenario

1. Start with the Cesium globe visible.
2. Select a valid wildfire camera marker.
3. Confirm motion starts promptly.
4. Confirm the view follows a smooth upward arc.
5. Confirm the selected camera is clearly framed when motion completes.
6. Confirm normal globe controls still work.

## Verify Distance Behavior

Test three destinations:

- Nearby camera: brief motion or skip/settle with no excessive altitude.
- Medium-distance camera: visible smooth arc and comfortable duration.
- Far camera: rises enough to show travel context and completes within the 4 second target under default settings.

## Verify Repeated Selection

1. Select Camera A.
2. Before the flight completes, select Camera B.
3. Confirm the view redirects smoothly from the current pose.
4. Confirm Camera B, not Camera A, is the final selected/framed destination.

## Verify Invalid Destination

```ts
await controller.flyToCamera({
  id: 'bad-camera',
  name: 'Bad Camera',
  position: undefined as unknown as Cartesian3
});
```

Expected result:

- No camera jump.
- Previous valid viewpoint remains unchanged.
- The returned outcome indicates `invalid-destination` or equivalent expected invalid-input result.

## Verify Viewing Mode Preservation

1. Enter the current supported immersive or alternate viewing mode.
2. Select a valid wildfire camera.
3. Confirm the flight starts and completes without forcing an exit from that mode.

## Notes for Implementation

- Do not add camera data fetching or marker clustering in this feature.
- Keep per-frame calculations minimal.
- Snapshot start position and orientation at flight start/redirect.
- Guard animation callbacks with an active flight token so stale frames cannot mutate the camera.
