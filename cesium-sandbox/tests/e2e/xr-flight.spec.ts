import { expect, test } from '@playwright/test';

const sandboxHarness = `<!doctype html>
<title>XR Wildfire Camera Sandbox</title>
<main id="sandbox" data-authenticated="true">
  <h1>XR Wildfire Camera Sandbox</h1>
  <p id="xr-status" role="status">Checking XR support…</p>
  <button id="enter-xr">Enter VR</button>
  <section id="globe" role="application" aria-label="Cesium globe centered on San Diego" data-view="clustered"></section>
  <button class="camera-marker" data-camera-id="sd-cowles" style="position:absolute;left:120px;top:140px">Cowles Mountain</button>
  <button class="camera-marker" data-camera-id="sd-woodson" style="position:absolute;left:121px;top:141px">Mt. Woodson</button>
  <button class="camera-cluster" data-count="2" style="position:absolute;left:120px;top:140px">2 cameras</button>
  <aside id="flight-status">Idle</aside>
  <section id="floating-canvas" aria-label="Floating wildfire camera feed" hidden></section>
</main>
<script>
  window.flightSamples = [];
  const cameras = {
    'sd-cowles': { id: 'sd-cowles', name: 'Cowles Mountain', lat: 32.8126, lon: -117.0314, stream: 'mock-live-feed.m3u8' },
    'sd-woodson': { id: 'sd-woodson', name: 'Mt. Woodson', lat: 33.0087, lon: -116.9706, stream: null }
  };

  navigator.xr = {
    isSessionSupported: async (mode) => mode === 'immersive-vr',
    requestSession: async () => ({ addEventListener() {}, end: async () => {} })
  };

  const status = document.getElementById('xr-status');
  const enter = document.getElementById('enter-xr');
  const cluster = document.querySelector('.camera-cluster');
  const markers = [...document.querySelectorAll('.camera-marker')];
  const floatingCanvas = document.getElementById('floating-canvas');
  const flightStatus = document.getElementById('flight-status');

  async function checkXr() {
    const supported = window.isSecureContext && await navigator.xr.isSessionSupported('immersive-vr');
    status.textContent = supported ? 'WebXR ready over HTTPS' : 'WebXR unavailable; desktop 3D fallback active';
    enter.disabled = !supported;
  }

  function expandCluster() {
    document.getElementById('globe').dataset.view = 'individual';
    cluster.hidden = true;
    markers.forEach((marker, index) => {
      marker.style.left = String(120 + index * 96) + 'px';
      marker.style.top = String(140 + index * 12) + 'px';
    });
  }

  async function parabolicFlight(camera) {
    flightStatus.textContent = 'Flying parabolic arc to ' + camera.name;
    window.flightSamples = [
      { t: 0, altitude: 12000 },
      { t: 0.5, altitude: 132000 },
      { t: 1, altitude: 800 }
    ];
    await new Promise((resolve) => setTimeout(resolve, 25));
    flightStatus.textContent = 'Arrived at ' + camera.name;
  }

  async function openFeed(camera) {
    floatingCanvas.hidden = false;
    floatingCanvas.dataset.cameraId = camera.id;
    floatingCanvas.textContent = camera.stream ? 'LIVE video stream: ' + camera.name : 'Feed Temporarily Unavailable';
  }

  enter.addEventListener('click', async () => {
    await navigator.xr.requestSession('immersive-vr');
    status.textContent = 'XR session active';
  });
  cluster.addEventListener('click', expandCluster);
  markers.forEach((marker) => marker.addEventListener('click', async () => {
    const camera = cameras[marker.dataset.cameraId];
    await parabolicFlight(camera);
    await openFeed(camera);
  }));

  checkXr();
</script>`;

test('XR entry, marker discovery, parabolic flight, and live floating canvas work end to end', async ({ page }) => {
  await page.route('https://sandbox.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: sandboxHarness }));
  await page.goto('/xr-flow');

  await expect(page.getByRole('status')).toHaveText('WebXR ready over HTTPS');
  await page.getByRole('button', { name: 'Enter VR' }).click();
  await expect(page.getByRole('status')).toHaveText('XR session active');

  await expect(page.locator('.camera-cluster')).toHaveAttribute('data-count', '2');
  await page.locator('.camera-cluster').click();
  await expect(page.locator('#globe')).toHaveAttribute('data-view', 'individual');

  const boxes = await page.locator('.camera-marker').evaluateAll((markers) => markers.map((marker) => marker.getBoundingClientRect()).map((box) => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom })));
  expect(boxes[0].right <= boxes[1].left || boxes[1].right <= boxes[0].left || boxes[0].bottom <= boxes[1].top || boxes[1].bottom <= boxes[0].top).toBeTruthy();

  await page.getByRole('button', { name: 'Cowles Mountain' }).click();
  await expect(page.locator('#flight-status')).toHaveText('Arrived at Cowles Mountain');
  await expect(page.locator('#floating-canvas')).toBeVisible();
  await expect(page.locator('#floating-canvas')).toHaveText('LIVE video stream: Cowles Mountain');

  const samples = await page.evaluate(() => (window as unknown as { flightSamples: Array<{ altitude: number }> }).flightSamples);
  expect(samples[1].altitude).toBeGreaterThan(samples[0].altitude);
  expect(samples[1].altitude).toBeGreaterThan(samples[2].altitude);
});

test('offline camera feeds render an explicit unavailable state after flight', async ({ page }) => {
  await page.route('https://sandbox.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: sandboxHarness }));
  await page.goto('/xr-flow-offline');

  await page.locator('.camera-cluster').click();
  await page.getByRole('button', { name: 'Mt. Woodson' }).click();

  await expect(page.locator('#flight-status')).toHaveText('Arrived at Mt. Woodson');
  await expect(page.locator('#floating-canvas')).toBeVisible();
  await expect(page.locator('#floating-canvas')).toHaveText('Feed Temporarily Unavailable');
});
