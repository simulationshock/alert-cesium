export interface MediaManagerCallbacks {
  onRemoteTrack?: (peerId: string, track: MediaStreamTrack, stream: MediaStream) => void;
}

export class MediaManager {
  private stream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  readonly callbacks: MediaManagerCallbacks;

  constructor(callbacks: MediaManagerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async initialize(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    this.audioTrack = this.stream.getAudioTracks()[0] ?? null;
    this.videoTrack = this.stream.getVideoTracks()[0] ?? null;
    if (this.audioTrack) this.audioTrack.enabled = false; // PTT default: muted
    if (this.videoTrack) this.videoTrack.enabled = false;
  }

  startPTT(): void {
    if (this.audioTrack) this.audioTrack.enabled = true;
  }

  stopPTT(): void {
    if (this.audioTrack) this.audioTrack.enabled = false;
  }

  toggleVideo(): boolean {
    if (!this.videoTrack) return false;
    this.videoTrack.enabled = !this.videoTrack.enabled;
    return this.videoTrack.enabled;
  }

  get isVideoEnabled(): boolean {
    return this.videoTrack?.enabled ?? false;
  }

  addTracksToConnection(pc: RTCPeerConnection): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) {
      pc.addTrack(track, this.stream);
    }
  }

  handleRemoteTrack(peerId: string, track: MediaStreamTrack, streams: readonly MediaStream[]): void {
    const stream = streams[0] ?? new MediaStream([track]);
    this.callbacks.onRemoteTrack?.(peerId, track, stream);
  }

  destroy(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
      this.audioTrack = null;
      this.videoTrack = null;
    }
  }
}
