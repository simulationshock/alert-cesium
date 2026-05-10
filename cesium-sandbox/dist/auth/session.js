import { recordAuthEvent } from './audit.js';
import { createId } from './audit.js';
export const SESSION_COOKIE = 'cesium_sandbox_session';
const DEFAULT_TTL_SECONDS = 60 * 60 * 8;
export async function createSession(store, user, ttlSeconds = DEFAULT_TTL_SECONDS, requestId) {
    const now = new Date();
    const session = {
        id: createId('ses'),
        userId: user.id,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
        lastSeenAt: now.toISOString()
    };
    await store.saveSession(session);
    await recordAuthEvent(store, { type: 'session_created', outcome: 'success', userId: user.id, requestId });
    return session;
}
export async function validateSession(store, sessionId, requestId) {
    if (!sessionId)
        return undefined;
    const session = await store.findSession(sessionId);
    if (!session || session.endedAt)
        return undefined;
    const now = new Date();
    if (new Date(session.expiresAt).getTime() <= now.getTime()) {
        await store.saveSession({ ...session, endedAt: now.toISOString(), endReason: 'expired' });
        await recordAuthEvent(store, { type: 'session_expired', outcome: 'failure', userId: session.userId, requestId });
        return undefined;
    }
    const user = await store.findUserById(session.userId);
    if (!user || user.status !== 'active') {
        await store.saveSession({ ...session, endedAt: now.toISOString(), endReason: 'user_disabled' });
        await recordAuthEvent(store, { type: 'access_denied', outcome: 'denied', userId: session.userId, reason: user?.status === 'blocked' ? 'blocked_user' : 'disabled_user', requestId });
        return undefined;
    }
    const refreshedSession = { ...session, lastSeenAt: now.toISOString() };
    await store.saveSession(refreshedSession);
    return { session: refreshedSession, user };
}
export async function endSession(store, sessionId, requestId) {
    if (!sessionId)
        return;
    const session = await store.findSession(sessionId);
    if (!session || session.endedAt)
        return;
    await store.saveSession({ ...session, endedAt: new Date().toISOString(), endReason: 'signed_out' });
    await recordAuthEvent(store, { type: 'logout_succeeded', outcome: 'success', userId: session.userId, requestId });
}
export function currentUserState(user, session) {
    return { authenticated: true, user: { id: user.id, displayName: user.displayName, primaryVerifiedEmail: user.primaryVerifiedEmail }, expiresAt: session.expiresAt };
}
export function signedOutState(loginUrl = '/auth/login') {
    return { authenticated: false, loginUrl };
}
export function parseCookie(header, name) {
    if (!header)
        return undefined;
    const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}
export function sessionCookie(session, secure = true) {
    return `${SESSION_COOKIE}=${encodeURIComponent(session.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge(session.expiresAt)}${secure ? '; Secure' : ''}`;
}
export function clearSessionCookie(secure = true) {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
function maxAge(expiresAt) {
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}
//# sourceMappingURL=session.js.map