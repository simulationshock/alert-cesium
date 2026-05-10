import { AuthStore } from './storage.js';
import { currentUserState } from './session.js';
export interface GuardResult {
    allowed: boolean;
    response?: Response;
    userState?: ReturnType<typeof currentUserState>;
}
export declare function requireSandboxSession(store: AuthStore, request: Request, requestId?: string): Promise<GuardResult>;
//# sourceMappingURL=middleware.d.ts.map