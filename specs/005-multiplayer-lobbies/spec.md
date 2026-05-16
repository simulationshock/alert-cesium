# Feature Specification: Multiplayer Collaborative Globe Sessions

**Feature Branch**: `005-multiplayer-lobbies`
**Created**: 2026-05-15
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Account Registration & Identity (Priority: P1)

A new visitor wants to participate in collaborative sessions. They sign in using an existing account from a mainstream provider (Google, GitHub, Discord, or Apple) — no new password to create or manage. After signing in they set a display name and choose or upload an avatar. Their identity persists across sessions.

**Why this priority**: Authentication is the gate to all other multiplayer features. Without it no lobby, presence, or moderation feature can function. It must exist first.

**Independent Test**: A user can sign in via OAuth, set a display name and avatar, sign out, and sign back in to find their profile intact — with no lobby or map collaboration required.

**Acceptance Scenarios**:

1. **Given** a visitor on the app, **When** they click Sign In and choose Google, **Then** they are redirected to Google OAuth, returned to the app as an authenticated user with a session, and prompted to set a display name if they have not done so before.
2. **Given** an authenticated user, **When** they update their display name or avatar, **Then** the change persists and is reflected immediately in any active lobby they are in.
3. **Given** an authenticated user, **When** they sign out, **Then** their session is cleared and they cannot access lobby creation or join private lobbies until they sign in again.
4. **Given** a returning user, **When** they sign in again, **Then** their previously saved display name and avatar are restored automatically.

---

### User Story 2 - Lobby Creation & Discovery (Priority: P2)

An authenticated user wants to start a collaborative session. They create a lobby, choose whether it is public (visible to all) or private (invite-only), and receive a shareable link or code for private access. Public lobbies appear in a browsable list so anyone can discover and join active sessions. The lobby creator becomes the host with moderation powers.

**Why this priority**: Lobbies are the container for all collaboration. Presence, communication, and map sync all depend on an active lobby existing.

**Independent Test**: A user can create a public lobby, see it appear in the public lobby browser from another account, and join it — with no drawing tools or communication required.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they create a public lobby, **Then** the lobby appears in the public lobby browser within 5 seconds and displays the host's name and current user count.
2. **Given** an authenticated user, **When** they create a private lobby, **Then** they receive a unique join code and shareable link; the lobby does not appear in the public browser.
3. **Given** a public lobby with fewer than 6 members, **When** any authenticated user clicks Join, **Then** they enter the lobby successfully.
4. **Given** a public lobby that is full (6 members), **When** a user attempts to join, **Then** they see a "lobby full" message and cannot enter.
5. **Given** a lobby host, **When** they toggle the lobby from public to private mid-session, **Then** the lobby is immediately removed from the public browser and existing members remain.
6. **Given** a lobby host, **When** they kick a member, **Then** that member is removed from the lobby immediately and cannot rejoin unless re-invited.
7. **Given** a host who leaves the lobby, **When** other members remain, **Then** host status is automatically promoted to another member and the remaining session continues uninterrupted.

---

### User Story 3 - Real-Time Map Collaboration (Priority: P3)

Members of a lobby want to annotate the shared Cesium globe together. Each user can draw freehand strokes, lines, circles, and rectangles, or drop named pins. When a user completes an action (releases the mouse after drawing, drops a pin), the annotation appears on every other member's globe instantly. All annotations persist for the life of the lobby and are cleared when the last member leaves.

**Why this priority**: Shared map annotation is the core collaborative value of the feature — the primary reason to be in a lobby together.

**Independent Test**: Two authenticated users in the same lobby can each draw annotations and drop pins and see each other's actions on the globe in real time, with no voice or video required.

**Acceptance Scenarios**:

1. **Given** two users in a lobby, **When** User A completes a freehand stroke, **Then** User B sees the stroke appear on their globe within 1 second.
2. **Given** two users in a lobby, **When** User A drops a pin with a label, **Then** User B sees the pin at the correct location with the correct label.
3. **Given** a user joining an active lobby mid-session, **When** their connection is established, **Then** all existing annotations drawn before they joined are immediately visible on their globe.
4. **Given** the last member leaving a lobby, **When** they disconnect, **Then** all annotations are discarded and the lobby ceases to exist.
5. **Given** a lobby host, **When** they clear all annotations, **Then** all members' globes are cleared simultaneously.
6. **Given** two users drawing simultaneously, **When** both complete actions at the same time, **Then** both annotations appear on all members' globes without either being lost.

---

### User Story 4 - Voice, Video & Text Communication (Priority: P4)

Lobby members want to communicate in real time while collaborating on the map. Voice is push-to-talk by default. Video can be toggled on. Text chat is always available. All communication is lobby-wide — everyone hears, sees, and reads the same channels.

**Why this priority**: Communication amplifies map collaboration but is not required for it. Map annotation delivers standalone value; communication makes it richer.

