import 'dotenv/config';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { validateToken } from './AuthValidator.js';
import { generateTurnCredentials } from './TurnCredentials.js';
import { LobbyManager } from './LobbyManager.js';
import type { ClientMessage, ServerMessage } from './types.js';

const PORT = parseInt(process.env['PORT'] ?? '8080', 10);
const ALLOWED_ORIGINS = (process.env['ALLOWED_ORIGINS'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
const AUTH_TIMEOUT_MS = 5000;

interface AuthedSocket {
  ws: WebSocket;
  peerId: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
}

const manager = new LobbyManager();
const peers = new Map<string, AuthedSocket>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(peerIds: string[], msg: ServerMessage, excludePeerId?: string): void {
  for (const id of peerIds) {
    if (id === excludePeerId) continue;
    const peer = peers.get(id);
    if (peer) send(peer.ws, msg);
  }
}

function handleMessage(authed: AuthedSocket, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    send(authed.ws, { type: 'error', code: 'malformed', message: 'Invalid JSON' });
    return;
  }

  const { peerId, userId, displayName, avatarUrl } = authed;

  switch (msg.type) {
    case 'auth': {
      // Already authed — ignore duplicate auth messages
      break;
    }

    case 'list-lobbies': {
      send(authed.ws, { type: 'lobby-list', lobbies: manager.listPublicLobbies() });
      break;
    }

    case 'create-lobby': {
      const lobby = manager.createLobby(peerId, userId, displayName, avatarUrl, msg.isPublic);
      send(authed.ws, {
        type: 'lobby-created',
        lobby: manager.toLobbyInfo(lobby),
        self: { peerId },
        turnCredentials: generateTurnCredentials(userId),
      });
      break;
    }

    case 'join-lobby': {
      const result = manager.joinLobby(peerId, userId, displayName, avatarUrl, msg.lobbyId, msg.code);
      if (!result.ok) {
        send(authed.ws, { type: 'join-error', reason: result.reason });
        return;
      }
      const { lobby, existingMembers } = result;
      send(authed.ws, {
        type: 'lobby-joined',
        lobby: manager.toLobbyInfo(lobby),
        self: { peerId },
        peers: manager.toPeerInfoList(lobby).filter(p => p.peerId !== peerId),
        turnCredentials: generateTurnCredentials(userId),
      });
      const newMemberInfo = { peerId, displayName, avatarUrl, isHost: false };
      const existingPeerIds = existingMembers.map(m => m.peerId);
      broadcast(existingPeerIds, { type: 'peer-joined', peer: newMemberInfo });
      break;
    }

    case 'leave-lobby': {
      const leaveResult = manager.leaveLobby(peerId);
      if (leaveResult.dissolved) {
        // Nothing to broadcast; lobby gone
        break;
      }
      const memberIds = manager.getMemberPeerIds(leaveResult.lobby.id);
      broadcast(memberIds, { type: 'peer-left', peerId });
      if (leaveResult.newHostPeerId) {
        broadcast(memberIds, { type: 'host-promoted', newHostPeerId: leaveResult.newHostPeerId });
      }
      break;
    }

    case 'relay-offer': {
      const target = peers.get(msg.targetPeerId);
      if (!target) {
        send(authed.ws, { type: 'error', code: 'unknown-peer', message: `Peer ${msg.targetPeerId} not found` });
        return;
      }
      send(target.ws, { type: 'offer', fromPeerId: peerId, sdp: msg.sdp });
      break;
    }

    case 'relay-answer': {
      const target = peers.get(msg.targetPeerId);
      if (!target) {
        send(authed.ws, { type: 'error', code: 'unknown-peer', message: `Peer ${msg.targetPeerId} not found` });
        return;
      }
      send(target.ws, { type: 'answer', fromPeerId: peerId, sdp: msg.sdp });
      break;
    }

    case 'relay-ice': {
      const target = peers.get(msg.targetPeerId);
      if (!target) {
        // ICE candidates can race with disconnect — silently drop
        return;
      }
      send(target.ws, { type: 'ice', fromPeerId: peerId, candidate: msg.candidate });
      break;
    }

    case 'kick-member': {
      const kicked = manager.kickMember(peerId, msg.targetPeerId);
      if (!kicked) return;
      const kickedPeer = peers.get(msg.targetPeerId);
      if (kickedPeer) send(kickedPeer.ws, { type: 'kicked' });
      const lobby = manager.getLobbyForPeer(peerId);
      if (lobby) {
        broadcast(manager.getMemberPeerIds(lobby.id), { type: 'peer-left', peerId: msg.targetPeerId });
      }
      break;
    }

    case 'toggle-privacy': {
      const lobby = manager.togglePrivacy(peerId, msg.isPublic);
      if (!lobby) return;
      const update = { type: 'lobby-updated' as const, lobby: { id: lobby.id, isPublic: lobby.isPublic, isLocked: lobby.isLocked } };
      broadcast(manager.getMemberPeerIds(lobby.id), update);
      break;
    }

    case 'lock-lobby': {
      const lobby = manager.lockLobby(peerId, msg.locked);
      if (!lobby) return;
      const update = { type: 'lobby-updated' as const, lobby: { id: lobby.id, isPublic: lobby.isPublic, isLocked: lobby.isLocked } };
      broadcast(manager.getMemberPeerIds(lobby.id), update);
      break;
    }

    case 'promote-host': {
      const lobby = manager.promoteHost(peerId, msg.targetPeerId);
      if (!lobby) return;
      broadcast(manager.getMemberPeerIds(lobby.id), { type: 'host-promoted', newHostPeerId: msg.targetPeerId });
      break;
    }

    default: {
      send(authed.ws, { type: 'error', code: 'malformed', message: 'Unknown message type' });
    }
  }
}

function onDisconnect(peerId: string): void {
  peers.delete(peerId);
  const leaveResult = manager.leaveLobby(peerId);
  if (leaveResult.dissolved) return;
  const memberIds = manager.getMemberPeerIds(leaveResult.lobby.id);
  broadcast(memberIds, { type: 'peer-left', peerId });
  if (leaveResult.newHostPeerId) {
    broadcast(memberIds, { type: 'host-promoted', newHostPeerId: leaveResult.newHostPeerId });
  }
}

// ─── HTTP/HTTPS server ────────────────────────────────────────────────────────

const TLS_CERT = process.env['TLS_CERT_PATH'];
const TLS_KEY  = process.env['TLS_KEY_PATH'];

const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
  const origin = req.headers.origin ?? '';
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    res.writeHead(403);
    res.end();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/lobbies') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(manager.listPublicLobbies()));
    return;
  }

  res.writeHead(404);
  res.end();
};

