# CesiumJS Globe Viewer - San Diego

This project creates an interactive 3D globe using CesiumJS, centered on San Diego with basic camera controls.

## Features

- 3D globe visualization centered on San Diego
- Interactive camera controls (zoom, rotate)
- Responsive UI with on-screen controls
- Keyboard shortcuts for navigation
- San Diego location marker

## Setup

1. Serve the files using a local web server:

   ```bash
   # Python 3
   python -m http.server 8000
   # Node.js (serve over HTTP)
   npx serve .
   # For HTTPS (self‑signed) see the "Self‑signed HTTPS" section below
   ```


   ```bash
   # If you have Python 3
   python -m http.server 8000
   
   # If you have Python 2
   python -m SimpleHTTPServer 8000
   
   # If you have Node.js
   npx serve .
   ```

2. Open your browser and navigate to `http://localhost:8000`

## Controls

### On-screen Controls
- **Reset View**: Reset camera to initial San Diego view
- **Zoom In/Out**: Adjust camera distance
- **Rotate**: Rotate camera in different directions

### Keyboard Shortcuts
- **R**: Reset view
- **+/-**: Zoom in/out
- **Arrow Keys**: Rotate camera

## Implementation Details

The implementation uses:
- CesiumJS for 3D globe rendering
- CDN-hosted CesiumJS library (no build required)
- Basic camera controls for navigation
- Entity markers to highlight San Diego on the globe

## File Structure
```
cesium-globe/
├── index.html    # Main HTML file
├── app.js        # JavaScript implementation
├── webxr-demo/   # WebXR demonstration
└── README.md     # This file
```

## Self‑signed HTTPS (required for WebXR)

WebXR sessions require a secure context (HTTPS). You can create a self‑signed certificate for local testing:

```bash
# Generate a private key
openssl genrsa -out localhost.key 2048
# Generate a self‑signed certificate valid for localhost
openssl req -new -x509 -key localhost.key -out localhost.crt -days 365 -subj "/CN=localhost"
# Serve with HTTPS using a simple Node server (install serve if not present)
npm install -g serve
serve -l 8443 --ssl-cert localhost.crt --ssl-key localhost.key
```

Open your browser at `https://localhost:8443` and accept the security warning (add an exception). This will allow XR sessions to start.

## Customization


To center on a different location:
1. Modify the longitude/latitude in `app.js`:
   ```javascript
   // Change these coordinates
   const sanDiegoPosition = Cesium.Cartesian3.fromDegrees(-117.1611, 32.7157, 100000);
   ```

2. Update the entity marker position:
   ```javascript
   const entity = viewer.entities.add({
     position: Cesium.Cartesian3.fromDegrees(-117.1611, 32.7157), // Update these
     // ... rest of entity config
   });
   ```