**Independent Test**: Three users in a lobby can exchange text messages, transmit voice with push-to-talk, and enable video — all independently verifiable without map annotation.

**Acceptance Scenarios**:

1. **Given** a lobby member, **When** they hold the push-to-talk key and speak, **Then** all other lobby members hear them within 300ms.
2. **Given** a lobby member, **When** they release push-to-talk, **Then** audio transmission stops immediately.
3. **Given** a lobby member, **When** they enable their camera, **Then** all other members see a live video feed from that user.
4. **Given** a lobby member, **When** they type and send a text message, **Then** the message appears in all members' chat panels with the sender's display name and timestamp.
5. **Given** a lobby member with microphone access denied by the browser, **When** they attempt push-to-talk, **Then** they see a clear error message explaining the permission requirement.

---

### User Story 5 - Presence Avatars & Pilot Mode (Priority: P5)

Each lobby member is represented as a 2D avatar sprite on the globe at their current camera position. Other members can see where everyone is looking. At city-scale zoom levels a camera frustum indicator shows each user's approximate field of view. Any member can choose to follow another member's camera (pilot mode), sharing their perspective while retaining full annotation capability. Multiple followers of the same pilot have their sprites clustered around the pilot's sprite on the globe. When a pilot leaves, all followers are released to independent camera control.

**Why this priority**: Presence and pilot mode enrich the collaborative experience but the session is fully functional without them.

**Independent Test**: Two users in a lobby can see each other's avatar sprites moving on the globe as they navigate, and one can enter and exit pilot mode following the other — independently of all communication features.

**Acceptance Scenarios**:

1. **Given** two users in a lobby, **When** User A moves their camera, **Then** User B sees User A's avatar sprite update position on the globe within 200ms.
2. **Given** a user zoomed to city scale, **When** they look at another member's sprite, **Then** a frustum indicator shows that member's approximate field of view on the globe surface.
3. **Given** a user at continental or global zoom, **When** viewing another member's sprite, **Then** no frustum indicator is shown.
4. **Given** User A clicking User B's sprite, **When** User A selects Follow, **Then** User A's camera mirrors User B's position and orientation; User A's sprite clusters beside User B's sprite on the globe.
5. **Given** User A following User B (pilot mode), **When** User A draws an annotation, **Then** the annotation appears for all members at the correct globe location.
6. **Given** multiple users following the same pilot, **When** viewing the globe, **Then** all follower sprites are arranged in screen space around the pilot's sprite with the pilot centered.
7. **Given** User A following User B (pilot mode), **When** User B disconnects, **Then** User A's camera control is immediately restored and their sprite moves independently.

---

### User Story 6 - Layer Sync (Priority: P6)

The lobby host can push the current state of map layer visibility (fire incident overlay, radio feeds, live flight data) to all members simultaneously, ensuring everyone is looking at the same data layers.

**Why this priority**: Useful for guided sessions but each member can already toggle layers independently. This is a quality-of-life host power, not a core requirement.

**Independent Test**: A host can broadcast their current layer visibility state and all members' layer toggles update to match — independently of annotation or communication features.

**Acceptance Scenarios**:

1. **Given** a host with specific layers enabled, **When** they broadcast layer state, **Then** all members' layer visibility updates to match the host's within 1 second.
2. **Given** a non-host member, **When** they attempt to broadcast layer state, **Then** the option is not available to them.

---

### Edge Cases

- What happens when the host's browser crashes mid-session? — Host promotion must be automatic and immediate; remaining members must not lose their session or annotations.
- What happens when a member's connection drops temporarily and reconnects? — They should re-receive current map state from the host on reconnection.
- What happens when two members attempt to delete the same annotation simultaneously? — Last-write-wins is acceptable; the annotation disappears for all members.
- What happens when a lobby reaches 6 members and the host tries to invite more? — The invite link remains valid but joiners see a "lobby full" message until a spot opens.
- What happens when push-to-talk is held by multiple members at once? — All transmitting members are heard simultaneously; no queuing or locking.
- What happens when a follower in pilot mode draws an annotation while the pilot is flying rapidly? — The annotation is placed at the globe coordinates at the moment of completion, regardless of subsequent camera movement.

---

## Requirements *(mandatory)*

### Functional Requirements

**Authentication**
- **FR-001**: Users MUST be able to sign in using Google, GitHub, Discord, or Apple OAuth without creating a separate username or password.
- **FR-002**: Authenticated users MUST be able to set and update a display name and avatar that persist across sessions.
- **FR-003**: Unauthenticated visitors MUST be able to view the public lobby browser but not create or join lobbies.

