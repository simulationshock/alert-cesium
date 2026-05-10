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
export declare class InMemoryOAuthLoginStateStore implements OAuthLoginStateStore {
    private readonly states;
    save(state: OAuthLoginState): Promise<void>;
    consume(state: string): Promise<OAuthLoginState | undefined>;
}
export declare function createAuthorizationRedirect(config: OAuth2ProviderConfig, stateStore: OAuthLoginStateStore, returnTo?: string): Promise<URL>;
export declare function exchangeAuthorizationCode(config: OAuth2ProviderConfig, code: string, codeVerifier: string): Promise<Record<string, unknown>>;
export declare function fetchProviderProfile(config: OAuth2ProviderConfig, accessToken: string): Promise<ProviderProfile>;
export declare function safeReturnTo(value: string): string;
export interface AuthorizationRequest {
    url: string;
    state: string;
    codeVerifier: string;
}
export declare function createAuthorizationRequest(config: OAuth2ProviderConfig, returnTo?: string): Promise<AuthorizationRequest>;
export declare function exchangeCodeForToken(config: OAuth2ProviderConfig, code: string, codeVerifier: string, fetcher?: typeof fetch): Promise<{
    access_token: string;
    [key: string]: unknown;
}>;
export declare function fetchUserInfo(config: OAuth2ProviderConfig, accessToken: string, fetcher?: typeof fetch): Promise<Record<string, unknown>>;
export declare function normalizeOAuthProfile(provider: string, payload: Record<string, unknown>): {
    provider: string;
    providerSubject: string;
    email: string | undefined;
    emailVerified: boolean;
    displayName: string | undefined;
    avatarUrl: string | undefined;
};
export declare class OAuthProviderError extends Error {
    readonly reason: string;
    constructor(reason: string);
}
//# sourceMappingURL=provider.d.ts.map