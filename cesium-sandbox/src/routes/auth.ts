import { recordAuthEvent } from '../auth/audit';
import { createAuthorizationRedirect, exchangeAuthorizationCode, fetchProviderProfile, OAuth2ProviderConfig, OAuthLoginStateStore, safeReturnTo } from '../auth/provider';
import { AuthStore } from '../auth/storage';
import { clearSessionCookie, createSession, currentUserState, endSession, parseCookie, SESSION_COOKIE, sessionCookie, signedOutState, validateSession } from '../auth/session';
import { AuthUserError, resolveOrRegisterUser } from '../auth/user';

export interface AuthRoutesOptions {
  store: AuthStore;
  stateStore: OAuthLoginStateStore;
  provider: OAuth2ProviderConfig;
  secureCookies?: boolean;
  sessionTtlSeconds?: number;
}

export class AuthRoutes {
  constructor(private readonly options: AuthRoutesOptions) {}

  async login(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const returnTo = safeReturnTo(url.searchParams.get('returnTo') ?? '/');
    try {
      const redirect = await createAuthorizationRedirect(this.options.provider, this.options.stateStore, returnTo);
      await recordAuthEvent(this.options.store, { type: 'login_started', outcome: 'success', provider: this.options.provider.provider });
      return Response.redirect(redirect, 302);
    } catch (error) {
      const reason = reasonFrom(error, 'provider_configuration_missing');
      await recordAuthEvent(this.options.store, { type: 'login_failed', outcome: 'failure', provider: this.options.provider.provider, reason });
      return htmlResponse('Sign-in is temporarily unavailable. Please try again later.', 503);
    }
  }

  async callback(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const providerError = url.searchParams.get('error');
    const state = url.searchParams.get('state') ?? '';
    const storedState = state ? await this.options.stateStore.consume(state) : undefined;

    if (providerError) {
      await recordAuthEvent(this.options.store, { type: 'login_cancelled', outcome: 'failure', provider: this.options.provider.provider, reason: 'user_cancelled' });
      return htmlResponse('Sign-in was cancelled. You can retry whenever you are ready.', 400);
    }
    if (!storedState) {
      await recordAuthEvent(this.options.store, { type: 'login_failed', outcome: 'failure', provider: this.options.provider.provider, reason: 'state_mismatch' });
      return htmlResponse('Sign-in could not be verified. Please retry.', 400);
    }

    try {
      const code = url.searchParams.get('code');
      if (!code) throw new Error('provider_error');
      const token = await exchangeAuthorizationCode(this.options.provider, code, storedState.codeVerifier);
      const accessToken = typeof token.access_token === 'string' ? token.access_token : undefined;
      if (!accessToken) throw new Error('token_exchange_failed');
      const profile = await fetchProviderProfile(this.options.provider, accessToken);
      const resolved = await resolveOrRegisterUser(this.options.store, profile);
      const session = await createSession(this.options.store, resolved.user, this.options.sessionTtlSeconds);
      await recordAuthEvent(this.options.store, { type: 'login_succeeded', outcome: 'success', provider: profile.provider, providerSubject: profile.subject, userId: resolved.user.id });
      return redirectWithCookie(storedState.returnTo, sessionCookie(session, this.options.secureCookies ?? true));
    } catch (error) {
      const reason = reasonFrom(error, 'provider_error');
      await recordAuthEvent(this.options.store, { type: 'login_failed', outcome: 'failure', provider: this.options.provider.provider, reason });
      const status = reason === 'disabled_user' || reason === 'blocked_user' ? 403 : 400;
      return htmlResponse('Sign-in failed. Please retry or contact the sandbox operator.', status);
    }
  }

  async logout(request: Request): Promise<Response> {
    const sessionId = parseCookie(request.headers.get('cookie'), SESSION_COOKIE);
    await endSession(this.options.store, sessionId);
    return redirectWithCookie('/', clearSessionCookie(this.options.secureCookies ?? true));
  }

  async session(request: Request): Promise<Response> {
    const sessionId = parseCookie(request.headers.get('cookie'), SESSION_COOKIE);
    const valid = await validateSession(this.options.store, sessionId);
    if (!valid) return Response.json(signedOutState('/auth/login'));
    return Response.json(currentUserState(valid.user, valid.session));
  }
}

function redirectWithCookie(location: string, cookie: string): Response {
  return new Response(null, { status: 302, headers: { Location: location, 'Set-Cookie': cookie } });
}

function htmlResponse(message: string, status: number): Response {
  return new Response(`<!doctype html><title>Cesium Sandbox Auth</title><main>${escapeHtml(message)}</main>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function reasonFrom(error: unknown, fallback: string): string {
  if (error instanceof AuthUserError) return error.reason;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'reason' in error && typeof (error as { reason?: unknown }).reason === 'string') return (error as { reason: string }).reason;
  return fallback;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[character] ?? character));
}
