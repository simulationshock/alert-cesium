# Multiple Provider Setup

_Created: 2026-05-08_

## Overview
Set up multiple AI providers for OpenClaw, starting from currently available accounts and expanding as keys/capabilities become available.

## Status
- Current phase: active routing rollout / Docker sandbox agents unavailable
- Last updated: 2026-05-08

## Tech Stack
- Runtime: OpenClaw in Docker container
- Host access: Docker sandbox agents (`sbx`, `claude-darb`, `codex-darb`, `opencode-nrp-darb`) are currently unavailable from this environment
- Native OpenClaw sub-agents via `sessions_spawn` are available and should replace Docker sandbox agents for detached work until host sandbox access is restored
- NVIDIA models are currently free-tier/free models and may be rate limited
- Providers: NRP ELLM, NVIDIA; others TBD
- Credentials: Do not store API keys/tokens in memory, vault notes, or transcripts
- Routing: active no-Docker-sandbox plan in place

## Key Decisions
- User currently does not have Anthropic or OpenAI API keys.
- Docker sandbox agents are unavailable right now; do not route work to `claude-darb`, `codex-darb`, or `opencode-nrp-darb` until access is restored.
- First custom provider target: NRP ELLM at `https://ellm.nrp-nautilus.io/v1`.
- NRP ELLM credential is supplied by environment variable `NRP_ELLM_API`; do not store the secret value.
- Main/stable NRP models should appear under provider label `nrp`.
- Evaluating/experimental NRP models should appear under provider label `nrp-experimental`.
- Routing preferences are active for the current no-Docker-sandbox state; revisit after host `sbx` access is restored.
- Confirmed Codex-login models via isolated smoke tests: `openai-codex/gpt-5.5`, `openai-codex/gpt-5.4`, `openai-codex/gpt-5.4-mini`, `openai-codex/gpt-5.2`.
- Added NVIDIA provider at `https://integrate.api.nvidia.com/v1`; credential is supplied by environment variable `NVIDIA_LLM_API`; do not store the secret value.
- NVIDIA models are labeled under provider `nvidia` with aliases containing `NVIDIA`.
- NVIDIA models are currently free models; expect possible rate limits and avoid treating them as guaranteed high-throughput capacity.
- Rejected/unavailable in this environment: `openai-codex/gpt-5.4-nano`, `openai-codex/gpt-5`, `openai-codex/gpt-4.1`, `openai-codex/gpt-4.1-mini`.
- Darb's signature emoji 🦗 is acceptable.
- `nrp/qwen3-small` demoted from primary due to flakiness (stalling/procedural instead of direct answers); now used as fallback after `nrp/gemma` and `nrp/gpt-oss`.

## Active Routing Plan

### Default model chain
- Primary: `nrp/gemma`
- Fallbacks: `nrp/gpt-oss` → `nrp/qwen3` → `nrp/qwen3-small` → `nvidia/z-ai/glm4.7` → `nvidia/minimaxai/minimax-m2.7` → `openai-codex/gpt-5.4-mini` → `openai-codex/gpt-5.5`

### Task-specific routing
- Utility / heartbeat / cleanup: `nrp-experimental/gemma-small` → `nrp/gemma`
- Normal chat / planning: `nrp/gemma` → `nrp/gpt-oss` → `nrp/qwen3` → `nrp/qwen3-small`
- Heavy reasoning: `nrp/qwen3` → `nrp-experimental/minimax-m2` → `nrp-experimental/glm-4.7` → `nrp-experimental/glm-5` → `nrp-experimental/kimi` → `nvidia/z-ai/glm4.7`
- Coding: `nvidia/qwen/qwen3-coder-480b-a35b-instruct` → `nrp/qwen3` → `nrp-experimental/minimax-m2` → `openai-codex/gpt-5.4-mini` → `openai-codex/gpt-5.5`
- Multimodal / screenshots: `nrp/qwen3-small` → `nrp/gemma` → `nrp/qwen3` → `nrp-experimental/gemma-small`
- Long context: `nrp/qwen3-small` or `nrp/qwen3` → `nrp/gemma` → `nrp-experimental/kimi`

### Cooperation pattern while Docker sandbox agents are unavailable
- Coordinator: main session / `nrp/gemma`
- Research workers: native `sessions_spawn` sub-agents on `nrp/gpt-oss` and `nrp/qwen3-small`
- Coding worker: native `sessions_spawn` sub-agent on `nvidia/qwen/qwen3-coder-480b-a35b-instruct` or `nrp/qwen3`
- Verifier: native `sessions_spawn` sub-agent on a different model family than the implementer
- Final synthesis: `nrp/qwen3`, with Codex only if needed
- Do not use Docker sandbox agent names (`opencode-nrp-darb`, `codex-darb`, `claude-darb`) until the host `sbx` access path is fixed

### Docker sandbox role once accessible again
- `opencode-nrp-darb`: heavy testing, bulk model scouting, long-running code/research workers, default NRP-backed detached jobs
- `codex-darb`: premium code verification, hard refactors, final review only
- `claude-darb`: writing/reasoning cross-checks and architecture critique; avoid routine use due $20/month cap

## Open Issues
- [ ] Decide whether `qwen3-embedding` belongs in the visible chat-model allowlist or should be configured separately for embeddings only.
- [x] Decide routing defaults for current no-Docker-sandbox state.
- [ ] Resolve communication/access path from this Docker container to host `sbx` sandbox.

## NRP ELLM Model Matrix

### Main / `nrp`
- `qwen3`: 397B, context 262,144, tools yes, reasoning yes, inputs text/image/video.
- `qwen3-small`: 27B, context 262,144, tools yes, reasoning yes, inputs text/image/video.
- `gpt-oss`: 120B, context 131,072, tools yes, reasoning yes, inputs text only.
- `gemma`: 31B, context 262,144, tools yes, reasoning yes, inputs text/image/video.
- `qwen3-embedding`: 8B, context unknown, tools no, reasoning no, inputs image/video.

### Evaluating / `nrp-experimental`
- `gemma-small`: ~8B, context 131,072, tools yes, reasoning yes, inputs text/image/video/audio.
- `kimi`: 1T, context 262,144, tools yes, reasoning yes, inputs text/image/video.
- `glm-4.7`: 358B, context 202,752, tools yes, reasoning yes, inputs text only.
- `glm-5`: 744B, context 202,752, tools yes, reasoning yes, inputs text only.
- `minimax-m2`: 230B, context 204,800, tools yes, reasoning yes, inputs text only.
- `olmo`: 32B, context 65,536, tools yes, reasoning no, inputs text only.

## NVIDIA Model Matrix

- `nvidia/qwen/qwen3-coder-480b-a35b-instruct`: context 200,000, max output 4,096, text input, no reasoning. Smoke test returned `smoke-ok`.
- `nvidia/z-ai/glm4.7`: context 200,000, max output 16,384, text input, reasoning enabled. Smoke test returned `smoke-ok`.
- `nvidia/minimaxai/minimax-m2.7`: context 200,000, max output 16,384, text input, no reasoning in OpenClaw metadata. Smoke test returned `smoke-ok` with higher test token cap after initial reasoning-only output.

## Links
- OpenClaw docs: /app/docs
- OpenClaw docs mirror: https://docs.openclaw.ai
