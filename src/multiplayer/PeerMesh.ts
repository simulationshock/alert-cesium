import type { LobbyClient } from './LobbyClient.js';

export interface PeerMeshCallbacks {
  onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
  onConnectionReady?: (peerId: string, isInitiator: boolean) => void;
  onDataChannel?: (peerId: string, channel: RTCDataChannel) => void;
  onTrack?: (peerId: string, track: MediaStreamTrack, streams: readonly MediaStream[]) => void;
  onStateReceived?: (peerId: string, payload: string) => void;
}

interface PeerEntry {
  conn: RTCPeerConnection;
  isInitiator: boolean;
}

export class PeerMesh {
  private readonly peers = new Map<string, PeerEntry>();
  private iceServers: RTCIceServer[] = [];
  private lobbyClient: LobbyClient;
  readonly callbacks: PeerMeshCallbacks;

  constructor(lobbyClient: LobbyClient, callbacks: PeerMeshCallbacks = {}) {
    this.lobbyClient = lobbyClient;
    this.callbacks = callbacks;
  }

  setIceServers(servers: RTCIceServer[]): void {
    this.iceServers = servers;
  }

  addPeer(peerId: string, isInitiator: boolean): RTCPeerConnection {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId)!.conn;
    }

    const conn = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers.set(peerId, { conn, isInitiator });

    conn.addEventListener('icecandidate', ({ candidate }) => {
      if (candidate) this.lobbyClient.sendIce(peerId, candidate.toJSON());
    });

    conn.addEventListener('connectionstatechange', () => {
      this.callbacks.onConnectionStateChange?.(peerId, conn.connectionState);
      if (conn.connectionState === 'connected') {
        this.callbacks.onConnectionReady?.(peerId, isInitiator);
      }
    });

    conn.addEventListener('datachannel', ({ channel }) => {
      if (channel.label === 'transfer-state') {
        this.handleTransferStateChannel(peerId, channel);
        return;
      }
      this.callbacks.onDataChannel?.(peerId, channel);
    });

    conn.addEventListener('track', ({ track, streams }) => {
      this.callbacks.onTrack?.(peerId, track, streams);
    });

    if (isInitiator) {
      conn.createOffer()
        .then(offer => conn.setLocalDescription(offer))
        .then(() => {
          if (conn.localDescription) {
            this.lobbyClient.sendOffer(peerId, conn.localDescription);
          }
        })
        .catch(err => console.error('[PeerMesh] createOffer failed:', err));
    }

    return conn;
  }

  async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    let entry = this.peers.get(peerId);
    if (!entry) {
      const conn = this.addPeer(peerId, false);
      entry = this.peers.get(peerId)!;
      // addPeer sets isInitiator=false so no createOffer was called
      void conn;
    }
    const { conn } = entry;
    try {
      await conn.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      this.lobbyClient.sendAnswer(peerId, conn.localDescription!);
    } catch (err) {
      console.error('[PeerMesh] handleOffer failed:', err);
    }
  }

  async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    try {
      await entry.conn.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error('[PeerMesh] handleAnswer failed:', err);
    }
  }

  async handleIce(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    try {
      await entry.conn.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // Benign: ICE candidate arrived after connection closed
      console.debug('[PeerMesh] addIceCandidate error (benign):', err);
    }
  }

  removePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.conn.close();
    this.peers.delete(peerId);
  }

  transferStateToPeer(peerId: string, jsonPayload: string): void {
    const conn = this.peers.get(peerId)?.conn;
    if (!conn) return;
    const ch = conn.createDataChannel('transfer-state', { ordered: true, maxRetransmits: 10 });
    const timeout = setTimeout(() => { if (ch.readyState !== 'closed') ch.close(); }, 10_000);
    ch.addEventListener('open', () => { ch.send(jsonPayload); });
    ch.addEventListener('message', () => { clearTimeout(timeout); ch.close(); });
    ch.addEventListener('close', () => { clearTimeout(timeout); });
  }

  private handleTransferStateChannel(peerId: string, channel: RTCDataChannel): void {
    channel.addEventListener('message', ({ data }) => {
      try {
        this.callbacks.onStateReceived?.(peerId, data as string);
        channel.send(JSON.stringify({ type: 'state-ack' }));
      } catch {}
      channel.close();
    });
  }

  getConnection(peerId: string): RTCPeerConnection | undefined {
    return this.peers.get(peerId)?.conn;
  }

  getAllPeerIds(): string[] {
    return [...this.peers.keys()];
  }

  addTrackToAll(track: MediaStreamTrack, stream: MediaStream): void {
    for (const { conn } of this.peers.values()) {
      conn.addTrack(track, stream);
    }
  }

  destroy(): void {
    for (const peerId of this.peers.keys()) {
      this.removePeer(peerId);
    }
  }
}
