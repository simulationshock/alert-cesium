# Multiplayer Signaling Server

A lightweight WebSocket signaling server for the alert-cesium multiplayer feature. It handles WebRTC handshake relay and lobby membership only — all map state, voice, video, and chat flow directly peer-to-peer over WebRTC data channels.

## Quick Start

```bash
cp .env.example .env
# Fill in .env values (see Environment Variables below)
npm install
npm run build
node dist/index.js
```

The server listens on `PORT` (default 8080). Clients connect via `ws://localhost:8080`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP/WebSocket port (default: `8080`) |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID for ID token validation |
| `TURN_SERVER_URL` | Yes | TURN server URL(s), comma-separated (e.g. `turn:your-server.com:3478`) |
| `TURN_SECRET` | Yes | Shared secret for HMAC-SHA1 ephemeral TURN credentials |
| `ALLOWED_ORIGINS` | No | Comma-separated allowed CORS origins (default: allow all) |

Copy `.env.example` to `.env` and populate all required values before starting.

## Firebase Setup

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Go to **Authentication → Sign-in method** and enable:
   - Google
   - GitHub (requires GitHub OAuth App — see [GitHub OAuth docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app))
   - Apple (requires Apple Developer account)
   - For Discord: add a custom OIDC provider (`oidc.discord`) via Firebase's OpenID Connect option
3. Go to **Project Settings → General** and copy your **Web API Key** and other config values
4. Set those values in the client's `window.FIREBASE_CONFIG`:

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  // ...
};
```

5. Set `FIREBASE_PROJECT_ID` in the server `.env` to the same project ID.

The server uses the Firebase Admin SDK with **Application Default Credentials**. In production, set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON path, or use Workload Identity if running on GCP.

## TURN Server Options

TURN relay is needed for the ~15–20% of peer connections that cannot go direct (symmetric NAT, corporate firewalls). The server generates short-lived HMAC-SHA1 credentials using your `TURN_SECRET`.

### Option A: Cloudflare Calls (free tier, recommended for low traffic)

Cloudflare Calls provides TURN relay. Follow the [Cloudflare Calls TURN docs](https://developers.cloudflare.com/calls/turn/) to get a TURN URL and secret, then set:

```
TURN_SERVER_URL=turns:cloudflare-turn-endpoint.com:443?transport=tcp
TURN_SECRET=your-cloudflare-turn-secret
```

### Option B: Metered (usage-based pricing)

[Metered.ca](https://www.metered.ca/tools/openrelay/) offers a managed TURN service with pay-as-you-go pricing. No self-hosting needed.

### Option C: Self-hosted coturn

Install [coturn](https://github.com/coturn/coturn) on a VPS with a public IP:

```bash
apt install coturn
```

Minimal `/etc/turnserver.conf`:

```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=your-strong-secret
realm=your-domain.com
cert=/path/to/cert.pem
pkey=/path/to/key.pem
```

Then set:

```
TURN_SERVER_URL=turn:your-vps-ip:3478,turns:your-domain.com:5349
TURN_SECRET=your-strong-secret
```

## Lobby Semantics

- Max 6 members per lobby
- Lobby state is ephemeral — lost when the last member leaves
- Host powers: kick, lock/unlock, toggle public/private, promote host
- On host departure: departing host should broadcast full annotation state to peers before leaving; the server promotes the next member as host
- Private lobbies require a join code; public lobbies appear in `GET /lobbies`

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/lobbies` | Returns array of public lobby summaries |

## WebSocket Protocol

See [`specs/005-multiplayer-lobbies/contracts/signaling-messages.md`](../specs/005-multiplayer-lobbies/contracts/signaling-messages.md) for the full message schema reference.

Authentication flow:
1. Client connects via WebSocket
2. Client must send `{type: "auth", idToken: "<Firebase ID token>"}` within 5 seconds
3. Server validates token, assigns `peerId` (UUID v4), responds with `{type: "auth-ok", peerId}`
4. Connection is closed with code `4001` if auth message is not received in time
