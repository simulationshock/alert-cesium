# Contract: Authentication Events

Authentication events are append-only operational records used for security review and troubleshooting. They must never include OAuth tokens, authorization codes, client secrets, raw session cookies, or unredacted sensitive provider payloads.

## Event envelope

```json
{
  "id": "evt_123",
  "type": "login_succeeded",
  "outcome": "success",
  "createdAt": "2026-05-09T19:05:00Z",
  "requestId": "req_abc",
  "userId": "usr_123",
  "provider": "configured-provider",
  "providerSubjectHash": "sha256:...",
  "reason": null
}
```

## Required event types

| Type | Outcome | Required context |
|------|---------|------------------|
| `login_started` | `success` | provider, requestId |
| `login_succeeded` | `success` | provider, userId, providerSubjectHash |
| `login_failed` | `failure` | provider when known, reason |
| `login_cancelled` | `failure` | provider when known, reason |
| `account_created` | `success` | provider, userId, providerSubjectHash |
| `account_reused` | `success` | provider, userId, providerSubjectHash |
| `identity_linked` | `success` | provider, userId, providerSubjectHash |
| `session_created` | `success` | userId |
| `session_expired` | `failure` | userId when known |
| `logout_succeeded` | `success` | userId when known |
| `access_denied` | `denied` | userId when known, reason |

## Failure reasons

Allowed initial reason values:
- `provider_error`
- `user_cancelled`
- `state_mismatch`
- `token_exchange_failed`
- `userinfo_failed`
- `missing_provider_subject`
- `missing_verified_identity`
- `duplicate_identity_conflict`
- `disabled_user`
- `blocked_user`
- `session_missing`
- `session_expired`
- `session_invalid`
- `persistence_failure`
- `provider_configuration_missing`

## Retention and privacy notes

- Store provider subject as a hash in logs unless the durable identity store already requires the raw subject.
- Keep user-facing error text generic; keep operational details in `reason`.
- Auth event persistence failure must not silently grant access. If the event store is unavailable, login may proceed only if account/session persistence succeeds and the failure is surfaced to operational logs without exposing secrets.
