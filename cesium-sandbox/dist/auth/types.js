export function nowIso() {
    return new Date().toISOString();
}
export function randomId(prefix) {
    const bytes = new Uint8Array(18);
    globalThis.crypto?.getRandomValues(bytes);
    if (!globalThis.crypto) {
        for (let index = 0; index < bytes.length; index += 1)
            bytes[index] = Math.floor(Math.random() * 256);
    }
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return `${prefix}_${token}`;
}
//# sourceMappingURL=types.js.map