import { randomToken } from './audit.js';
import { ProviderProfile } from './types.js';

export interface OAuth2ProviderConfig {
  provider: string;
  id?: string;
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthLoginState {
  state: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: string;
}

export interface OAuthLoginStateStore {
  save(state: OAuthLoginState): Promise<void>;
  consume(state: string): Promise<OAuthLoginState | undefined>;
}

export class InMemoryOAuthLoginStateStore implements OAuthLoginStateStore {
  private readonly states = new Map<string, OAuthLoginState>();

  async save(state: OAuthLoginState): Promise<void> {
    this.states.set(state.state, state);
  }

  async consume(state: string): Promise<OAuthLoginState | undefined> {
    const value = this.states.get(state);
    this.states.delete(state);
    return value;
  }
}

export async function createAuthorizationRedirect(
  config: OAuth2ProviderConfig,
  stateStore: OAuthLoginStateStore,
  returnTo = '/'
): Promise<URL> {
  validateProviderConfig(config);
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const challenge = await pkceChallenge(codeVerifier);
  await stateStore.save({ state, codeVerifier, returnTo: safeReturnTo(returnTo), createdAt: new Date().toISOString() });

  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url;
}

export async function exchangeAuthorizationCode(
  config: OAuth2ProviderConfig,
  code: string,
  codeVerifier: string
): Promise<Record<string, unknown>> {
  validateProviderConfig(config);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier
  });
  if (config.clientSecret) body.set('client_secret', config.clientSecret);

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new OAuthProviderError('token_exchange_failed');
  return response.json() as Promise<Record<string, unknown>>;
}

export async function fetchProviderProfile(
  config: OAuth2ProviderConfig,
  accessToken: string
): Promise<ProviderProfile> {
  const response = await fetch(config.userInfoEndpoint, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new OAuthProviderError('userinfo_failed');
  const payload = await response.json() as Record<string, unknown>;
  const subject = stringValue(payload.sub) ?? stringValue(payload.id);
  if (!subject) throw new OAuthProviderError('missing_provider_subject');
  return {
    provider: config.provider,
    subject,
    email: stringValue(payload.email),
    emailVerified: booleanValue(payload.email_verified) ?? Boolean(stringValue(payload.email)),
    displayName: stringValue(payload.name) ?? stringValue(payload.login) ?? stringValue(payload.username),
    avatarUrl: stringValue(payload.picture) ?? stringValue(payload.avatar_url)
  };
}

export function safeReturnTo(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function validateProviderConfig(config: OAuth2ProviderConfig): void {
  if (!config.provider || !config.clientId || !config.authorizationEndpoint || !config.tokenEndpoint || !config.userInfoEndpoint || !config.redirectUri) {
    throw new OAuthProviderError('provider_configuration_missing');
  }
}

async function pkceChallenge(verifier: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return verifier;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export interface AuthorizationRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

export async function createAuthorizationRequest(config: OAuth2ProviderConfig, returnTo = '/'): Promise<AuthorizationRequest> {
  let saved: OAuthLoginState | undefined;
  const store: OAuthLoginStateStore = {
    async save(state) { saved = state; },
    async consume() { return saved; }
  };
  const url = await createAuthorizationRedirect(config, store, returnTo);
  if (!saved) throw new OAuthProviderError('oauth_state_not_created');
  return { url: url.toString(), state: saved.state, codeVerifier: saved.codeVerifier };
}

export async function exchangeCodeForToken(
  config: OAuth2ProviderConfig,
  code: string,
  codeVerifier: string,
  fetcher: typeof fetch = fetch
): Promise<{ access_token: string; [key: string]: unknown }> {
  const originalFetch = globalThis.fetch;
  if (fetcher !== originalFetch) (globalThis as any).fetch = fetcher;
  try {
    const token = await exchangeAuthorizationCode(config, code, codeVerifier);
    return token as { access_token: string; [key: string]: unknown };
  } finally {
    if (fetcher !== originalFetch) (globalThis as any).fetch = originalFetch;
  }
}

export async function fetchUserInfo(
  config: OAuth2ProviderConfig,
  accessToken: string,
  fetcher: typeof fetch = fetch
): Promise<Record<string, unknown>> {
  const response = await fetcher(config.userInfoEndpoint, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new OAuthProviderError('userinfo_failed');
  return response.json() as Promise<Record<string, unknown>>;
}

export function normalizeOAuthProfile(provider: string, payload: Record<string, unknown>) {
  const subject = stringValue(payload.sub) ?? stringValue(payload.id);
  if (!subject) throw new OAuthProviderError('missing_provider_subject');
  return {
    provider,
    providerSubject: subject,
    email: stringValue(payload.email),
    emailVerified: booleanValue(payload.email_verified) ?? Boolean(stringValue(payload.email)),
    displayName: stringValue(payload.name) ?? stringValue(payload.login) ?? stringValue(payload.username),
    avatarUrl: stringValue(payload.picture) ?? stringValue(payload.avatar_url)
  };
}

export class OAuthProviderError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
