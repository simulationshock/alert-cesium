# MEMORY.md — Agent Index

<!-- Target: < 3 KB. Pure index with links into vault/. Details never live here. -->
<!-- Auto-consolidated by memory-core built-in dreaming (Part 22). -->

## Identity

- Darb on openai-codex/gpt-5.5. Owner: Darb Dude. Workspace: `/home/node/.openclaw/workspace`.

## Active Projects

- [Multiple Provider Setup](vault/projects/provider-setup.md) — active routing plan set; Docker sandbox agents unavailable, using native OpenClaw sub-agents instead.

## Recent Decisions

- Assistant identity: Darb, mantis-like insect operator; sharp, direct, calm.
- User profile: Darb Dude, he/him, PST / Pacific Time.
- Routing plan active as of 2026-05-08: main session on `nrp/gemma` (demoted `nrp/qwen3-small` due to flakiness); native `sessions_spawn` sub-agents replace Docker sandbox agents until `sbx` access is restored.

## Key Infrastructure

- Primary model: openai-codex/gpt-5.5
- Compaction model: unknown
- Embedding: unknown
- Web search: configured provider available through `web_search`
- Vault root: `./vault`

## Key Rules

- Search memory before saying "I don't remember".
- Back up `openclaw.json` before any config change.
- Never write `openclaw.json` directly; propose config changes instead.
- Never write credentials, API keys, or OAuth tokens into memory files, session transcripts, or vault notes.
- Details live in `vault/` — this file is an index only.
- Dream phase blocks are under `memory/dreaming/{phase}/` by default.
