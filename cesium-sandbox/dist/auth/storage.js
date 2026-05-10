export class InMemoryAuthStore {
    constructor() {
        this.users = new Map();
        this.identities = new Map();
        this.sessions = new Map();
        this.events = [];
    }
    async findUserById(id) {
        return this.users.get(id);
    }
    async findUserByVerifiedEmail(email) {
        const normalized = email.toLowerCase();
        return [...this.users.values()].filter((user) => user.primaryVerifiedEmail?.toLowerCase() === normalized);
    }
    async saveUser(user) {
        this.users.set(user.id, { ...user });
    }
    async findIdentity(provider, providerSubject) {
        return this.identities.get(identityKey(provider, providerSubject));
    }
    async saveIdentity(identity) {
        this.identities.set(identityKey(identity.provider, identity.providerSubject), { ...identity });
    }
    async findSession(id) {
        return this.sessions.get(id);
    }
    async saveSession(session) {
        this.sessions.set(session.id, { ...session });
    }
    async appendAuthEvent(event) {
        this.events.push({ ...event });
    }
}
function identityKey(provider, providerSubject) {
    return `${provider}:${providerSubject}`;
}
//# sourceMappingURL=storage.js.map