import { randomUUID } from 'crypto';
import type { LobbyInfo, LobbyListItem, PeerInfo } from './types.js';

const MAX_MEMBERS = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

export interface LobbyMemberState {
  peerId: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  joinedAt: number;
}

interface LobbyState {
  id: string;
  code: string;
  hostPeerId: string;
  isPublic: boolean;
  isLocked: boolean;
  members: Map<string, LobbyMemberState>;
  createdAt: number;
}

export type JoinError = 'lobby-full' | 'not-found' | 'locked' | 'invalid-code' | 'already-in-lobby';

export type JoinResult =
  | { ok: true; lobby: LobbyState; existingMembers: LobbyMemberState[] }
  | { ok: false; reason: JoinError };

export type LeaveResult =
  | { dissolved: true }
  | { dissolved: false; newHostPeerId: string | null; lobby: LobbyState };

export class LobbyManager {
  private readonly lobbies = new Map<string, LobbyState>();
  private readonly peerLobby = new Map<string, string>();

  createLobby(peerId: string, userId: string, displayName: string, avatarUrl: string, isPublic: boolean): LobbyState {
    const lobby: LobbyState = {
      id: randomUUID(),
      code: generateCode(),
      hostPeerId: peerId,
      isPublic,
      isLocked: false,
      members: new Map([[peerId, { peerId, userId, displayName, avatarUrl, joinedAt: Date.now() }]]),
      createdAt: Date.now(),
    };
    this.lobbies.set(lobby.id, lobby);
    this.peerLobby.set(peerId, lobby.id);
    return lobby;
  }

  joinLobby(peerId: string, userId: string, displayName: string, avatarUrl: string, lobbyId: string, code?: string): JoinResult {
    if (this.peerLobby.has(peerId)) return { ok: false, reason: 'already-in-lobby' };
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return { ok: false, reason: 'not-found' };
    if (lobby.isLocked) return { ok: false, reason: 'locked' };
    if (!lobby.isPublic && lobby.code !== code) return { ok: false, reason: 'invalid-code' };
    if (lobby.members.size >= MAX_MEMBERS) return { ok: false, reason: 'lobby-full' };

    const existingMembers = [...lobby.members.values()];
    lobby.members.set(peerId, { peerId, userId, displayName, avatarUrl, joinedAt: Date.now() });
    this.peerLobby.set(peerId, lobbyId);
    return { ok: true, lobby, existingMembers };
  }

  leaveLobby(peerId: string): LeaveResult {
    const lobbyId = this.peerLobby.get(peerId);
    if (!lobbyId) return { dissolved: true };
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return { dissolved: true };

    lobby.members.delete(peerId);
    this.peerLobby.delete(peerId);

    if (lobby.members.size === 0) {
      this.lobbies.delete(lobbyId);
      return { dissolved: true };
    }

    let newHostPeerId: string | null = null;
    if (lobby.hostPeerId === peerId) {
      newHostPeerId = [...lobby.members.keys()][0]!;
      lobby.hostPeerId = newHostPeerId;
    }

    return { dissolved: false, newHostPeerId, lobby };
  }

  kickMember(hostPeerId: string, targetPeerId: string): boolean {
    const lobby = this.getLobbyForPeer(hostPeerId);
    if (!lobby || lobby.hostPeerId !== hostPeerId) return false;
    if (!lobby.members.has(targetPeerId)) return false;
    lobby.members.delete(targetPeerId);
    this.peerLobby.delete(targetPeerId);
    return true;
  }

  togglePrivacy(hostPeerId: string, isPublic: boolean): LobbyState | null {
    const lobby = this.getLobbyForPeer(hostPeerId);
    if (!lobby || lobby.hostPeerId !== hostPeerId) return null;
    lobby.isPublic = isPublic;
    return lobby;
  }

  lockLobby(hostPeerId: string, locked: boolean): LobbyState | null {
    const lobby = this.getLobbyForPeer(hostPeerId);
    if (!lobby || lobby.hostPeerId !== hostPeerId) return null;
    lobby.isLocked = locked;
    return lobby;
  }

  promoteHost(hostPeerId: string, targetPeerId: string): LobbyState | null {
    const lobby = this.getLobbyForPeer(hostPeerId);
    if (!lobby || lobby.hostPeerId !== hostPeerId) return null;
    if (!lobby.members.has(targetPeerId)) return null;
    lobby.hostPeerId = targetPeerId;
    return lobby;
  }

  getLobbyForPeer(peerId: string): LobbyState | null {
    const lobbyId = this.peerLobby.get(peerId);
    return lobbyId ? (this.lobbies.get(lobbyId) ?? null) : null;
  }

  getMemberPeerIds(lobbyId: string): string[] {
    return [...(this.lobbies.get(lobbyId)?.members.keys() ?? [])];
  }

  listPublicLobbies(): LobbyListItem[] {
    const items: LobbyListItem[] = [];
    for (const lobby of this.lobbies.values()) {
      if (!lobby.isPublic) continue;
      const host = lobby.members.get(lobby.hostPeerId);
      items.push({
        id: lobby.id,
        hostDisplayName: host?.displayName ?? 'Unknown',
        memberCount: lobby.members.size,
        createdAt: lobby.createdAt,
      });
    }
    return items;
  }

  toLobbyInfo(lobby: LobbyState): LobbyInfo {
    return { id: lobby.id, code: lobby.code, hostPeerId: lobby.hostPeerId, isPublic: lobby.isPublic, isLocked: lobby.isLocked };
  }

  toPeerInfoList(lobby: LobbyState): PeerInfo[] {
    return [...lobby.members.values()].map(m => ({
      peerId: m.peerId,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      isHost: m.peerId === lobby.hostPeerId,
    }));
  }
}
