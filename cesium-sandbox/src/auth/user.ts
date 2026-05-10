import { createId, recordAuthEvent } from './audit';
import { AuthStore } from './storage';
import { OAuth2Identity, ProviderProfile, SandboxUser } from './types';

export interface ResolveUserResult {
  user: SandboxUser;
  identity: OAuth2Identity;
  createdUser: boolean;
  linkedIdentity: boolean;
}

export async function resolveOrRegisterUser(
  store: AuthStore,
  profile: ProviderProfile,
  requestId?: string
): Promise<ResolveUserResult> {
  if (!profile.subject) throw new AuthUserError('missing_provider_subject');

  const now = new Date().toISOString();
  const existingIdentity = await store.findIdentity(profile.provider, profile.subject);
  if (existingIdentity) {
    const user = await requireActiveUser(store, existingIdentity.userId);
    const updatedIdentity = { ...existingIdentity, lastSeenAt: now };
    const updatedUser = { ...user, lastLoginAt: now, updatedAt: now };
    await store.saveIdentity(updatedIdentity);
    await store.saveUser(updatedUser);
    await recordAuthEvent(store, { type: 'account_reused', outcome: 'success', provider: profile.provider, providerSubject: profile.subject, userId: user.id, requestId });
    return { user: updatedUser, identity: updatedIdentity, createdUser: false, linkedIdentity: false };
  }

  const verifiedEmail = profile.emailVerified ? profile.email : undefined;
  let user: SandboxUser | undefined;
  let createdUser = false;
  let linkedIdentity = false;

  if (verifiedEmail) {
    const matches = await store.findUserByVerifiedEmail(verifiedEmail);
    const activeMatches = matches.filter((candidate) => candidate.status === 'active');
    if (matches.length !== activeMatches.length) throw new AuthUserError('disabled_user');
    if (activeMatches.length > 1) throw new AuthUserError('duplicate_identity_conflict');
    user = activeMatches[0];
  }

  if (!user) {
    if (!verifiedEmail) throw new AuthUserError('missing_verified_identity');
    user = {
      id: createId('usr'),
      status: 'active',
      displayName: profile.displayName,
      primaryVerifiedEmail: verifiedEmail,
      avatarUrl: profile.avatarUrl,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    };
    createdUser = true;
    await store.saveUser(user);
    await recordAuthEvent(store, { type: 'account_created', outcome: 'success', provider: profile.provider, providerSubject: profile.subject, userId: user.id, requestId });
  } else {
    user = { ...user, lastLoginAt: now, updatedAt: now };
    linkedIdentity = true;
    await store.saveUser(user);
    await recordAuthEvent(store, { type: 'identity_linked', outcome: 'success', provider: profile.provider, providerSubject: profile.subject, userId: user.id, requestId });
  }

  const identity: OAuth2Identity = {
    id: createId('oid'),
    userId: user.id,
    provider: profile.provider,
    providerSubject: profile.subject,
    verifiedEmail,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    createdAt: now,
    lastSeenAt: now
  };
  await store.saveIdentity(identity);
  return { user, identity, createdUser, linkedIdentity };
}

async function requireActiveUser(store: AuthStore, userId: string): Promise<SandboxUser> {
  const user = await store.findUserById(userId);
  if (!user) throw new AuthUserError('persistence_failure');
  if (user.status === 'disabled') throw new AuthUserError('disabled_user');
  if (user.status === 'blocked') throw new AuthUserError('blocked_user');
  return user;
}

export class AuthUserError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
