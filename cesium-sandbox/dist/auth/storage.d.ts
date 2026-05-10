import { AuthenticatedSession, AuthenticationEvent, OAuth2Identity, SandboxUser } from './types.js';
export interface AuthStore {
    findUserById(id: string): Promise<SandboxUser | undefined>;
    findUserByVerifiedEmail(email: string): Promise<SandboxUser[]>;
    saveUser(user: SandboxUser): Promise<void>;
    findIdentity(provider: string, providerSubject: string): Promise<OAuth2Identity | undefined>;
    saveIdentity(identity: OAuth2Identity): Promise<void>;
    findSession(id: string): Promise<AuthenticatedSession | undefined>;
    saveSession(session: AuthenticatedSession): Promise<void>;
    appendAuthEvent(event: AuthenticationEvent): Promise<void>;
}
export declare class InMemoryAuthStore implements AuthStore {
    readonly users: Map<string, SandboxUser>;
    readonly identities: Map<string, OAuth2Identity>;
    readonly sessions: Map<string, AuthenticatedSession>;
    readonly events: AuthenticationEvent[];
    findUserById(id: string): Promise<SandboxUser | undefined>;
    findUserByVerifiedEmail(email: string): Promise<SandboxUser[]>;
    saveUser(user: SandboxUser): Promise<void>;
    findIdentity(provider: string, providerSubject: string): Promise<OAuth2Identity | undefined>;
    saveIdentity(identity: OAuth2Identity): Promise<void>;
    findSession(id: string): Promise<AuthenticatedSession | undefined>;
    saveSession(session: AuthenticatedSession): Promise<void>;
    appendAuthEvent(event: AuthenticationEvent): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map