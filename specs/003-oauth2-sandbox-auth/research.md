# Research: OAuth2 Sandbox Login & Auto-Registration

## Decision: Use OAuth2 authorization code with PKCE

**Rationale**: Authorization code with PKCE is the safest default for browser-initiated login flows and works with both public-client and backend-assisted architectures. It avoids exposing client secrets in the browser and provides replay protection for the authorization response.

**Alternatives considered**:
- Implicit flow: rejected because it is legacy and exposes tokens in browser-facing redirects.
- Resource-owner password flow: rejected because users must not give provider credentials to the sandbox.
- Local password accounts: rejected because the feature explicitly requires trusted external identity login.

## Decision: Match returning users by provider subject first, verified email second

**Rationale**: `(provider, subject)` is the stable OAuth/OIDC identity key and should be the primary uniqueness constraint. Verified email can be used to link/reuse an existing account only when the provider explicitly confirms the email is verified.

**Alternatives considered**:
- Email-only matching: rejected because unverified or mutable emails can create account-takeover and duplicate-account risks.
- Display-name matching: rejected because names are not unique or verified.
- Always create a new account on first provider use: rejected because it fails the duplicate prevention and account reuse requirements.

## Decision: Persist minimal user, identity, session, and audit data

**Rationale**: The feature requires durable auto-registration, returning-user recognition, active sessions, and operational review. Persist only fields needed for recognition, display, access control, and audit: provider id, provider subject, verified email if available, display name/avatar if used, status, timestamps, and event outcomes.

**Alternatives considered**:
- Store full provider profile: rejected because it violates minimal collection requirements.
- Stateless-only sessions with no user store: rejected because first-time auto-registration and repeat identity matching require durable records.
- No audit log: rejected because FR-010 requires security-relevant outcomes for review.

## Decision: Use secure HTTP-only session cookies with server validation

**Rationale**: HTTP-only, SameSite, Secure cookies reduce token exposure to client scripts and integrate cleanly with protected browser routes. Server validation supports expiry, revocation, disabled-user blocking, and session renewal policy.

**Alternatives considered**:
- Store OAuth access tokens in localStorage: rejected due to XSS exposure and unnecessary provider-token retention.
- Client-only auth state: rejected because protected sandbox access must be enforceable, not just hidden in UI.
- Long-lived bearer tokens in URLs: rejected because URLs leak through logs, history, and referrers.

## Decision: Gate Cesium/WebXR initialization on authenticated session

**Rationale**: Protected sandbox content must not initialize for signed-out users. Gating at the shell/middleware level keeps 3D modules independent from provider details while guaranteeing access control before protected content loads.

**Alternatives considered**:
- Render globe first, then hide controls: rejected because protected content may be visible before auth completes.
- Auth checks inside every Cesium module: rejected because it scatters access-control logic and increases bypass risk.

## Decision: Test against a mocked OAuth provider

**Rationale**: Deterministic unit and Playwright tests can cover success, cancellation, invalid state, missing verified identity, duplicate prevention, disabled users, session expiry, and persistence failures without depending on a live third-party provider.

**Alternatives considered**:
- Manual-only provider testing: rejected because the edge cases are core requirements.
- Live provider tests in CI: rejected for initial release because they require secrets and can be flaky; keep as optional smoke tests later.
