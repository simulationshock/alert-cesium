import { AuthStore } from './storage.js';
import { AuthenticationEventOutcome, AuthenticationEventType } from './types.js';
export interface AuditInput {
    type: AuthenticationEventType;
    outcome: AuthenticationEventOutcome;
    requestId?: string;
    userId?: string;
    provider?: string;
    providerSubject?: string;
    reason?: string;
    identityId?: string;
}
export interface AuthEventSink {
    record(input: AuditInput): Promise<void>;
}
export declare function safeFailureReason(_scope: string, reason: string): string;
export declare function recordAuthEvent(store: AuthStore, input: AuditInput): Promise<void>;
export declare function createId(prefix: string): string;
export declare function randomToken(bytes?: number): string;
//# sourceMappingURL=audit.d.ts.map