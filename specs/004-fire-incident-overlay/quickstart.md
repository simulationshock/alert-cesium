# Quickstart: Live Fire Incident Overlay

**Feature**: 004-fire-incident-overlay  
**Date**: 2026-05-13

## Minimal usage (standalone)

```typescript
import { FireIncidentOverlay } from './src/FireIncidentOverlay.js';

// Given an existing Cesium Viewer:
const overlay = new FireIncidentOverlay(viewer, {
  refreshIntervalMs: 300_000  // 5 minutes (default)
});

// Load fire data and start auto-refresh:
const result = await overlay.load();
console.log(`Loaded ${result.incidentCount} active fire incidents`);
console.log(`${result.highlightedCameraCount} cameras are at risk`);
```

A toggle button is automatically injected into the viewer container. Click it to show/hide fire perimeters.

---

## With marker highlighting

```typescript
import { WildfireCameraMarkerManager } from './src/WildfireCameraMarkerManager.js';
import { FireIncidentOverlay } from './src/FireIncidentOverlay.js';

const markers = new WildfireCameraMarkerManager(viewer, { onSelect: handleSelect });
markers.setCameras(resolvedCameras);

const overlay = new FireIncidentOverlay(viewer, {
  markers,                    // pass markers so the overlay can highlight at-risk cameras
  proximityThresholdKm: 10,   // highlight cameras within 10 km of a perimeter
});

await overlay.load();
```

---

## Via the sandbox (recommended for full feature stack)

```typescript
import { WebXRWildfireCameraSandbox } from './src/WebXRWildfireCameraSandbox.js';

const sandbox = new WebXRWildfireCameraSandbox(viewer, {
  fireOverlay: {
    proximityThresholdKm: 5,
    refreshIntervalMs: 300_000
  }
});

// load() fetches both camera data and fire data:
const cameras = await sandbox.load();
```

---

## Programmatic toggle (no built-in button)

```typescript
const overlay = new FireIncidentOverlay(viewer, {
  showToggleButton: false   // suppress the injected button
});

await overlay.load();

// Consumer controls visibility:
myToggleButton.addEventListener('click', () => {
  overlay.setVisible(!overlay.visible);
});
```

---

## Custom endpoint

```typescript
// Use a different GeoJSON fire data source:
const overlay = new FireIncidentOverlay(viewer, {
  endpoint: 'https://example.com/api/fire-perimeters.geojson'
});
await overlay.load();

// Or override at load time:
await overlay.load('https://example.com/api/fire-perimeters.geojson');
```

---

## Cleanup

```typescript
// Always call destroy() when the viewer is torn down:
overlay.destroy();
```
