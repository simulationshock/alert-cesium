# Tasks: Multiplayer Collaborative Globe Sessions

**Input**: Design documents from `specs/005-multiplayer-lobbies/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

---

## Phase 1: Setup

**Purpose**: Create both packages (server + browser multiplayer module) with their scaffolding, shared types, and environment configuration.

- [X] T001 Create `server/` directory with `server/package.json` (dependencies: ws, firebase-admin, dotenv; devDependencies: typescript, @types/ws, @types/node), `server/tsconfig.json` (target: ES2022, module: commonjs, outDir: dist), and `server/src/` directory
- [X] T002 [P] Create `server/.env.example` with entries: `PORT=8080`, `FIREBASE_PROJECT_ID=`, `TURN_SERVER_URL=`, `TURN_SECRET=`, `ALLOWED_ORIGINS=`
- [X] T003 [P] Create `src/multiplayer/` directory and `src/multiplayer/types.ts` with all browser-side TypeScript types: `User`, `Lobby`, `LobbyMember`, `Annotation` (with `StrokeGeometry | LineGeometry | CircleGeometry | RectGeometry | PinGeometry`), `PresenceState`, `ChatMessage`, `TurnCredentials`, `LobbyJoinResult` union, `AuthResult` union, `PilotResult` union — matching data-model.md exactly

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Full signaling server implementation. Must be complete and running before any user-story WebRTC work can be tested end-to-end.

**⚠️ CRITICAL**: All user story work from US2 onward requires this server to be running.

- [X] T004 Create `server/src/types.ts` with all signaling message TypeScript types for both directions (client→server and server→client) per `contracts/signaling-messages.md`: `AuthMessage`, `CreateLobbyMessage`, `JoinLobbyMessage`, `RelayOfferMessage`, `RelayAnswerMessage`, `RelayIceMessage`, `KickMemberMessage`, `TogglePrivacyMessage`, `LockLobbyMessage`, `PromoteHostMessage`, `ListLobbiesMessage`, plus all server→client response types
- [X] T005 [P] Create `server/src/AuthValidator.ts`: initialize Firebase Admin SDK from `FIREBASE_PROJECT_ID` env var using application default credentials or service account; export `validateToken(token: string): Promise<{ uid: string } | null>` using `admin.auth().verifyIdToken(token)`, returning null on any error
- [X] T006 [P] Create `server/src/TurnCredentials.ts`: export `generateTurnCredentials(userId: string): TurnCredentials` using HMAC-SHA1 of `"${ttlTimestamp}:${userId}"` with `TURN_SECRET`, format username as `"${ttlTimestamp}:${userId}"`, set TTL 3600s, read `TURN_SERVER_URL` from env
- [X] T007 Create `server/src/LobbyManager.ts`: implement in-memory state with `Map<lobbyId, LobbyState>` and `Map<peerId, lobbyId>`; methods: `createLobby(peerId, isPublic): Lobby`, `joinLobby(peerId, lobbyId, code?): JoinResult`, `leaveLobby(peerId): LeaveResult` (triggers host promotion if host left — promote memberIds[1], return outgoing annotations broadcast instruction), `kickMember(hostPeerId, targetPeerId)`, `togglePrivacy(hostPeerId, isPublic)`, `lockLobby(hostPeerId, locked)`, `promoteHost(hostPeerId, targetPeerId)`, `listPublicLobbies(): LobbyListItem[]`; enforce max 6 members; auto-dissolve when last member leaves
- [X] T008 Create `server/src/index.ts`: HTTP server on `PORT` with GET `/lobbies` returning `LobbyManager.listPublicLobbies()`; WebSocket server on same port; per-connection lifecycle: (1) 5s auth timeout — close with code 4001 if `auth` message not received, (2) validate token via `AuthValidator`, (3) assign `peerId` (UUID v4), (4) route all subsequent messages to appropriate `LobbyManager` methods and relay SDP/ICE to target peer sockets; broadcast `peer-joined`/`peer-left`/`host-promoted`/`lobby-updated` to all lobby members on state changes; embed `TurnCredentials` in `lobby-created` and `lobby-joined` responses

**Checkpoint**: Server builds (`tsc`) and can be started with `node dist/index.js`. Auth, lobby create/join/leave, and SDP relay all functional.

---

## Phase 3: User Story 1 — Account Registration & Identity (Priority: P1) 🎯 MVP

**Goal**: Users can sign in via OAuth (Google, GitHub, Discord, Apple), set a display name and avatar, and have their identity persist across sessions.

**Independent Test**: Sign in, set display name, sign out, sign back in — profile restored. No lobby or WebRTC required.

- [X] T009 [US1] Add Firebase Auth client SDK to `web-demo/index.html` via CDN script tag (`https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js`, `firebase-auth.js`); initialize Firebase app with config object read from a `window.FIREBASE_CONFIG` global (set in HTML or a config script); configure OAuth providers: GoogleAuthProvider, GithubAuthProvider, OAuthProvider('apple.com'), OAuthProvider('discord.com')
- [X] T010 [P] [US1] Add `signIn(provider)` and `signOut()` functions to `web-demo/index.html` script block: `signIn` calls `signInWithPopup(auth, provider)`, stores `auth.currentUser`; `signOut` calls `signOut(auth)`, clears stored user
- [X] T011 [US1] Add auth UI panel to `web-demo/index.html`: top-left floating panel with sign-in buttons for each OAuth provider (shown when signed out), and user avatar + display name + "Edit Profile" + "Sign Out" controls (shown when signed in); style consistent with existing panels
- [X] T012 [US1] Add display name and avatar edit modal to `web-demo/index.html`: text input for display name (1–32 chars), avatar URL input with 40px preview; on save call `updateProfile(auth.currentUser, { displayName, photoURL })`; show modal on first sign-in if displayName is empty

**Checkpoint**: User can sign in with any OAuth provider, set their name/avatar, and sign out. Identity persists on page reload.

---

## Phase 4: User Story 2 — Lobby Creation & Discovery (Priority: P2)

**Goal**: Authenticated users can create public/private lobbies, browse public lobbies, join by code, and host has kick/lock/promote powers. Peers establish WebRTC connections.

**Independent Test**: Two browser windows can create and join the same lobby, see each other in the member list, and have an active RTCPeerConnection (verified in browser DevTools). No drawing or communication required.

- [X] T013 [US2] Create `src/multiplayer/LobbyClient.ts`: manages WebSocket connection to signaling server; methods: `connect(signalingUrl)`, `authenticate(firebaseIdToken)`, `createLobby(isPublic)`, `joinLobby(lobbyId, code?)`, `leaveLobby()`, `listLobbies()`, `sendOffer(targetPeerId, sdp)`, `sendAnswer(targetPeerId, sdp)`, `sendIce(targetPeerId, candidate)`, `kickMember(targetPeerId)`, `togglePrivacy(isPublic)`, `lockLobby(locked)`, `promoteHost(targetPeerId)`; expose EventTarget-style events: `onPeerJoined`, `onPeerLeft`, `onHostPromoted`, `onLobbyUpdated`, `onOffer`, `onAnswer`, `onIce`, `onKicked`; all return typed outcomes matching `src/multiplayer/types.ts`
- [X] T014 [US2] Create `src/multiplayer/PeerMesh.ts`: manages one `RTCPeerConnection` per remote peer; `addPeer(peerId, isInitiator, iceServers)` creates connection and data channel placeholders, sets up `onicecandidate` → `LobbyClient.sendIce()`, `onconnectionstatechange` lifecycle; `handleOffer(peerId, sdp)`, `handleAnswer(peerId, sdp)`, `handleIce(peerId, candidate)` for signaling relay; `removePeer(peerId)` closes and cleans up; expose `getConnection(peerId): RTCPeerConnection | undefined`; when `isInitiator=true` calls `createOffer()` and sends via `LobbyClient.sendOffer()`
- [X] T015 [US2] Wire `LobbyClient` events to `PeerMesh` in a `MultiplayerSession` glue layer (can be inline in `web-demo/index.html` for now): on `onPeerJoined` call `PeerMesh.addPeer(peerId, isInitiator=myPeerId > peerId)` using lexicographic peer ID ordering to determine offer side; on `onPeerLeft` call `PeerMesh.removePeer(peerId)`; on `onOffer/onAnswer/onIce` call corresponding `PeerMesh.handle*()` methods
- [X] T016 [US2] Add lobby browser panel to `web-demo/index.html`: modal overlay showing public lobby list (host name, member count, join button), "Create Lobby" button with public/private radio, "Join by Code" text input + join button; fetch lobby list from signaling server HTTP endpoint on open; auto-refresh every 10 seconds
- [X] T017 [US2] Add lobby HUD to `web-demo/index.html`: persistent sidebar panel (shown when in lobby) with member list (avatar + name + host crown icon), "Leave Lobby" button, host-only controls section: "Lock/Unlock" toggle, "Public/Private" toggle, "Kick" button per member, "Promote Host" button per member; update in real-time on `onPeerJoined`/`onPeerLeft`/`onHostPromoted`/`onLobbyUpdated` events

**Checkpoint**: Two users in same lobby, RTCPeerConnection state = "connected" in DevTools, member list shows both users.

---

## Phase 5: User Story 3 — Real-Time Map Collaboration (Priority: P3)

**Goal**: All lobby members can draw annotations on the shared globe. Annotations sync to all peers on completion. New joiners receive full current state from host.

**Independent Test**: Two users in a lobby can draw and drop pins and see each other's annotations appear on the globe within 1 second. No voice or video required.

- [X] T018 [US3] Create `src/multiplayer/DataChannels.ts`: on each `RTCPeerConnection` create three named data channels — `presence` (`{ordered:false,maxRetransmits:0}`), `annotation` (`{ordered:true,maxRetransmits:3}`), `chat` (`{ordered:true,maxRetransmits:3}`); handle incoming `ondatachannel` events to attach receive handlers for the remote-created channels; export typed `send*(peerId, message)` helpers: `sendPresence`, `sendAnnotationAdd`, `sendAnnotationDelete`, `sendAnnotationClear`, `sendStateAck`, `sendLayerSync`, `sendChat`, `sendPilotFollow`, `sendPilotLeave`; expose `onPresence`, `onAnnotation`, `onChat`, `onPilot` callbacks
- [X] T019 [P] [US3] Create `src/multiplayer/AnnotationManager.ts`: manages active drawing tool state (`'freehand'|'line'|'circle'|'rectangle'|'pin'|null`), active color; registers `pointerdown/pointermove/pointerup` listeners on `viewer.scene.canvas`; on `pointerdown` starts capture, on `pointermove` draws preview entity (temporary dashed Cesium entity), on `pointerup` finalizes annotation geometry using `viewer.scene.pickPosition()` for globe hit-testing, creates permanent Cesium entity, calls `onComplete(annotation: Annotation)` callback; `addRemote(annotation)` creates Cesium entity from remote annotation; `removeAnnotation(id)` removes entity; `clearAll()` removes all annotation entities; `setTool(tool)`, `setColor(hex)` methods
- [X] T020 [US3] Wire annotation broadcast: in session glue code set `annotationManager.onComplete = (a) => DataChannels.sendAnnotationAdd(allPeerIds, a)`; handle incoming `onAnnotation` messages: `annotation-add` → `annotationManager.addRemote()`, `annotation-delete` → `annotationManager.removeAnnotation()`, `annotation-clear` → `annotationManager.clearAll()`
- [X] T021 [US3] Implement new-joiner state transfer in `PeerMesh.ts`: when host detects new peer connection is established (`onconnectionstatechange === 'connected'`) and `isHost===true`, open temporary `transfer-state` data channel (`{ordered:true,maxRetransmits:10}`), send `{type:'state-full', annotations: annotationManager.getAllAnnotations()}` as JSON, wait for `state-ack` or 10s timeout, then close the channel; new-peer side: on `ondatachannel` if `label==='transfer-state'` receive `state-full`, call `annotationManager.addRemote()` for each annotation, send `state-ack`, close channel
- [X] T022 [US3] Add drawing toolbar to `web-demo/index.html`: floating bottom-center panel (shown when in lobby) with tool buttons (freehand ✏, line ─, circle ○, rectangle □, pin 📍), color swatch picker (6 preset colors), host-only "Clear All" button; tool buttons toggle active state; clicking globe canvas activates drawing only when a tool is selected and user is in a lobby

**Checkpoint**: Two users draw annotations and see them on each other's globes. New user joining sees all existing annotations.

---

## Phase 6: User Story 4 — Voice, Video & Text Communication (Priority: P4)

**Goal**: All lobby members can communicate via push-to-talk voice, optional video, and text chat — lobby-wide, all channels shared.

**Independent Test**: Three users in a lobby exchange text messages and transmit voice via PTT. Video can be toggled on/off. All independently verifiable in DevTools (audio/video tracks on RTCPeerConnection).

- [X] T023 [US4] Create `src/multiplayer/MediaManager.ts`: `initialize()` calls `getUserMedia({audio:true,video:true})` and stores stream; `startPTT()` sets `audioTrack.enabled=true`; `stopPTT()` sets `audioTrack.enabled=false` (track starts disabled — PTT default); `toggleVideo(): boolean` toggles `videoTrack.enabled`, returns new state; `addTracksToConnection(pc: RTCPeerConnection)` adds both tracks to all current and future peer connections; `onRemoteTrack(peerId, track, stream)` callback for incoming tracks; `destroy()` stops all tracks
- [X] T024 [US4] Wire `MediaManager` to `PeerMesh`: after `PeerMesh.addPeer()` call `MediaManager.addTracksToConnection(pc)`; on `RTCPeerConnection.ontrack` call `MediaManager.onRemoteTrack(peerId, track, stream)`; handle `onRemoteTrack` in session to route audio tracks to `<audio>` elements and video tracks to `<video>` elements per peer
- [X] T025 [P] [US4] Implement chat send/receive using existing `DataChannels.ts` chat channel: `sendChat(message)` broadcasts `{type:'chat',id,authorPeerId,displayName,text,ts}` to all peers; `onChat` callback fires on receive; local sent messages also appear in chat panel immediately
- [X] T026 [US4] Add chat panel to `web-demo/index.html`: collapsible right-side panel with scrollable message history (sender avatar/name + timestamp + text), text input + Enter/Send button, unread badge when collapsed; wire to `DataChannels.onChat` and `sendChat`
- [X] T027 [US4] Add communication controls to `web-demo/index.html` lobby HUD: PTT button (hold to talk, Space key shortcut) with visual active indicator, video toggle button, mute indicator per peer in member list; render one `<video>` element per peer in a small peer video grid overlay (top-right, max 5 thumbnails); wire PTT mousedown/mouseup and keydown/keyup Space to `MediaManager.startPTT()`/`stopPTT()`

**Checkpoint**: Three users can hear each other via PTT, see video feeds, and exchange text messages.

---

## Phase 7: User Story 5 — Presence Avatars & Pilot Mode (Priority: P5)

**Goal**: Each user appears as a 2D avatar sprite on the globe at their camera position. Users can follow another user's camera (pilot mode) while retaining annotation capability. Followers cluster around pilot sprite.

**Independent Test**: Two users in a lobby see each other's avatar sprites moving on the globe. One can enter and exit pilot mode following the other, with sprite clustering visible.

- [X] T028 [US5] Implement presence broadcast: in `DataChannels.ts`, add a `startPresenceBroadcast(viewer: Viewer, peerId: string)` method that uses `setInterval` at 100ms (10hz), reads `viewer.camera.positionCartographic` and `heading/pitch/roll`, sends `{type:'presence',...}` over all peers' presence channels; add `stopPresenceBroadcast()` to clear interval; call `startPresenceBroadcast` on lobby join and `stopPresenceBroadcast` on leave
- [X] T029 [P] [US5] Create `src/multiplayer/PresenceAvatarManager.ts`: maintains a `Map<peerId, {spriteEntity, frustumEntity}>` of Cesium entities; `addPeer(peerId, displayName, avatarUrl, color)` creates a `billboard` entity (36×36px canvas icon with initials+color circle, or avatar image if URL valid) and a `polygon`/`polyline` frustum entity with `DistanceDisplayCondition(0, 100_000)`; `updatePresence(peerId, state: PresenceState)` updates entity positions and orientations; `removePeer(peerId)` removes entities; `setPixelOffset(peerId, offset: Cartesian2)` updates billboard pixelOffset for clustering; frustum shape matches existing `WildfireCameraMarkerManager` FOV cone style
- [X] T030 [US5] Wire `DataChannels.onPresence` to `PresenceAvatarManager.updatePresence()`: discard messages where `state.ts < lastReceived.ts` (staleness check); call `PresenceAvatarManager.addPeer()` on `onPeerJoined` and `removePeer()` on `onPeerLeft`
- [X] T031 [US5] Create `src/multiplayer/PilotMode.ts`: `followPeer(targetPeerId): PilotResult` sets `activePilotPeerId`, starts `requestAnimationFrame` loop that reads last received `PresenceState` for target peer and calls `viewer.camera.setView({ destination: targetPos, orientation: {heading, pitch, roll} })` with linear interpolation (`lerpFactor=0.25` per frame toward target); `leavePilotMode()` cancels animation frame, clears `activePilotPeerId`, restores camera control; broadcast `{type:'pilot-follow', followerPeerId, targetPeerId}` via `DataChannels.sendPilotFollow()` on follow, `{type:'pilot-leave', followerPeerId}` on leave
- [X] T032 [US5] Implement sprite clustering in `PilotMode.ts`: maintain `Map<pilotPeerId, Set<followerPeerId>>` updated on `pilot-follow`/`pilot-leave` data channel messages from all peers; register `viewer.scene.postUpdate` listener that recalculates `pixelOffset` for all followers of each pilot using polar layout: `angle = (index/total)*2π`, `radius=28`, `offset=new Cartesian2(radius*cos(angle), radius*sin(angle))`; pilot always at `Cartesian2.ZERO`; call `PresenceAvatarManager.setPixelOffset()` for each
- [X] T033 [US5] Wire sprite click to pilot mode in `PresenceAvatarManager.ts`: register `ScreenSpaceEventHandler` for `LEFT_CLICK`; on click pick entity, match to peer sprite, show floating popover (same style as camera/radio pickers) with "Follow [Name]" button and if already following "Leave Pilot Mode" button; wire buttons to `PilotMode.followPeer()` / `leavePilotMode()`

**Checkpoint**: Avatar sprites visible and moving. Pilot mode works — follower camera mirrors pilot. Sprites cluster correctly around pilot in screen space.

---

## Phase 8: User Story 6 — Layer Sync (Priority: P6)

**Goal**: Lobby host can broadcast current layer visibility to all peers, ensuring everyone sees the same data layers.

**Independent Test**: Host toggles layers and clicks "Sync Layers" — all peers' layer states update to match within 1 second.

- [X] T034 [US6] Implement layer-sync send: add `broadcastLayerState(state: {fire:boolean,radio:boolean,flights:boolean})` to session glue — calls `DataChannels.sendLayerSync(allPeerIds, state)` with guard that only executes if current user is host; silently ignored if not host
- [X] T035 [US6] Implement layer-sync receive: in `DataChannels.onAnnotation` handler, detect `{type:'layer-sync'}` message and call registered `onLayerSync` callback; in `web-demo/index.html` wire `onLayerSync` to update the fire overlay, radio marker manager, and flight marker manager `setVisible()` calls to match received state
- [X] T036 [US6] Add "Sync Layers to All" button to lobby HUD host-only controls section in `web-demo/index.html`; button reads current visibility state of all three layer managers and calls `broadcastLayerState()`; show "Synced ✓" confirmation for 2 seconds after click

**Checkpoint**: Host syncs layers, all peers' layers update.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T037 Create `src/multiplayer/index.ts`: `MultiplayerSession` class that composes `LobbyClient`, `PeerMesh`, `DataChannels`, `AnnotationManager`, `MediaManager`, `PresenceAvatarManager`, `PilotMode` into the single public API matching all scenarios in `quickstart.md`; typed constructor options, typed return values for all async methods; `destroy()` tears down all components cleanly
- [X] T038 [P] Add WebSocket reconnection to `LobbyClient.ts`: on `close` event (not kicked) attempt reconnect up to 3 times with 1s/2s/4s backoff; on successful reconnect re-authenticate and re-join the same lobby ID if one was active; if reconnect fails after 3 attempts emit `onSessionEnded` event
- [X] T039 [P] Add session-ended handling to `web-demo/index.html`: on `onSessionEnded` or `onKicked` show toast notification ("Session ended — you have been disconnected" / "You were removed from the lobby"), return UI to lobby browser state, stop presence broadcast, call `PeerMesh` cleanup
- [X] T040 [P] Write Playwright e2e test in `tests/e2e/auth-lobby.spec.ts`: launch browser, sign in with Firebase test account (using `signInWithEmailAndPassword` with test credentials from env), verify auth UI shows user name, create public lobby, verify lobby appears in lobby list
- [X] T041 [P] Write Playwright e2e test in `tests/e2e/peer-connection.spec.ts`: launch two browser contexts, both sign in, Context A creates lobby, Context B joins, verify both see each other in member list and `RTCPeerConnection.connectionState === 'connected'`
- [X] T042 Run `npm run build` (`tsc --noEmit`) from repo root and verify all `src/multiplayer/*.ts` files compile cleanly with no errors
- [X] T043 [P] Create `server/README.md` with deployment instructions: required env vars, `npm install && npm run build && node dist/index.js`, TURN server setup options (Cloudflare Calls free tier, Metered, self-hosted coturn), Firebase project setup steps (enable Auth, add OAuth providers, get web config)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — blocks US2+ (US1 auth can be built independently)
- **Phase 3 (US1 Auth)**: Depends on Phase 1 only — can run in parallel with Phase 2
- **Phase 4 (US2 Lobby)**: Depends on Phase 2 (server running) + Phase 3 (auth tokens needed)
- **Phase 5 (US3 Annotations)**: Depends on Phase 4 (RTCPeerConnection + DataChannels)
- **Phase 6 (US4 Communication)**: Depends on Phase 4 (RTCPeerConnection for tracks)
- **Phase 7 (US5 Presence)**: Depends on Phase 4 (DataChannels) + Phase 5 (DataChannels created)
- **Phase 8 (US6 Layer Sync)**: Depends on Phase 5 (DataChannels annotation channel reused)
- **Phase 9 (Polish)**: Depends on all stories complete

### User Story Independence

- **US1**: Fully independent — no server required beyond Firebase Auth
- **US2**: Requires US1 (auth token) + Phase 2 (server)
- **US3, US4**: Both require US2 (PeerMesh), can be built in parallel
- **US5**: Requires US2 (PeerMesh + DataChannels from US3)
- **US6**: Requires US5 or at minimum US3 (DataChannels annotation channel)

### Parallel Opportunities Per Phase

**Phase 1**: T002, T003 parallel with T001
**Phase 2**: T005, T006 parallel after T004; T008 depends on T007
**Phase 3**: T010 parallel with T009; T011, T012 sequential after T010
**Phase 4**: T013, T014 parallel; T015 after both; T016, T017 parallel with T013–T015
**Phase 5**: T019 parallel with T018; T021 after T018+T019; T022 after T018+T019
**Phase 6**: T023, T025 parallel; T026, T027 parallel after T024
**Phase 7**: T029, T031 parallel; T032 after T031; T033 after T029+T031
**Phase 9**: T038, T039, T040, T041, T043 all parallel after T037

---

## Implementation Strategy

### MVP (US1 + US2 only)

1. Phase 1: Setup
2. Phase 2: Foundational server (T004–T008)
3. Phase 3: Auth UI (T009–T012) — independently testable
4. Phase 4: Lobby + WebRTC connections (T013–T017)
5. **STOP**: Two users in a lobby with live WebRTC connection = shippable milestone

### Incremental Delivery

1. Setup + Foundational → server running
2. US1 Auth → sign-in/out works
3. US2 Lobbies → two peers connected via WebRTC
4. US3 Annotations → collaborative drawing on shared globe
5. US4 Communication → voice + video + chat
6. US5 Presence → avatars + pilot mode
7. US6 Layer Sync → host controls all peers' layers
8. Polish → production-ready

---

## Notes

- `[P]` = different files, no incomplete dependencies — safe to run in parallel
- Each user story is independently completable and testable before moving to the next
- The signaling server (Phase 2) is the critical path — it blocks US2 through US6
- US1 (auth) can be developed and tested while the server is being built
- `npm run build` must pass after every task that touches `src/`
- The `transfer-state` channel (T021) is the most complex single task — allocate extra time
