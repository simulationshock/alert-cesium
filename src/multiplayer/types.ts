// ─── Persistent entities ──────────────────────────────────────────────────────

export interface User {
  id: string;
  displayName: string;
  avatarUrl: string;
  oauthProvider: 'google' | 'github' | 'discord' | 'apple';
}

export interface Lobby {
  id: string;
  code: string;
  hostPeerId: string;
  isPublic: boolean;
  isLocked: boolean;
  memberIds: string[];
  createdAt: number;
}

export interface LobbyMember {
  peerId: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  joinedAt: number;
  isHost: boolean;
}

export interface LobbyListItem {
  id: string;
  hostDisplayName: string;
  memberCount: number;
  createdAt: number;
}

// ─── Annotation geometry ──────────────────────────────────────────────────────

export interface StrokeGeometry  { points: [number, number][]; }
export interface LineGeometry    { start: [number, number]; end: [number, number]; }
export interface CircleGeometry  { center: [number, number]; radiusKm: number; }
export interface RectGeometry    { sw: [number, number]; ne: [number, number]; }
export interface PinGeometry     { point: [number, number]; }

export type AnnotationType = 'stroke' | 'line' | 'circle' | 'rectangle' | 'pin';
export type AnnotationGeometry =
  | StrokeGeometry
  | LineGeometry
  | CircleGeometry
  | RectGeometry
  | PinGeometry;

export interface Annotation {
  id: string;
  annotationType: AnnotationType;
  geometry: AnnotationGeometry;
  label?: string;
  color: string;
  authorPeerId: string;
  createdAt: number;
}

// ─── Real-time state ──────────────────────────────────────────────────────────

export interface PresenceState {
  peerId: string;
  longitude: number;
  latitude: number;
  altitude: number;
  heading: number;
  pitch: number;
  roll: number;
  pilotPeerId: string | null;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  authorPeerId: string;
  displayName: string;
  text: string;
  timestamp: number;
}

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  ttl: number;
}

// ─── Typed outcome unions ─────────────────────────────────────────────────────

export type AuthResult =
  | { type: 'ok'; user: User }
  | { type: 'cancelled' }
  | { type: 'error'; reason: string };

export type LobbyJoinResult =
  | { type: 'connected'; lobby: Lobby; self: { peerId: string }; peers: LobbyMember[]; turnCredentials: TurnCredentials }
  | { type: 'lobby-full' }
  | { type: 'not-found' }
  | { type: 'locked' }
  | { type: 'invalid-code' }
  | { type: 'already-in-lobby' }
  | { type: 'auth-failed' }
  | { type: 'network-error'; reason: string };

export type LobbyCreateResult =
  | { type: 'connected'; lobby: Lobby; self: { peerId: string }; turnCredentials: TurnCredentials }
  | { type: 'auth-failed' }
  | { type: 'network-error'; reason: string };

export type PilotResult =
  | 'following'
  | 'peer-not-found'
  | 'already-following';

// ─── Data channel message types ───────────────────────────────────────────────

export interface PresenceMessage extends PresenceState {
  type: 'presence';
}

export interface AnnotationAddMessage {
  type: 'annotation-add';
  annotation: Annotation;
}

export interface AnnotationDeleteMessage {
  type: 'annotation-delete';
  annotationId: string;
}

export interface AnnotationClearMessage {
  type: 'annotation-clear';
}

export interface StatefulMessage {
  type: 'state-full';
  annotations: Annotation[];
}

export interface StateAckMessage {
  type: 'state-ack';
}

export interface LayerSyncMessage {
  type: 'layer-sync';
  fire: boolean;
  radio: boolean;
  flights: boolean;
}

export interface ChatDataMessage extends ChatMessage {
  type: 'chat';
}

export interface PilotFollowMessage {
  type: 'pilot-follow';
  followerPeerId: string;
  targetPeerId: string;
}

export interface PilotLeaveMessage {
  type: 'pilot-leave';
  followerPeerId: string;
}

export type AnnotationChannelMessage =
  | AnnotationAddMessage
  | AnnotationDeleteMessage
  | AnnotationClearMessage
  | StatefulMessage
  | StateAckMessage
  | LayerSyncMessage;

export type ChatChannelMessage =
  | ChatDataMessage
  | PilotFollowMessage
  | PilotLeaveMessage;
