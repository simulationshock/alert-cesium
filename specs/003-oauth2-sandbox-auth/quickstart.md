# Quickstart: OAuth2 Sandbox Login & Auto-Registration

## 1. Configure local auth

Create local development configuration outside source control with:

- OAuth2 provider authorization endpoint
- OAuth2 token endpoint
- OAuth2 userinfo or identity endpoint
- Client id
- Client secret only if the selected provider/client type requires one server-side
- Redirect URI: `https://localhost:<port>/auth/callback` or the framework's HTTPS local URL
- Session signing/encryption secret
- User/session/event store connection settings

Do not commit secrets.

## 2. Run the sandbox over HTTPS

OAuth2 cookies and WebXR require secure context. Local loopback may be accepted by browsers, but the app should still exercise secure-cookie behavior in tests where possible.

Expected local flow:

1. Open protected sandbox URL.
2. Signed-out shell shows OAuth2 sign-in option.
3. Choose sign-in.
4. Mock or real provider authenticates and redirects back to `/auth/callback`.
5. First successful verified identity auto-creates a sandbox user.
6. Browser lands on protected Cesium/WebXR sandbox.
7. Logout clears session and protected access redirects to sign-in again.

## 3. Run focused tests

Unit tests should cover:

- Provider auth URL creation with state + PKCE.
- Callback state mismatch rejection.
- Missing provider subject rejection.
- Missing/unverified required email rejection when email matching is needed.
- Auto-registration creates exactly one user.
- Repeat provider subject reuses existing user.
- Verified email conflict handling.
- Disabled/blocked user denial.
- Session expiry and logout.
- Authentication event emission without secrets.

E2E tests should cover:

- Signed-out protected access redirects to login.
- Successful first-time OAuth flow reaches protected content.
- Returning user signs in without duplicate account creation.
- Provider cancellation shows retry path.
- Expired session blocks protected content.

## 4. Manual acceptance checklist

- [ ] OAuth2 sign-in option is visible before protected content.
- [ ] Successful provider login creates or reuses one user and creates a session.
- [ ] Protected sandbox content is inaccessible when signed out.
- [ ] Sign-out ends the session and clears the cookie.
- [ ] Failed/cancelled auth produces a clear retry path.
- [ ] Auth and registration outcomes are recorded without tokens or secrets.
- [ ] Only minimal required profile fields are stored.
