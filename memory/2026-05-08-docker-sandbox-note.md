# Docker Sandbox Networking Note (2026-05-08)

Key points for connecting OpenClaw (running in a Docker container) with a Claude agent inside a Docker Sandbox (sbx):

1. **Isolation:** Docker Sandboxes run in microVMs. Inside the sandbox, `localhost` refers only to the sandbox itself.
2. **HTTP Proxy:** The sandbox provides an HTTP proxy at `host.docker.internal:3128`. You can allow host services via:
   ```bash
   sbx network proxy <sandbox-name> --allow-host localhost
   ```
3. **Bridge Script (Node.js):** If the agent (e.g., OpenClaw) does not respect `HTTP_PROXY`, a small bridge script can be used. The bridge listens on `127.0.0.1:54321` inside the sandbox and forwards traffic through the proxy to the host.
4. **Direct Port Exposure:** To connect directly, expose the needed ports on the host using `sbx ports` (e.g., `sbx ports <sandbox> --publish <host-port>:<sandbox-port>`). Ensure the service inside the sandbox binds to `0.0.0.0`.
5. **Typical Claude Service Ports:**
   - Viewer/Server: `3400` (or `3000`)
   - MCP Webhook: `8788`
   - ttyd Terminal: `7681`
   - Local LLM/Ollama: `8000`
6. **Connection Flow (bridge approach):**
   OpenClaw → bridge (`127.0.0.1:54321` inside sandbox) → proxy (`host.docker.internal:3128`) → target service on host.

**Summary:** Use the sandbox proxy or a bridge script for the OpenClaw container to reach the Claude agent, or expose the specific service ports via `sbx ports` ensuring the service binds to `0.0.0.0`.

Sources:
- https://www.docker.com/blog/run-openclaw-securely-in-docker-sandboxes/