**Lobby Management**
- **FR-004**: Authenticated users MUST be able to create a lobby and designate it as public or private at creation time.
- **FR-005**: Lobbies MUST enforce a maximum of 6 concurrent members.
- **FR-006**: Public lobbies MUST appear in a discoverable lobby browser showing host name, member count, and creation time.
- **FR-007**: Private lobbies MUST provide a unique join code and shareable URL; they MUST NOT appear in the public browser.
- **FR-008**: Lobby hosts MUST be able to toggle a lobby between public and private at any time during the session.
- **FR-009**: Lobby hosts MUST be able to kick members, lock the lobby against new joins, and promote another member to host.
- **FR-010**: When the host leaves, the system MUST automatically promote another member to host before the departing host fully disconnects.
- **FR-011**: Lobby state MUST be ephemeral — all annotations and session data MUST be discarded when the last member leaves.

**Map Collaboration**
- **FR-012**: Members MUST be able to draw freehand strokes, straight lines, circles, and rectangles on the globe.
- **FR-013**: Members MUST be able to drop labeled pins at any globe location.
- **FR-014**: Completed annotation actions MUST be broadcast to all lobby members and appear on their globes within 1 second.
- **FR-015**: A new member joining an active lobby MUST receive the full current annotation state from the host upon connection.
- **FR-016**: Lobby hosts MUST be able to clear all annotations for all members simultaneously.

**Communication**
- **FR-017**: All lobby members MUST be able to transmit voice audio using a push-to-talk control; push-to-talk MUST be the default voice mode.
- **FR-018**: All lobby members MUST be able to enable and disable video transmission at will.
- **FR-019**: All lobby members MUST be able to send and receive text chat messages within the lobby.
- **FR-020**: Voice, video, and text communication MUST be lobby-wide; no private sub-channels.

**Presence & Pilot Mode**
- **FR-021**: Each lobby member MUST be represented as a 2D avatar sprite on the globe at their current camera position, updated at least 5 times per second.
- **FR-022**: Camera frustum indicators MUST be visible on member sprites only when the viewing camera is at approximately city-scale altitude or below.
- **FR-023**: Any member MUST be able to enter pilot mode by selecting another member's sprite, causing their camera to mirror the pilot's.
- **FR-024**: Members in pilot mode MUST retain full annotation capability.
- **FR-025**: Multiple followers of the same pilot MUST have their sprites arranged in screen space around the pilot's sprite, with the pilot centered.
- **FR-026**: When a pilot leaves the lobby or explicitly ends the session, all followers MUST have independent camera control restored immediately.

**Layer Sync**
- **FR-027**: Lobby hosts MUST be able to broadcast their current layer visibility state (fire overlay, radio feeds, flight data) to all members.

### Key Entities

- **User**: An authenticated individual with a persistent display name, avatar, and OAuth provider identity.
- **Lobby**: An ephemeral session container with a unique ID, public/private status, host assignment, member list (max 6), and shareable join code.
- **Annotation**: A completed map drawing or pin belonging to a lobby session — has a type (stroke, line, circle, rectangle, pin), geometry, optional label, and author identity. Ephemeral.
- **Presence**: A per-member real-time record of camera position, heading, pitch, altitude, and pilot-mode status. Not persisted.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can sign in via OAuth and have a fully configured profile (display name + avatar) within 2 minutes of first visit.
- **SC-002**: A user can create a lobby and share its link with another user who successfully joins within 30 seconds.
- **SC-003**: Annotations drawn by one member appear on all other members' globes within 1 second under normal network conditions.
- **SC-004**: Voice transmission from push-to-talk to audible audio on receiving peers occurs within 300ms.
- **SC-005**: Presence avatar positions update across all peers at least 5 times per second at city-scale zoom.
- **SC-006**: A new member joining an active lobby with existing annotations receives the full map state within 3 seconds of connection.
- **SC-007**: When a host leaves, host promotion and session continuity are maintained within 2 seconds with no annotation loss.
- **SC-008**: All peer-to-peer connections (voice, video, data) are established within 5 seconds of joining a lobby for at least 80% of users; the remaining users fall back to relay with no additional user action required.
- **SC-009**: A 6-member lobby with active voice, video, and map annotation remains stable for a 60-minute session without requiring a page reload.

---

## Assumptions

- Users have a modern browser with WebRTC support (Chrome, Firefox, Edge, Safari 15+).
- The signaling server is hosted separately from the static GitHub Pages frontend and is always reachable over HTTPS/WSS.
- OAuth provider credentials and relay server credentials are supplied via environment configuration on the signaling server — not exposed to the client.
- A managed OAuth provider (Clerk or Supabase Auth) handles token issuance and refresh; the signaling server validates tokens but does not issue them.
- Relay fallback infrastructure is provided by a third-party service (e.g., Cloudflare Calls or Metered) and is configured via environment variables.
- Guest (unauthenticated) access to lobbies is out of scope for this version.
- Lobby history, annotation export, and session recording are out of scope for this version.
- Mobile browser support is a best-effort consideration, not a hard requirement for v1.
- The maximum lobby size of 6 is a v1 constraint; the architecture should not make increasing this limit artificially difficult in the future.
