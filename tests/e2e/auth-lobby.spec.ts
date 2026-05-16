/**
 * T040 — Auth + lobby creation e2e test.
 *
 * Uses page.route() to intercept Firebase Auth REST calls and the signaling
 * server WebSocket, so no live Firebase project or server is required.
 *
 * To run against real Firebase, set env vars:
 *   E2E_FIREBASE_API_KEY, E2E_TEST_EMAIL, E2E_TEST_PASSWORD,
 *   E2E_SIGNALING_URL
 */
import { expect, test, type Page } from '@playwright/test';

const MOCK_DISPLAY_NAME = 'E2E Pilot';
const MOCK_UID = 'uid_e2e_pilot';
const MOCK_ID_TOKEN = 'mock-firebase-id-token';
const MOCK_PEER_ID = 'peer-e2e-0001';
const MOCK_LOBBY_ID = 'lobby-e2e-0001';

async function installFirebaseMock(page: Page) {
  // Intercept Firebase signInWithEmailAndPassword REST endpoint
  await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.returnSecureToken) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          idToken: MOCK_ID_TOKEN,
          email: body.email ?? 'test@example.com',
          displayName: MOCK_DISPLAY_NAME,
          localId: MOCK_UID,
          expiresIn: '3600',
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Intercept Firebase token refresh / getAccountInfo
  await page.route('https://securetoken.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ idToken: MOCK_ID_TOKEN, expiresIn: '3600' }),
    });
  });
}

async function installSignalingMock(page: Page) {
  // Mock responses are injected via window globals so the in-page WebSocket
  // constructor sees controlled behavior without a live server.
  await page.addInitScript(`
    (function () {
      const MOCK_PEER_ID = ${JSON.stringify(MOCK_PEER_ID)};
      const MOCK_LOBBY_ID = ${JSON.stringify(MOCK_LOBBY_ID)};

      class MockWebSocket extends EventTarget {
        readyState = 1; // OPEN
        url;
        onopen = null; onmessage = null; onclose = null; onerror = null;

        constructor(url) {
          super();
          this.url = url;
          setTimeout(() => {
            const ev = new Event('open');
            this.onopen?.(ev);
          }, 10);
        }

        send(data) {
          const msg = JSON.parse(data);
          let reply = null;

          if (msg.type === 'auth') {
            reply = { type: 'auth-ok', peerId: MOCK_PEER_ID };
          } else if (msg.type === 'create-lobby') {
            reply = {
              type: 'lobby-created',
              lobby: { id: MOCK_LOBBY_ID, hostPeerId: MOCK_PEER_ID, isPublic: msg.isPublic, isLocked: false },
              self: { peerId: MOCK_PEER_ID },
              turnCredentials: { urls: [], username: '', credential: '' },
            };
          }

          if (reply) {
            const ev = Object.assign(new Event('message'), { data: JSON.stringify(reply) });
            setTimeout(() => this.onmessage?.(ev), 20);
          }
        }

        close() { this.readyState = 3; }
      }

      window.WebSocket = MockWebSocket;
    })();
  `);

  // Also mock the HTTP GET /lobbies endpoint
  await page.route('**/lobbies', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: MOCK_LOBBY_ID, hostName: MOCK_DISPLAY_NAME, memberCount: 1, isLocked: false },
        ]),
      });
    } else {
      await route.continue();
    }
  });
}

test.skip('auth flow: sign in shows user name, create lobby appears in lobby browser', async ({ page }) => {
  // Skip until a test Firebase config is wired up (or mock mode above is adapted to the app's
  // actual Firebase initialization path). Remove the skip and set window.FIREBASE_CONFIG in the
  // page to activate.
  await installFirebaseMock(page);
  await installSignalingMock(page);

  await page.goto('/');

  // Verify signed-out state shows sign-in buttons
  await expect(page.locator('#auth-panel')).toBeVisible();
  await expect(page.locator('#auth-signed-out')).toBeVisible();

  // Simulate sign-in by injecting Firebase auth state
  await page.evaluate(({ displayName, uid, idToken }) => {
    // Directly fire the onAuthStateChanged callback via the auth object
    if ((window as any)._firebaseAuth) {
      const user = { displayName, uid, getIdToken: () => Promise.resolve(idToken), photoURL: null };
      (window as any)._firebaseAuthStateCallback?.(user);
    }
  }, { displayName: MOCK_DISPLAY_NAME, uid: MOCK_UID, idToken: MOCK_ID_TOKEN });

  // Signed-in state shows user display name
  await expect(page.locator('#auth-signed-in')).toBeVisible();
  await expect(page.locator('#auth-display-name')).toHaveText(MOCK_DISPLAY_NAME);

  // Open multiplayer / lobby browser
  await page.getByRole('button', { name: /multiplayer/i }).click();
  await expect(page.locator('#lobby-browser')).toBeVisible();

  // Create a public lobby
  await page.getByRole('button', { name: /create lobby/i }).click();

  // Verify lobby HUD appears with our lobby
  await expect(page.locator('#lobby-hud')).toBeVisible();
  await expect(page.locator('#lobby-id')).toHaveText(MOCK_LOBBY_ID);
});
