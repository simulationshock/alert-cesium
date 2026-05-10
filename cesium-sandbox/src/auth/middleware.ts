import { recordAuthEvent } from './audit';
import { AuthStore } from './storage';
import { currentUserState, parseCookie, SESSION_COOKIE, validateSession } from './session';

export interface GuardResult {
  allowed: boolean;
  response?: Response;
  userState?: ReturnType<typeof currentUserState>;
}

export async function requireSandboxSession(store: AuthStore, request: Request, requestId?: string): Promise<GuardResult> {
  const sessionId = parseCookie(request.headers.get('cookie'), SESSION_COOKIE);
  const valid = await validateSession(store, sessionId, requestId);
  if (valid) return { allowed: true, userState: currentUserState(valid.user, valid.session) };

  await recordAuthEvent(store, { type: 'access_denied', outcome: 'denied', reason: sessionId ? 'session_invalid' : 'session_missing', requestId });
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('application/json')) {
    return { allowed: false, response: Response.json({ authenticated: false, loginUrl: '/auth/login' }, { status: 401 }) };
  }

  const url = new URL(request.url);
  const login = new URL('/auth/login', url.origin);
  login.searchParams.set('returnTo', `${url.pathname}${url.search}`);
  return { allowed: false, response: Response.redirect(login, 302) };
}
