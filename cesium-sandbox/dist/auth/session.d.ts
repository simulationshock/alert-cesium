import { AuthStore } from './storage.js';
import { AuthenticatedSession, CurrentUserState, SandboxUser, SignedOutState } from './types.js';
export declare const SESSION_COOKIE = "cesium_sandbox_session";
export declare function createSession(store: AuthStore, user: SandboxUser, ttlSeconds?: number, requestId?: string): Promise<AuthenticatedSession>;
export declare function validateSession(store: AuthStore, sessionId: string | undefined, requestId?: string): Promise<{
    session: AuthenticatedSession;
    user: SandboxUser;
} | undefined>;
export declare function endSession(store: AuthStore, sessionId: string | undefined, requestId?: string): Promise<void>;
export declare function currentUserState(user: SandboxUser, session: AuthenticatedSession): CurrentUserState;
export declare function signedOutState(loginUrl?: string): SignedOutState;
export declare function parseCookie(header: string | null, name: string): string | undefined;
export declare function sessionCookie(session: AuthenticatedSession, secure?: boolean): string;
export declare function clearSessionCookie(secure?: boolean): string;
//# sourceMappingURL=session.d.ts.map