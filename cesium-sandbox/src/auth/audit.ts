import { AuthStore } from './storage';
import { AuthenticationEvent, AuthenticationEventOutcome, AuthenticationEventType } from './types';

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

export function safeFailureReason(_scope: string, reason: string): string {
  return reason.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 120) || 'unknown_failure';
}

export async function recordAuthEvent(store: AuthStore, input: AuditInput): Promise<void> {
  const event: AuthenticationEvent = {
    id: createId('evt'),
    type: input.type,
    outcome: input.outcome,
    createdAt: new Date().toISOString(),
    requestId: input.requestId,
    userId: input.userId,
    provider: input.provider,
    providerSubjectHash: input.providerSubject
      ? await sha256Label(input.providerSubject)
      : undefined,
    reason: input.reason,
    identityId: input.identityId
  };
  await store.appendAuthEvent(event);
}

export function createId(prefix: string): string {
  return `${prefix}_${randomToken(18)}`;
}

export function randomToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  globalThis.crypto?.getRandomValues(data);
  if (!globalThis.crypto) {
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.floor(Math.random() * 256);
    }
  }
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Label(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return `plain:${value.slice(0, 8)}`;
  }
  const encoded = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const bytes = [...new Uint8Array(digest)];
  return `sha256:${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
