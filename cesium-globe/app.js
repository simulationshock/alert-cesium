// app.js
// Initialize Cesium Viewer
const viewer = new Cesium.Viewer('cesiumContainer', {
  terrainProvider: Cesium.createWorldTerrain(),
  baseLayerPicker: false,
  fullscreenButton: false,
  animation: false,
  timeline: false,
  infoBox: false,
  geocoder: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  vrButton: false,
  selectionIndicator: false,
});

// Set initial view to San Diego
const sanDiegoPosition = Cesium.Cartesian3.fromDegrees(-117.1611, 32.7157, 100000);
viewer.camera.setView({
  destination: sanDiegoPosition,
});

// Add San Diego marker
const entity = viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(-117.1611, 32.7157),
  point: {
    pixelSize: 10,
    color: Cesium.Color.RED,
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
  },
  label: {
    text: 'San Diego',
    font: '14px sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, -20),
  },
});

// Get control buttons
const resetViewBtn = document.getElementById('resetView');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const rotateLeftBtn = document.getElementById('rotateLeft');
const rotateRightBtn = document.getElementById('rotateRight');
const rotateUpBtn = document.getElementById('rotateUp');
const rotateDownBtn = document.getElementById('rotateDown');

// Camera control functions
function resetView() {
  viewer.camera.setView({
    destination: sanDiegoPosition,
  });
}

function zoomIn() {
  viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.2);
}

function zoomOut() {
  viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.2);
}

function rotateLeft() {
  const heading = viewer.camera.heading - Cesium.Math.toRadians(10);
  viewer.camera.setView({
    orientation: {
      heading: heading,
      pitch: viewer.camera.pitch,
      roll: viewer.camera.roll,
    },
  });
}

function rotateRight() {
  const heading = viewer.camera.heading + Cesium.Math.toRadians(10);
  viewer.camera.setView({
    orientation: {
      heading: heading,
      pitch: viewer.camera.pitch,
      roll: viewer.camera.roll,
    },
  });
}

function rotateUp() {
  const pitch = Math.min(
    viewer.camera.pitch + Cesium.Math.toRadians(10),
    Cesium.Math.toRadians(89)
  );
  viewer.camera.setView({
    orientation: {
      heading: viewer.camera.heading,
      pitch: pitch,
      roll: viewer.camera.roll,
    },
  });
}

function rotateDown() {
  const pitch = Math.max(
    viewer.camera.pitch - Cesium.Math.toRadians(10),
    Cesium.Math.toRadians(-89)
  );
  viewer.camera.setView({
    orientation: {
      heading: viewer.camera.heading,
      pitch: pitch,
      roll: viewer.camera.roll,
    },
  });
}

// Event listeners for buttons
resetViewBtn.addEventListener('click', resetView);
zoomInBtn.addEventListener('click', zoomIn);
zoomOutBtn.addEventListener('click', zoomOut);
rotateLeftBtn.addEventListener('click', rotateLeft);
rotateRightBtn.addEventListener('click', rotateRight);
rotateUpBtn.addEventListener('click', rotateUp);
rotateDownBtn.addEventListener('click', rotateDown);

// Add keyboard controls
document.addEventListener('keydown', function(event) {
  switch (event.key) {
    case 'r':
      resetView();
      break;
    case '+':
    case '=':
      zoomIn();
      break;
    case '-':
    case '_':
      zoomOut();
      break;
    case 'ArrowLeft':
      rotateLeft();
      break;
    case 'ArrowRight':
      rotateRight();
      break;
    case 'ArrowUp':
      rotateUp();
      break;
    case 'ArrowDown':
      rotateDown();
      break;
  }
});

// Fly to San Diego on startup
viewer.camera.flyTo({
  destination: sanDiegoPosition,
  duration: 3,
});