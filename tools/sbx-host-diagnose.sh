#!/usr/bin/env sh
# Host-side diagnostic for Darb <-> sbx communication.
# Run this on the HOST, not inside the OpenClaw container:
#   sh /path/to/workspace/tools/sbx-host-diagnose.sh
set -eu

redact_env() {
  sed -E 's/((TOKEN|KEY|SECRET|API|AUTH|PASSWORD|COOKIE)[A-Z0-9_]*=).*/\1***REDACTED***/I'
}

section() { printf '\n== %s ==\n' "$1"; }

section identity
id || true
hostname || true
pwd || true

section commands
for c in docker podman nerdctl sbx openclaw claude codex opencode; do
  printf '%-10s ' "$c"
  command -v "$c" || true
done

section docker_socket
for p in /var/run/docker.sock /run/docker.sock "$HOME/.docker/run/docker.sock"; do
  [ -e "$p" ] && ls -la "$p" || true
done

section docker_info
if command -v docker >/dev/null 2>&1; then
  docker version --format '{{json .}}' 2>/dev/null || docker version || true
  docker context ls 2>/dev/null || true
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
else
  echo 'docker command not found on host PATH'
fi

section sbx
if command -v sbx >/dev/null 2>&1; then
  sbx --help 2>&1 | head -80 || true
else
  echo 'sbx command not found on host PATH'
fi

section named_targets
if command -v docker >/dev/null 2>&1; then
  docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null \
    | grep -Ei 'claude-darb|codex-darb|opencode-nrp-darb|openclaw-sbx|sbx' || true
fi

section env_hints
env | sort | grep -Ei 'docker|sandbox|sbx|openclaw|claude|codex|opencode|nrp' | redact_env || true

section workspace_visibility
printf 'script_path=%s\n' "$0"
printf 'workspace_guess=%s\n' "$(cd "$(dirname "$0")/.." && pwd 2>/dev/null || true)"
ls -la "$(dirname "$0")/.." 2>/dev/null | head -40 || true

section recommended_next
cat <<'MSG'
If host sees docker/sbx but the OpenClaw container does not, pick one:

A) Direct Docker control from OpenClaw container:
   - mount /var/run/docker.sock into the OpenClaw container
   - install/provide docker CLI in the container
   - set matching docker group permissions if needed

B) Safer host bridge:
   - keep Docker only on host
   - run a narrow allowlisted host-side relay that accepts only sbx/docker operations we define

C) OpenClaw native sandbox:
   - configure agents.defaults.sandbox.backend=docker and mode=non-main/all
   - requires the same Docker socket/CLI access from the Gateway runtime
MSG
