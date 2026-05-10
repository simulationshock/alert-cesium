import { AuthenticatedSession, AuthenticationEvent, OAuth2Identity, SandboxUser } from './types';

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

export class InMemoryAuthStore implements AuthStore {
  readonly users = new Map<string, SandboxUser>();
  readonly identities = new Map<string, OAuth2Identity>();
  readonly sessions = new Map<string, AuthenticatedSession>();
  readonly events: AuthenticationEvent[] = [];

  async findUserById(id: string): Promise<SandboxUser | undefined> {
    return this.users.get(id);
  }

  async findUserByVerifiedEmail(email: string): Promise<SandboxUser[]> {
    const normalized = email.toLowerCase();
    return [...this.users.values()].filter(
      (user) => user.primaryVerifiedEmail?.toLowerCase() === normalized
    );
  }

  async saveUser(user: SandboxUser): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async findIdentity(provider: string, providerSubject: string): Promise<OAuth2Identity | undefined> {
    return this.identities.get(identityKey(provider, providerSubject));
  }

  async saveIdentity(identity: OAuth2Identity): Promise<void> {
    this.identities.set(identityKey(identity.provider, identity.providerSubject), { ...identity });
  }

  async findSession(id: string): Promise<AuthenticatedSession | undefined> {
    return this.sessions.get(id);
  }

  async saveSession(session: AuthenticatedSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async appendAuthEvent(event: AuthenticationEvent): Promise<void> {
    this.events.push({ ...event });
  }
}

function identityKey(provider: string, providerSubject: string): string {
  return `${provider}:${providerSubject}`;
}
