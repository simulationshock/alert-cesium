# GitHub working context

- User said OpenClaw may provide GitHub credentials via environment variables; prefer `GH_TOKEN` when working with GitHub, with `GITHUB_USERNAME` and `GITHUB_EMAIL` for identity.
- Current non-secret identity: `GITHUB_USERNAME=simulationshock`, `GITHUB_EMAIL=simulationshock@gmail.com`.
- Do not store or print token values. Treat credentials as runtime-only secrets.
- Note: OpenClaw's exec host env sanitizer strips inherited `GH_TOKEN`/`GITHUB_TOKEN` from shell child processes, even when the Gateway process has the token. Do not bypass by scraping `/proc`; use a supported secret/tool path.