const httpServer = TLS_CERT && TLS_KEY
  ? createHttpsServer({ cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) }, requestHandler)
  : createHttpServer(requestHandler);

// ─── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const origin = req.headers.origin ?? '';
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    ws.close(4003, 'Origin not allowed');
    return;
  }

  let authed: AuthedSocket | null = null;

  const authTimeout = setTimeout(() => {
    if (!authed) ws.close(4001, 'Auth timeout');
  }, AUTH_TIMEOUT_MS);

  ws.on('message', async (data) => {
    const raw = data.toString();

    if (!authed) {
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(raw) as ClientMessage;
      } catch {
        ws.close(4000, 'Malformed message');
        return;
      }

      if (parsed.type !== 'auth') {
        ws.close(4001, 'Expected auth message');
        return;
      }

      const userInfo = await validateToken(parsed.token);
      if (!userInfo) {
        send(ws, { type: 'auth-error', reason: 'Invalid or expired token' });
        ws.close(4001, 'Unauthorized');
        return;
      }

      clearTimeout(authTimeout);
      const peerId = randomUUID();
      authed = {
        ws,
        peerId,
        userId: userInfo.uid,
        displayName: userInfo.displayName ?? 'Anonymous',
        avatarUrl: userInfo.photoURL ?? '',
      };
      peers.set(peerId, authed);

      send(ws, {
        type: 'auth-ok',
        user: { id: userInfo.uid, displayName: authed.displayName, avatarUrl: authed.avatarUrl },
      });
      return;
    }

    handleMessage(authed, raw);
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (authed) onDisconnect(authed.peerId);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    clearTimeout(authTimeout);
    if (authed) onDisconnect(authed.peerId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
