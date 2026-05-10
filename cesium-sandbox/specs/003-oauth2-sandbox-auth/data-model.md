# Data Model: OAuth2 Sandbox Login & Auto-Registration

## SandboxUser

Represents a registered person allowed to access protected sandbox content.

**Fields**
- `id`: stable internal user id
- `status`: `active` | `disabled` | `blocked`
- `displayName`: optional display name shown in sandbox UI
- `primaryVerifiedEmail`: optional verified email for account matching and display
- `avatarUrl`: optional display image if the sandbox UI uses one
- `createdAt`: registration timestamp
- `updatedAt`: last profile/status update timestamp
- `lastLoginAt`: last successful sign-in timestamp

**Validation rules**
- `status` defaults to `active` for auto-registered users unless blocked by policy.
- Disabled or blocked users cannot receive new authenticated sessions.
- `primaryVerifiedEmail` can be set only from verified provider claims or an already trusted account record.

**Relationships**
- One `SandboxUser` has one or more `OAuth2Identity` records.
- One `SandboxUser` has zero or more active or expired `AuthenticatedSession` records.
- One `SandboxUser` has many `AuthenticationEvent` records.

## OAuth2Identity

Represents a verified external provider identity linked to a sandbox user.

**Fields**
- `id`: stable identity record id
- `userId`: owning `SandboxUser.id`
- `provider`: provider key, e.g. `github`, `google`, or configured sandbox provider id
- `providerSubject`: provider-specific stable subject/user id
- `verifiedEmail`: optional provider-confirmed verified email
- `displayName`: optional provider display name retained only if needed
- `avatarUrl`: optional provider avatar retained only if needed
- `createdAt`: first linked timestamp
- `lastSeenAt`: most recent successful sign-in timestamp

**Validation rules**
- `(provider, providerSubject)` must be globally unique.
- `verifiedEmail` must not be populated from an unverified provider claim.
- If a provider subject already exists, sign-in must reuse its user account.
- If no provider subject exists but verified email matches one active user, the identity may link to that user according to matching policy.
- If verified email matches multiple accounts or a disabled/blocked account, fail safely and record an event.

## AuthenticatedSession

Represents temporary signed-in state granting protected sandbox access.

**Fields**
- `id`: opaque session id or token id
- `userId`: authenticated user id
- `createdAt`: session creation timestamp
- `expiresAt`: hard expiry timestamp
- `lastSeenAt`: last validation timestamp
- `endedAt`: optional sign-out/revocation timestamp
- `endReason`: optional `signed_out` | `expired` | `revoked` | `user_disabled`

**Validation rules**
- Sessions are valid only when not ended, not expired, and the user status is `active`.
- Cookies carrying session references must be `HttpOnly`, `Secure`, and `SameSite=Lax` or stricter.
- Session expiry must block protected access and route the user to sign in again.

**State transitions**
- `created` → `active`
- `active` → `expired`
- `active` → `signed_out`
- `active` → `revoked`
- `active` → `revoked` when user becomes disabled/blocked

## AuthenticationEvent

Append-only operational record for security-relevant auth outcomes.

**Fields**
- `id`: event id
- `type`: `login_started` | `login_succeeded` | `login_failed` | `login_cancelled` | `account_created` | `account_reused` | `identity_linked` | `session_created` | `session_expired` | `logout_succeeded` | `access_denied`
- `userId`: optional user id when known
- `provider`: optional provider key
- `providerSubjectHash`: optional non-reversible hash for correlation without exposing raw provider subject in logs
- `outcome`: `success` | `failure` | `denied`
- `reason`: optional machine-readable reason such as `missing_verified_identity`, `provider_error`, `state_mismatch`, `disabled_user`, `persistence_failure`
- `createdAt`: event timestamp
- `requestId`: optional request correlation id

**Validation rules**
- Events must not contain OAuth access tokens, refresh tokens, client secrets, or raw authorization codes.
- Failure events should be specific enough for operations without leaking sensitive identity data to users.
