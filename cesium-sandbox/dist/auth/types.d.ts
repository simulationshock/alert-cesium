export type UserStatus = 'active' | 'disabled' | 'blocked';
export interface SandboxUser {
    id: string;
    status: UserStatus;
    displayName?: string;
    email?: string;
    emailVerified?: boolean;
    primaryVerifiedEmail?: string;
    avatarUrl?: string;
    createdAt: string;
    updatedAt: string;
    lastLoginAt?: string;
}
export interface OAuth2Identity {
    id: string;
    userId: string;
    provider: string;
    providerSubject: string;
    verifiedEmail?: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
    avatarUrl?: string;
    createdAt: string;
    updatedAt?: string;
    lastSeenAt?: string;
}
export type SessionEndReason = 'signed_out' | 'expired' | 'revoked' | 'user_disabled';
export interface AuthenticatedSession {
    id: string;
    userId: string;
    createdAt?: string;
    issuedAt?: string;
    expiresAt: string;
    lastSeenAt?: string;
    endedAt?: string;
    endReason?: SessionEndReason;
}
export type AuthenticationEventType = 'login_started' | 'login_succeeded' | 'login_failed' | 'login_cancelled' | 'account_created' | 'account_reused' | 'identity_linked' | 'session_created' | 'session_expired' | 'logout_succeeded' | 'access_denied' | 'user_denied' | 'user_registered' | 'user_reused';
export type AuthenticationEventOutcome = 'success' | 'failure' | 'denied';
export interface AuthenticationEvent {
    id: string;
    type: AuthenticationEventType;
    outcome: AuthenticationEventOutcome;
    createdAt: string;
    requestId?: string;
    userId?: string;
    provider?: string;
    providerSubjectHash?: string;
    reason?: string;
    identityId?: string;
}
export interface ProviderProfile {
    provider: string;
    subject: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
    avatarUrl?: string;
}
export interface VerifiedOAuthProfile {
    provider: string;
    providerSubject: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
    avatarUrl?: string;
}
export type AuthResult = {
    ok: true;
    user: SandboxUser;
    identity: OAuth2Identity;
    created: boolean;
} | {
    ok: false;
    reason: string;
};
export interface CurrentUserState {
    authenticated: true;
    user: Pick<SandboxUser, 'id' | 'displayName' | 'primaryVerifiedEmail'>;
    expiresAt: string;
}
export interface SignedOutState {
    authenticated: false;
    loginUrl: string;
}
export declare function nowIso(): string;
export declare function randomId(prefix: string): string;
//# sourceMappingURL=types.d.ts.map