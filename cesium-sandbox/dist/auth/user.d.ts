import { AuthStore } from './storage.js';
import { OAuth2Identity, ProviderProfile, SandboxUser } from './types.js';
export interface ResolveUserResult {
    user: SandboxUser;
    identity: OAuth2Identity;
    createdUser: boolean;
    linkedIdentity: boolean;
}
export declare function resolveOrRegisterUser(store: AuthStore, profile: ProviderProfile, requestId?: string): Promise<ResolveUserResult>;
export declare class AuthUserError extends Error {
    readonly reason: string;
    constructor(reason: string);
}
//# sourceMappingURL=user.d.ts.map