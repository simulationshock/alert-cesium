import type {
  Lobby,
  LobbyMember,
  LobbyListItem,
  TurnCredentials,
  LobbyCreateResult,
  LobbyJoinResult,
} from './types.js';

export interface LobbyClientCallbacks {
  onAuthOk?: (user: { id: string; displayName: string; avatarUrl: string }) => void;
  onAuthError?: (reason: string) => void;
  onLobbyList?: (lobbies: LobbyListItem[]) => void;
  onLobbyCreated?: (result: { lobby: Lobby; self: { peerId: string }; turnCredentials: TurnCredentials }) => void;
  onLobbyJoined?: (result: { lobby: Lobby; self: { peerId: string }; peers: LobbyMember[]; turnCredentials: TurnCredentials }) => void;
  onJoinError?: (reason: LobbyJoinResult['type']) => void;
  onPeerJoined?: (peer: LobbyMember) => void;
  onPeerLeft?: (peerId: string) => void;
  onHostPromoted?: (newHostPeerId: string) => void;
  onLobbyUpdated?: (lobby: Pick<Lobby, 'id' | 'isPublic' | 'isLocked'>) => void;
  onOffer?: (fromPeerId: string, sdp: RTCSessionDescriptionInit) => void;
  onAnswer?: (fromPeerId: string, sdp: RTCSessionDescriptionInit) => void;
  onIce?: (fromPeerId: string, candidate: RTCIceCandidateInit) => void;
  onKicked?: () => void;
  onDisconnected?: () => void;
}

export class LobbyClient {
  private ws: WebSocket | null = null;
  private url = '';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private readonly reconnectDelays = [1000, 2000, 4000];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private pendingToken = '';
  private activeLobbyId: string | null = null;
  private activeLobbyCode: string | undefined = undefined;

  readonly callbacks: LobbyClientCallbacks;

  constructor(callbacks: LobbyClientCallbacks = {}) {
    this.callbacks = callbacks;
  }

  connect(signalingUrl: string): void {
    this.url = signalingUrl;
    this.closed = false;
    this.openSocket();
  }

  private openSocket(): void {
    this.ws = new WebSocket(this.url);

    this.ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      if (this.pendingToken) {
        this.send({ type: 'auth', token: this.pendingToken });
      }
    });

    this.ws.addEventListener('message', (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      this.handleMessage(msg);
    });

    this.ws.addEventListener('close', () => {
      if (this.closed) return;
      this.scheduleReconnect();
    });

    this.ws.addEventListener('error', () => {
      // close event will fire after error, let that handle reconnect
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.callbacks.onDisconnected?.();
      return;
    }
    const delay = this.reconnectDelays[this.reconnectAttempts] ?? 4000;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, delay);
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'auth-ok':
        this.callbacks.onAuthOk?.(msg.user as { id: string; displayName: string; avatarUrl: string });
        break;
      case 'auth-error':
        this.callbacks.onAuthError?.(msg.reason as string);
        break;
      case 'lobby-list':
        this.callbacks.onLobbyList?.(msg.lobbies as LobbyListItem[]);
        break;
      case 'lobby-created': {
        const lobby = this.toClientLobby(msg.lobby as ServerLobbyInfo);
        this.activeLobbyId = lobby.id;
        this.callbacks.onLobbyCreated?.({
          lobby,
          self: msg.self as { peerId: string },
          turnCredentials: msg.turnCredentials as TurnCredentials,
        });
        break;
      }
      case 'lobby-joined': {
        const lobby = this.toClientLobby(msg.lobby as ServerLobbyInfo);
        this.activeLobbyId = lobby.id;
        this.callbacks.onLobbyJoined?.({
          lobby,
          self: msg.self as { peerId: string },
          peers: msg.peers as LobbyMember[],
          turnCredentials: msg.turnCredentials as TurnCredentials,
        });
        break;
      }
      case 'join-error':
        this.callbacks.onJoinError?.(msg.reason as LobbyJoinResult['type']);
        break;
      case 'peer-joined':
        this.callbacks.onPeerJoined?.(msg.peer as LobbyMember);
        break;
      case 'peer-left':
        this.callbacks.onPeerLeft?.(msg.peerId as string);
        break;
      case 'host-promoted':
        this.callbacks.onHostPromoted?.(msg.newHostPeerId as string);
        break;
      case 'lobby-updated':
        this.callbacks.onLobbyUpdated?.(msg.lobby as Pick<Lobby, 'id' | 'isPublic' | 'isLocked'>);
        break;
      case 'offer':
        this.callbacks.onOffer?.(msg.fromPeerId as string, msg.sdp as RTCSessionDescriptionInit);
        break;
      case 'answer':
        this.callbacks.onAnswer?.(msg.fromPeerId as string, msg.sdp as RTCSessionDescriptionInit);
        break;
      case 'ice':
        this.callbacks.onIce?.(msg.fromPeerId as string, msg.candidate as RTCIceCandidateInit);
        break;
      case 'kicked':
        this.activeLobbyId = null;
        this.callbacks.onKicked?.();
        break;
    }
  }

  private toClientLobby(info: ServerLobbyInfo): Lobby {
    return {
      id: info.id,
      code: info.code,
      hostPeerId: info.hostPeerId,
      isPublic: info.isPublic,
      isLocked: info.isLocked,
      memberIds: [],
      createdAt: Date.now(),
    };
  }

  authenticate(token: string): void {
    this.pendingToken = token;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'auth', token });
    }
  }

  createLobby(isPublic: boolean): void {
    this.send({ type: 'create-lobby', isPublic });
  }

  joinLobby(lobbyId: string, code?: string): void {
    this.activeLobbyId = lobbyId;
    this.activeLobbyCode = code;
    this.send({ type: 'join-lobby', lobbyId, code });
  }

  leaveLobby(): void {
    this.activeLobbyId = null;
    this.activeLobbyCode = undefined;
    this.send({ type: 'leave-lobby' });
  }

  listLobbies(): void {
    this.send({ type: 'list-lobbies' });
  }

  sendOffer(targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.send({ type: 'relay-offer', targetPeerId, sdp });
  }

  sendAnswer(targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.send({ type: 'relay-answer', targetPeerId, sdp });
  }

  sendIce(targetPeerId: string, candidate: RTCIceCandidateInit): void {
    this.send({ type: 'relay-ice', targetPeerId, candidate });
  }

  kickMember(targetPeerId: string): void {
    this.send({ type: 'kick-member', targetPeerId });
  }

  togglePrivacy(isPublic: boolean): void {
    this.send({ type: 'toggle-privacy', isPublic });
  }

  lockLobby(locked: boolean): void {
    this.send({ type: 'lock-lobby', locked });
  }

  promoteHost(targetPeerId: string): void {
    this.send({ type: 'promote-host', targetPeerId });
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

interface ServerLobbyInfo {
  id: string;
  code: string;
  hostPeerId: string;
  isPublic: boolean;
  isLocked: boolean;
}
