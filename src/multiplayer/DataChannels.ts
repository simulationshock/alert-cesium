import type {
  PresenceMessage,
  AnnotationChannelMessage,
  ChatChannelMessage,
  PresenceState,
  Annotation,
} from './types.js';
import type { PeerMesh } from './PeerMesh.js';

export interface DataChannelsCallbacks {
  onPresence?: (fromPeerId: string, state: PresenceState) => void;
  onAnnotation?: (fromPeerId: string, msg: AnnotationChannelMessage) => void;
  onChat?: (fromPeerId: string, msg: ChatChannelMessage) => void;
}

interface PeerChannels {
  presence: RTCDataChannel;
  annotation: RTCDataChannel;
  chat: RTCDataChannel;
}

export class DataChannels {
  private readonly channels = new Map<string, PeerChannels>();
  private presenceInterval: ReturnType<typeof setInterval> | null = null;
  readonly callbacks: DataChannelsCallbacks;

  constructor(callbacks: DataChannelsCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** Call after PeerMesh.addPeer() to create the three channels for a new peer. */
  attachToPeer(peerId: string, conn: RTCPeerConnection, isInitiator: boolean): void {
    if (isInitiator) {
      const presence   = conn.createDataChannel('presence',   { ordered: false, maxRetransmits: 0 });
      const annotation = conn.createDataChannel('annotation', { ordered: true,  maxRetransmits: 3 });
      const chat       = conn.createDataChannel('chat',       { ordered: true,  maxRetransmits: 3 });
      this.channels.set(peerId, { presence, annotation, chat });
      this.wireChannelHandlers(peerId, { presence, annotation, chat });
    } else {
      // Non-initiator receives channels via ondatachannel
      conn.addEventListener('datachannel', ({ channel }) => {
        this.handleIncomingChannel(peerId, channel, conn);
      });
    }
  }

  private handleIncomingChannel(peerId: string, channel: RTCDataChannel, conn: RTCPeerConnection): void {
    if (channel.label === 'transfer-state') {
      // Handled by AnnotationManager for state onboarding
      return;
    }
    const existing = this.channels.get(peerId) ?? ({} as Partial<PeerChannels>);

    if (channel.label === 'presence') {
      (existing as PeerChannels).presence = channel;
    } else if (channel.label === 'annotation') {
      (existing as PeerChannels).annotation = channel;
    } else if (channel.label === 'chat') {
      (existing as PeerChannels).chat = channel;
    }

    const filled = existing as PeerChannels;
    if (filled.presence && filled.annotation && filled.chat) {
      this.channels.set(peerId, filled);
      this.wireChannelHandlers(peerId, filled);
    } else {
      this.channels.set(peerId, existing as PeerChannels);
    }
  }

  private wireChannelHandlers(peerId: string, ch: PeerChannels): void {
    ch.presence.addEventListener('message', ({ data }) => {
      try {
        const msg = JSON.parse(data as string) as PresenceMessage;
        this.callbacks.onPresence?.(peerId, msg);
      } catch {}
    });

    ch.annotation.addEventListener('message', ({ data }) => {
      try {
        const msg = JSON.parse(data as string) as AnnotationChannelMessage;
        this.callbacks.onAnnotation?.(peerId, msg);
      } catch {}
    });

    ch.chat.addEventListener('message', ({ data }) => {
      try {
        const msg = JSON.parse(data as string) as ChatChannelMessage;
        this.callbacks.onChat?.(peerId, msg);
      } catch {}
    });
  }

  removePeer(peerId: string): void {
    this.channels.delete(peerId);
  }

  // ── Typed send helpers ────────────────────────────────────────────────────

  private sendToChannel(channel: keyof PeerChannels, peerIds: string[], payload: object): void {
    const json = JSON.stringify(payload);
    for (const peerId of peerIds) {
      const ch = this.channels.get(peerId);
      const dc = ch?.[channel];
      if (dc?.readyState === 'open') {
        dc.send(json);
      }
    }
  }

  sendPresence(peerIds: string[], state: PresenceState): void {
    this.sendToChannel('presence', peerIds, { type: 'presence', ...state });
  }

  sendAnnotationAdd(peerIds: string[], annotation: Annotation): void {
    this.sendToChannel('annotation', peerIds, { type: 'annotation-add', annotation });
  }

  sendAnnotationDelete(peerIds: string[], annotationId: string): void {
    this.sendToChannel('annotation', peerIds, { type: 'annotation-delete', annotationId });
  }

  sendAnnotationClear(peerIds: string[]): void {
    this.sendToChannel('annotation', peerIds, { type: 'annotation-clear' });
  }

  sendStateFull(peerId: string, annotations: Annotation[]): void {
    const ch = this.channels.get(peerId);
    const dc = ch?.annotation;
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'state-full', annotations }));
    }
  }

  sendStateAck(peerId: string): void {
    const ch = this.channels.get(peerId);
    const dc = ch?.annotation;
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'state-ack' }));
    }
  }

  sendLayerSync(peerIds: string[], fire: boolean, radio: boolean, flights: boolean): void {
    this.sendToChannel('annotation', peerIds, { type: 'layer-sync', fire, radio, flights });
  }

  sendChat(peerIds: string[], msg: Omit<ChatChannelMessage, 'type'>): void {
    this.sendToChannel('chat', peerIds, { type: 'chat', ...msg });
  }

  sendPilotFollow(peerIds: string[], followerPeerId: string, targetPeerId: string): void {
    this.sendToChannel('chat', peerIds, { type: 'pilot-follow', followerPeerId, targetPeerId });
  }

  sendPilotLeave(peerIds: string[], followerPeerId: string): void {
    this.sendToChannel('chat', peerIds, { type: 'pilot-leave', followerPeerId });
  }

  // ── Presence broadcast ────────────────────────────────────────────────────

  startPresenceBroadcast(
    getPeerIds: () => string[],
    getState: () => PresenceState,
  ): void {
    this.stopPresenceBroadcast();
    this.presenceInterval = setInterval(() => {
      const peerIds = getPeerIds();
      if (peerIds.length === 0) return;
      this.sendPresence(peerIds, getState());
    }, 100);
  }

  stopPresenceBroadcast(): void {
    if (this.presenceInterval !== null) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
  }

  destroy(): void {
    this.stopPresenceBroadcast();
    this.channels.clear();
  }
}
