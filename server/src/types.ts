// ─── Shared primitive types ───────────────────────────────────────────────────

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  ttl: number;
}

export interface LobbyInfo {
  id: string;
  code: string;
  isPublic: boolean;
  isLocked: boolean;
  hostPeerId: string;
}

export interface PeerInfo {
  peerId: string;
  displayName: string;
  avatarUrl: string;
  isHost: boolean;
}

export interface LobbyListItem {
  id: string;
  hostDisplayName: string;
  memberCount: number;
  createdAt: number;
}

// ─── Client → Server messages ─────────────────────────────────────────────────

export interface AuthMessage {
  type: 'auth';
  token: string;
}

export interface ListLobbiesMessage {
  type: 'list-lobbies';
}

export interface CreateLobbyMessage {
  type: 'create-lobby';
  isPublic: boolean;
}

export interface JoinLobbyMessage {
  type: 'join-lobby';
  lobbyId: string;
  code?: string;
}

export interface LeaveLobbyMessage {
  type: 'leave-lobby';
}

export interface RelayOfferMessage {
  type: 'relay-offer';
  targetPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface RelayAnswerMessage {
  type: 'relay-answer';
  targetPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface RelayIceMessage {
  type: 'relay-ice';
  targetPeerId: string;
  candidate: RTCIceCandidateInit;
}

export interface KickMemberMessage {
  type: 'kick-member';
  targetPeerId: string;
}

export interface TogglePrivacyMessage {
  type: 'toggle-privacy';
  isPublic: boolean;
}

export interface LockLobbyMessage {
  type: 'lock-lobby';
  locked: boolean;
}

export interface PromoteHostMessage {
  type: 'promote-host';
  targetPeerId: string;
}

export type ClientMessage =
  | AuthMessage
  | ListLobbiesMessage
  | CreateLobbyMessage
  | JoinLobbyMessage
  | LeaveLobbyMessage
  | RelayOfferMessage
  | RelayAnswerMessage
  | RelayIceMessage
  | KickMemberMessage
  | TogglePrivacyMessage
  | LockLobbyMessage
  | PromoteHostMessage;

// ─── Server → Client messages ─────────────────────────────────────────────────

export interface AuthOkMessage {
  type: 'auth-ok';
  user: { id: string; displayName: string; avatarUrl: string };
}

export interface AuthErrorMessage {
  type: 'auth-error';
  reason: string;
}

export interface LobbyListMessage {
  type: 'lobby-list';
  lobbies: LobbyListItem[];
}

export interface LobbyCreatedMessage {
  type: 'lobby-created';
  lobby: LobbyInfo;
  self: { peerId: string };
  turnCredentials: TurnCredentials;
}

export interface LobbyJoinedMessage {
  type: 'lobby-joined';
  lobby: LobbyInfo;
  self: { peerId: string };
  peers: PeerInfo[];
  turnCredentials: TurnCredentials;
}

export interface JoinErrorMessage {
  type: 'join-error';
  reason: 'lobby-full' | 'not-found' | 'locked' | 'invalid-code' | 'already-in-lobby';
}

export interface PeerJoinedMessage {
  type: 'peer-joined';
  peer: PeerInfo;
}

export interface PeerLeftMessage {
  type: 'peer-left';
  peerId: string;
}

export interface HostPromotedMessage {
  type: 'host-promoted';
  newHostPeerId: string;
}

export interface LobbyUpdatedMessage {
  type: 'lobby-updated';
  lobby: Pick<LobbyInfo, 'id' | 'isPublic' | 'isLocked'>;
}

export interface OfferMessage {
  type: 'offer';
  fromPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface AnswerMessage {
  type: 'answer';
  fromPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface IceMessage {
  type: 'ice';
  fromPeerId: string;
  candidate: RTCIceCandidateInit;
}

export interface KickedMessage {
  type: 'kicked';
}

export interface ErrorMessage {
  type: 'error';
  code: 'unauthorized' | 'malformed' | 'not-in-lobby' | 'unknown-peer';
  message: string;
}

export type ServerMessage =
  | AuthOkMessage
  | AuthErrorMessage
  | LobbyListMessage
  | LobbyCreatedMessage
  | LobbyJoinedMessage
  | JoinErrorMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | HostPromotedMessage
  | LobbyUpdatedMessage
  | OfferMessage
  | AnswerMessage
  | IceMessage
  | KickedMessage
  | ErrorMessage;

// RTCSessionDescriptionInit and RTCIceCandidateInit are browser types —
// use plain objects here since this runs in Node.js.
interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}
