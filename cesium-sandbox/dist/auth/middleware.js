import { recordAuthEvent } from './audit.js';
import { currentUserState, parseCookie, SESSION_COOKIE, validateSession } from './session.js';
export async function requireSandboxSession(store, request, requestId) {
    const sessionId = parseCookie(request.headers.get('cookie'), SESSION_COOKIE);
    const valid = await validateSession(store, sessionId, requestId);
    if (valid)
        return { allowed: true, userState: currentUserState(valid.user, valid.session) };
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
//# sourceMappingURL=middleware.js.map