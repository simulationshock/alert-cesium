import type { Viewer } from 'cesium';
import { LobbyClient, type LobbyClientCallbacks } from './LobbyClient.js';
import { PeerMesh } from './PeerMesh.js';
import { DataChannels } from './DataChannels.js';
import { AnnotationManager } from './AnnotationManager.js';
import { MediaManager } from './MediaManager.js';
import { PresenceAvatarManager } from './PresenceAvatarManager.js';
import { PilotMode } from './PilotMode.js';
import type {
  Lobby,
  LobbyMember,
  LobbyListItem,
  LobbyCreateResult,
  LobbyJoinResult,
  PilotResult,
  TurnCredentials,
} from './types.js';

export type { LobbyCreateResult, LobbyJoinResult, PilotResult };
export { LobbyClient, PeerMesh, DataChannels, AnnotationManager, MediaManager, PresenceAvatarManager, PilotMode };
export * from './types.js';

export interface MultiplayerSessionOptions {
  signalingUrl: string;
  viewer: Viewer;
  selfPeerId?: string;
  onLobbyCreated?: (lobby: Lobby, self: { peerId: string }, turnCredentials: TurnCredentials) => void;
  onLobbyJoined?: (lobby: Lobby, self: { peerId: string }, peers: LobbyMember[], turnCredentials: TurnCredentials) => void;
  onJoinError?: (reason: LobbyJoinResult['type']) => void;
  onPeerJoined?: (peer: LobbyMember) => void;
  onPeerLeft?: (peerId: string) => void;
  onHostPromoted?: (newHostPeerId: string) => void;
  onLobbyUpdated?: (lobby: Pick<Lobby, 'id' | 'isPublic' | 'isLocked'>) => void;
  onKicked?: () => void;
  onSessionEnded?: () => void;
}

export class MultiplayerSession {
  readonly client: LobbyClient;
  readonly mesh: PeerMesh;
  readonly channels: DataChannels;
  readonly annotations: AnnotationManager;
  readonly media: MediaManager;
  readonly avatars: PresenceAvatarManager;
  readonly pilot: PilotMode;

  private myPeerId: string | null = null;
  private activeLobby: Lobby | null = null;
  private isHost = false;
  private readonly members = new Map<string, LobbyMember>();
  private iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  constructor(private readonly viewer: Viewer, private readonly opts: MultiplayerSessionOptions) {
    this.channels = new DataChannels({
      onPresence: (peerId, state) => this.avatars.updatePresence(peerId, state),
      onAnnotation: (_peerId, msg) => {
        if (msg.type === 'annotation-add')    this.annotations.addRemote(msg.annotation);
        else if (msg.type === 'annotation-delete') this.annotations.removeAnnotation(msg.annotationId);
        else if (msg.type === 'annotation-clear')  this.annotations.clearAll();
        else if (msg.type === 'state-full') {
          for (const a of msg.annotations) this.annotations.addRemote(a);
        }
      },
      onChat: (_peerId, msg) => {
        if (msg.type === 'pilot-follow') this.pilot.handlePilotFollow(msg.followerPeerId, msg.targetPeerId);
        else if (msg.type === 'pilot-leave') this.pilot.handlePilotLeave(msg.followerPeerId);
      },
    });

    this.media = new MediaManager({
      onRemoteTrack: (_peerId, _track, _stream) => {},
    });

    this.annotations = new AnnotationManager(viewer as InstanceType<typeof import('cesium').Viewer>, {
      authorPeerId: 'pending',
      onComplete: (annotation) => {
        this.channels.sendAnnotationAdd(this.mesh.getAllPeerIds(), annotation);
      },
    });

    this.avatars = new PresenceAvatarManager(viewer as InstanceType<typeof import('cesium').Viewer>, {
      selfPeerId: 'pending',
    });

    this.client = new LobbyClient(this.buildClientCallbacks());

    this.mesh = new PeerMesh(this.client, {
      onConnectionReady: (peerId, isInitiator) => {
        const conn = this.mesh.getConnection(peerId);
        if (conn) {
          this.channels.attachToPeer(peerId, conn, isInitiator);
          this.media.addTracksToConnection(conn);
        }
        if (this.isHost) {
          const payload = JSON.stringify({
            type: 'state-full',
            annotations: this.annotations.getAllAnnotations(),
          });
          this.mesh.transferStateToPeer(peerId, payload);
        }
      },
      onStateReceived: (_peerId, jsonPayload) => {
        try {
          const msg = JSON.parse(jsonPayload);
          if (msg.type === 'state-full') {
            for (const a of msg.annotations) this.annotations.addRemote(a);
          }
        } catch {}
      },
      onTrack: (peerId, track, streams) => {
        this.media.handleRemoteTrack(peerId, track, streams);
      },
    });

    this.pilot = new PilotMode(viewer as InstanceType<typeof import('cesium').Viewer>, {
      selfPeerId: 'pending',
      dataChannels: this.channels,
      avatarManager: this.avatars,
      getPeerIds: () => this.mesh.getAllPeerIds(),
      getPresenceState: (peerId) => this.avatars.getLastState(peerId),
    });

    this.client.connect(opts.signalingUrl);
  }

