import { recordAuthEvent } from './audit.js';
import { AuthStore } from './storage.js';
import { AuthenticatedSession, CurrentUserState, SandboxUser, SignedOutState } from './types.js';
import { createId } from './audit.js';

export const SESSION_COOKIE = 'cesium_sandbox_session';
const DEFAULT_TTL_SECONDS = 60 * 60 * 8;

export async function createSession(store: AuthStore, user: SandboxUser, ttlSeconds = DEFAULT_TTL_SECONDS, requestId?: string): Promise<AuthenticatedSession> {
  const now = new Date();
  const session: AuthenticatedSession = {
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

export async function validateSession(store: AuthStore, sessionId: string | undefined, requestId?: string): Promise<{ session: AuthenticatedSession; user: SandboxUser } | undefined> {
  if (!sessionId) return undefined;
  const session = await store.findSession(sessionId);
  if (!session || session.endedAt) return undefined;
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

export async function endSession(store: AuthStore, sessionId: string | undefined, requestId?: string): Promise<void> {
  if (!sessionId) return;
  const session = await store.findSession(sessionId);
  if (!session || session.endedAt) return;
  await store.saveSession({ ...session, endedAt: new Date().toISOString(), endReason: 'signed_out' });
  await recordAuthEvent(store, { type: 'logout_succeeded', outcome: 'success', userId: session.userId, requestId });
}

export function currentUserState(user: SandboxUser, session: AuthenticatedSession): CurrentUserState {
  return { authenticated: true, user: { id: user.id, displayName: user.displayName, primaryVerifiedEmail: user.primaryVerifiedEmail }, expiresAt: session.expiresAt };
}

export function signedOutState(loginUrl = '/auth/login'): SignedOutState {
  return { authenticated: false, loginUrl };
}

export function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export function sessionCookie(session: AuthenticatedSession, secure = true): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(session.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge(session.expiresAt)}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure = true): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function maxAge(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}
