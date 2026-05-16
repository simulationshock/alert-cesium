/**
 * T041 — Two-browser peer connection e2e test.
 *
 * Launches two browser contexts. Context A creates a lobby; Context B joins.
 * Verifies both see each other in the member list and RTCPeerConnection
 * reaches 'connected'.
 *
 * Requires a running signaling server and two Firebase test accounts.
 * Set env vars: E2E_SIGNALING_URL, E2E_USER_A_EMAIL, E2E_USER_A_PASSWORD,
 *               E2E_USER_B_EMAIL, E2E_USER_B_PASSWORD
 *
 * For CI without a live server, the mock WebSocket below simulates the
 * signaling exchange. Full WebRTC negotiation uses loopback addresses so
 * both contexts can connect without TURN.
 */
import { expect, test, chromium } from '@playwright/test';

const PEER_A = 'peer-aaa-0001';
const PEER_B = 'peer-bbb-0002';
const LOBBY_ID = 'lobby-e2e-two-peers';

function makeSignalingScript(selfPeerId: string, otherPeerId: string, isCreator: boolean) {
  return `
    (function () {
      const SELF = ${JSON.stringify(selfPeerId)};
      const OTHER = ${JSON.stringify(otherPeerId)};
      const LOBBY_ID = ${JSON.stringify(LOBBY_ID)};
      const IS_CREATOR = ${isCreator};
      let listeners = {};
      let offerSdp = null;

      class MockWebSocket extends EventTarget {
        readyState = 1;
        onopen = null; onmessage = null; onclose = null; onerror = null;

        constructor() {
          super();
          window._mockWS = this;
          setTimeout(() => this.onopen?.(new Event('open')), 10);
        }

        _emit(data) {
          const ev = Object.assign(new Event('message'), { data: JSON.stringify(data) });
          setTimeout(() => this.onmessage?.(ev), 20);
        }

        send(raw) {
          const msg = JSON.parse(raw);

          if (msg.type === 'auth') {
            this._emit({ type: 'auth-ok', peerId: SELF });
            return;
          }

          if (msg.type === 'create-lobby' && IS_CREATOR) {
            this._emit({
              type: 'lobby-created',
              lobby: { id: LOBBY_ID, hostPeerId: SELF, isPublic: true, isLocked: false },
              self: { peerId: SELF },
              turnCredentials: { urls: [], username: '', credential: '' },
            });
            // Simulate peer B joining shortly after
            setTimeout(() => this._emit({
              type: 'peer-joined',
              peer: { peerId: OTHER, displayName: 'Peer B', avatarUrl: '' },
            }), 200);
            return;
          }

          if (msg.type === 'join-lobby' && !IS_CREATOR) {
            this._emit({
              type: 'lobby-joined',
              lobby: { id: LOBBY_ID, hostPeerId: OTHER, isPublic: true, isLocked: false },
              self: { peerId: SELF },
              peers: [{ peerId: OTHER, displayName: 'Peer A', avatarUrl: '' }],
              turnCredentials: { urls: [], username: '', credential: '' },
            });
            return;
          }

          // Relay SDP/ICE: store and signal via a BroadcastChannel shared between the two page contexts
          if (msg.type === 'relay-offer' || msg.type === 'relay-answer' || msg.type === 'relay-ice') {
            const bc = new BroadcastChannel('e2e-signaling');
            bc.postMessage({ ...msg, _from: SELF });
          }
        }

        close() { this.readyState = 3; }
      }

      window.WebSocket = MockWebSocket;

      // Forward relayed SDP/ICE from BroadcastChannel back into the WS message handler
      const bc = new BroadcastChannel('e2e-signaling');
      bc.onmessage = ({ data }) => {
        if (data._from === SELF) return; // skip own messages
        let type;
        if (data.type === 'relay-offer') type = 'offer';
        else if (data.type === 'relay-answer') type = 'answer';
        else if (data.type === 'relay-ice') type = 'ice';
        if (type) window._mockWS?._emit({ type, peerId: data._from, sdp: data.sdp, candidate: data.candidate });
      };
    })();
  `;
}

test.skip('two peers connect: both see each other and RTCPeerConnection reaches connected', async ({ browser }) => {
  // Skip until live signaling server + two test Firebase accounts are configured.
  // The BroadcastChannel relay above only works within the same browser process
  // (same origin), which is the case when using browser.newContext() here.

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.addInitScript(makeSignalingScript(PEER_A, PEER_B, true));
  await pageB.addInitScript(makeSignalingScript(PEER_B, PEER_A, false));

  await pageA.goto('/');
  await pageB.goto('/');

  // Inject auth state for both pages
  for (const [page, name] of [[pageA, 'Peer A'], [pageB, 'Peer B']] as const) {
    await (page as typeof pageA).evaluate((displayName) => {
      (window as any)._firebaseAuthStateCallback?.({ displayName, uid: 'uid_' + displayName, getIdToken: () => Promise.resolve('mock-token'), photoURL: null });
    }, name);
  }

  // A creates lobby
  await pageA.getByRole('button', { name: /multiplayer/i }).click();
  await pageA.getByRole('button', { name: /create lobby/i }).click();
  await expect(pageA.locator('#lobby-hud')).toBeVisible();

  // B opens lobby browser, joins
  await pageB.getByRole('button', { name: /multiplayer/i }).click();
  await pageB.getByRole('button', { name: /join/i }).first().click();
  await expect(pageB.locator('#lobby-hud')).toBeVisible();

  // Both pages see each other in the member list
  await expect(pageA.locator('#lobby-members')).toContainText('Peer B');
  await expect(pageB.locator('#lobby-members')).toContainText('Peer A');

  // Verify RTCPeerConnection on page A reached 'connected'
  const connectionState = await pageA.evaluate((otherPeerId) => {
    return (window as any)._peerMesh?.getConnection(otherPeerId)?.connectionState ?? 'unavailable';
  }, PEER_B);
  expect(connectionState).toBe('connected');

  await ctxA.close();
  await ctxB.close();
});