  authenticate(firebaseIdToken: string): void {
    this.client.authenticate(firebaseIdToken);
  }

  listLobbies(): void {
    this.client.listLobbies();
  }

  createLobby(isPublic: boolean): void {
    this.client.createLobby(isPublic);
  }

  joinLobby(lobbyId: string, code?: string): void {
    this.client.joinLobby(lobbyId, code);
  }

  leaveLobby(): void {
    this.client.leaveLobby();
    this.cleanup();
  }

  startPTT(): void { this.media.startPTT(); }
  stopPTT(): void  { this.media.stopPTT(); }
  toggleVideo(): boolean { return this.media.toggleVideo(); }

  followPeer(targetPeerId: string): PilotResult {
    return this.pilot.followPeer(targetPeerId);
  }

  leavePilotMode(): void {
    this.pilot.leavePilotMode();
  }

  get lobby(): Lobby | null { return this.activeLobby; }
  get peerId(): string | null { return this.myPeerId; }
  get host(): boolean { return this.isHost; }

  private buildClientCallbacks(): LobbyClientCallbacks {
    return {
      onLobbyCreated: ({ lobby, self, turnCredentials }) => {
        this.activeLobby = lobby;
        this.myPeerId = self.peerId;
        this.isHost = true;
        this.iceServers = this.buildIceServers(turnCredentials);
        this.mesh.setIceServers(this.iceServers);
        this.opts.onLobbyCreated?.(lobby, self, turnCredentials);
      },
      onLobbyJoined: ({ lobby, self, peers, turnCredentials }) => {
        this.activeLobby = lobby;
        this.myPeerId = self.peerId;
        this.isHost = lobby.hostPeerId === self.peerId;
        this.members.clear();
        for (const p of peers) this.members.set(p.peerId, p);
        this.iceServers = this.buildIceServers(turnCredentials);
        this.mesh.setIceServers(this.iceServers);
        for (const peer of peers) {
          this.avatars.addPeer(peer.peerId, peer.displayName, peer.avatarUrl);
          this.mesh.addPeer(peer.peerId, self.peerId > peer.peerId);
        }
        this.channels.startPresenceBroadcast(
          () => this.mesh.getAllPeerIds(),
          () => this.buildPresenceState(),
        );
        this.opts.onLobbyJoined?.(lobby, self, peers, turnCredentials);
      },
      onJoinError: (reason) => this.opts.onJoinError?.(reason),
      onPeerJoined: (peer) => {
        this.members.set(peer.peerId, peer);
        this.avatars.addPeer(peer.peerId, peer.displayName, peer.avatarUrl);
        this.mesh.addPeer(peer.peerId, this.myPeerId! > peer.peerId);
        this.opts.onPeerJoined?.(peer);
      },
      onPeerLeft: (peerId) => {
        this.members.delete(peerId);
        this.avatars.removePeer(peerId);
        this.mesh.removePeer(peerId);
        this.opts.onPeerLeft?.(peerId);
      },
      onHostPromoted: (newHostPeerId) => {
        if (this.activeLobby) this.activeLobby.hostPeerId = newHostPeerId;
        this.isHost = newHostPeerId === this.myPeerId;
        this.opts.onHostPromoted?.(newHostPeerId);
      },
      onLobbyUpdated: (info) => {
        if (this.activeLobby) Object.assign(this.activeLobby, info);
        this.opts.onLobbyUpdated?.(info);
      },
      onOffer: (peerId, sdp) => this.mesh.handleOffer(peerId, sdp),
      onAnswer: (peerId, sdp) => this.mesh.handleAnswer(peerId, sdp),
      onIce: (peerId, candidate) => this.mesh.handleIce(peerId, candidate),
      onKicked: () => {
        this.cleanup();
        this.opts.onKicked?.();
      },
      onDisconnected: () => {
        this.cleanup();
        this.opts.onSessionEnded?.();
      },
    };
  }

  private buildPresenceState() {
    const cam = this.viewer.camera;
    const pos = cam.positionCartographic;
    return {
      peerId: this.myPeerId ?? '',
      longitude: (pos.longitude * 180) / Math.PI,
      latitude: (pos.latitude * 180) / Math.PI,
      altitude: pos.height,
      heading: cam.heading,
      pitch: cam.pitch,
      roll: cam.roll,
      pilotPeerId: this.pilot.currentPilotPeerId,
      timestamp: Date.now(),
    };
  }

  private buildIceServers(turn: TurnCredentials): RTCIceServer[] {
    const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    if (turn.urls.length) {
      servers.push({ urls: turn.urls, username: turn.username, credential: turn.credential });
    }
    return servers;
  }

  private cleanup(): void {
    this.channels.destroy();
    this.mesh.destroy();
    this.media.destroy();
    this.avatars.destroy();
    this.pilot.destroy();
    this.annotations.destroy();
    this.activeLobby = null;
    this.myPeerId = null;
    this.isHost = false;
    this.members.clear();
  }

  destroy(): void {
    this.client.disconnect();
    this.cleanup();
  }
}
