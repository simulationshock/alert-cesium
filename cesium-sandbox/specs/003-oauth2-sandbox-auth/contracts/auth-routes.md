# Contract: Auth Routes

The sandbox exposes these auth interfaces to the browser shell. Exact framework routing can vary, but behavior and payloads must remain compatible.

## `GET /auth/login`

Starts OAuth2 sign-in.

**Query parameters**
- `returnTo` optional relative path to protected sandbox content; defaults to `/` or sandbox home.

**Behavior**
- Creates CSRF `state` and PKCE verifier challenge.
- Redirects to the configured OAuth2 provider authorization endpoint.
- Records `login_started`.

**Errors**
- If provider configuration is unavailable, return a user-friendly retry page and record `login_failed` with `provider_configuration_missing`.

## `GET /auth/callback`

Completes provider redirect.

**Query parameters**
- `code` provider authorization code on success
- `state` CSRF correlation value
- `error` / `error_description` provider error on cancellation or failure

**Behavior**
1. Validate `state`.
2. Exchange `code` with PKCE verifier for provider tokens.
3. Fetch/validate provider identity claims.
4. Require stable provider subject and required verified identity details.
5. Reuse existing user by `(provider, subject)`, or link/reuse by verified email when safe, or auto-register exactly one active user.
6. Create a secure session cookie.
7. Redirect to the requested protected sandbox path.
8. Record account and session events.

**User-facing failures**
- Provider cancellation/error: signed-out retry page.
- State mismatch: signed-out retry page and event `state_mismatch`.
- Missing verified identity details: signed-out explanation page.
- Disabled/blocked user: access denied page.
- Persistence failure: signed-out retry page.

## `POST /auth/logout`

Ends the current session.

**Behavior**
- Requires a valid session cookie when present.
- Marks the session ended with `signed_out`.
- Clears the session cookie.
- Records `logout_succeeded`.
- Redirects to the signed-out landing page.

## `GET /auth/session`

Returns minimal current-user state for the sandbox shell.

**Authenticated response**
```json
{
  "authenticated": true,
  "user": {
    "id": "usr_123",
    "displayName": "Darb Dude",
    "primaryVerifiedEmail": "user@example.com"
  },
  "expiresAt": "2026-05-09T20:00:00Z"
}
```

**Signed-out response**
```json
{
  "authenticated": false,
  "loginUrl": "/auth/login"
}
```

## Protected sandbox routes

All protected Cesium/WebXR routes and static app bootstrapping that exposes protected content must validate session state before returning protected content.

**Behavior**
- Valid active session: allow request and expose current user to application bootstrap.
- Missing/expired/invalid session: redirect to `/auth/login?returnTo=...` or return `401` for JSON/API requests.
- Disabled/blocked user: end session, record `access_denied`, return access denied page.
