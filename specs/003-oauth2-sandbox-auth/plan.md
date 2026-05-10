# Implementation Plan: OAuth2 Sandbox Login & Auto-Registration

**Branch**: `003-integrated-cesium-sandbox` | **Date**: 2026-05-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-oauth2-sandbox-auth/spec.md`

## Summary

Implement the sandbox authentication layer so signed-out visitors are routed through an OAuth2 authorization-code flow, first-time verified identities are auto-registered as sandbox users, returning identities reuse the same account, and protected Cesium/WebXR content is available only through an active secure session. The implementation uses a small TypeScript auth module (`src/auth/*`) plus route handlers/middleware for login, callback, logout, session validation, and audit events.

## Technical Context

**Language/Version**: TypeScript 5.x targeting modern browsers and a Node.js-compatible web runtime  
**Primary Dependencies**: OAuth2/OIDC authorization-code-with-PKCE support, secure cookie/session utilities, crypto APIs, persistence adapter for users/identities/events  
**Storage**: Durable user + OAuth identity store; server-side or signed/encrypted session store; append-only authentication event log  
**Testing**: Vitest/Jest for unit tests; Playwright for browser auth/access-control flows with a mocked OAuth provider  
**Target Platform**: HTTPS web sandbox with Cesium/WebXR protected behind authentication  
**Project Type**: Web application auth module within the integrated Cesium sandbox  
**Performance Goals**: 95% of successful OAuth callbacks reach protected sandbox content within 10 seconds; session checks add no noticeable delay to globe loading  
**Constraints**: HTTPS-only session cookies; minimal profile collection; verified email only for email-based matching; no duplicate accounts for one verified provider subject  
**Scale/Scope**: First release supports one OAuth2 provider, with provider abstraction allowing additional providers later

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is still the default template and contains no enforceable project-specific gates. This plan applies the security and simplicity constraints from the feature spec and integrated master plan:

- **Secure Context**: PASS — OAuth redirects, cookies, and protected sandbox access require HTTPS except local development loopback.
- **Minimal Identity Data**: PASS — persist provider subject, provider id, verified email when available, display name/avatar only if needed for sandbox display, and audit metadata.
- **Duplicate Prevention**: PASS — uniqueness constraints on `(provider, providerSubject)` and verified-email matching policy prevent duplicate accounts.
- **Observable Auth Outcomes**: PASS — sign-in, cancellation/failure, account creation/reuse, sign-out, disabled-user denial, and persistence failures produce authentication events.

## Project Structure

### Documentation (this feature)

```text
specs/003-oauth2-sandbox-auth/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── auth-routes.md
│   └── auth-events.md
└── tasks.md              # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── auth/
│   ├── provider.ts       # OAuth2 provider configuration + auth URL/token/userinfo exchange
│   ├── session.ts        # HTTPS-only cookie/session create, read, refresh, expire
│   ├── user.ts           # Auto-registration, returning-user matching, disabled-user checks
│   ├── audit.ts          # Authentication event recording
│   └── middleware.ts     # Protected sandbox route/session guard
├── routes/
│   └── auth.ts           # /auth/login, /auth/callback, /auth/logout, /auth/session handlers
├── ui/
│   └── login.ts          # Signed-out login/retry state integrated with sandbox shell
└── main.ts               # Gates Cesium/WebXR initialization on authenticated session

tests/
├── unit/
│   └── auth/
│       ├── provider.test.ts
│       ├── session.test.ts
│       └── user.test.ts
└── e2e/
    └── auth-flow.spec.ts
```

**Structure Decision**: Single web application module layout aligned with the integrated sandbox plan. Authentication is isolated under `src/auth` so Cesium/WebXR code only depends on the session guard and current-user contract.

## Complexity Tracking

No constitution violations. OAuth2, persistence, sessions, and audit logging are required by the feature and kept behind small interfaces to avoid framework lock-in.
