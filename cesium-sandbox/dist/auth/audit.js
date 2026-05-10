export function safeFailureReason(_scope, reason) {
    return reason.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 120) || 'unknown_failure';
}
export async function recordAuthEvent(store, input) {
    const event = {
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
export function createId(prefix) {
    return `${prefix}_${randomToken(18)}`;
}
export function randomToken(bytes = 32) {
    const data = new Uint8Array(bytes);
    globalThis.crypto?.getRandomValues(data);
    if (!globalThis.crypto) {
        for (let index = 0; index < data.length; index += 1) {
            data[index] = Math.floor(Math.random() * 256);
        }
    }
    return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function sha256Label(value) {
    if (!globalThis.crypto?.subtle) {
        return `plain:${value.slice(0, 8)}`;
    }
    const encoded = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const bytes = [...new Uint8Array(digest)];
    return `sha256:${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
//# sourceMappingURL=audit.js.map