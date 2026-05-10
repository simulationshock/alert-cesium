#!/usr/bin/env python3
"""
Host-side sbx relay for OpenClaw container communication.

Run on the HOST:
  python3 /home/darb/.openclaw/workspace/tools/sbx-relay-host.py

The OpenClaw container writes JSON requests into .openclaw/sbx-relay/requests/.
This relay validates them, runs a narrow allowlist of `sbx` commands on the host,
and writes JSON results into .openclaw/sbx-relay/responses/.

No secrets are printed intentionally. Avoid sending secrets in requests.
"""
from __future__ import annotations

import json
import os
import pathlib
import shlex
import subprocess
import sys
import time
import uuid
from typing import Any

WORKSPACE = pathlib.Path(__file__).resolve().parents[1]
BASE = WORKSPACE / ".openclaw" / "sbx-relay"
REQ_DIR = BASE / "requests"
RESP_DIR = BASE / "responses"
ARCHIVE_DIR = BASE / "archive"

# Host-side sbx commands this bridge may invoke. Deliberately excludes rm/reset/secret/login/logout/policy/ports/create/cp.
ALLOWED_SBX_SUBCOMMANDS = {"ls", "version", "diagnose", "help", "exec", "run"}

# Intended sandbox/agent names. Empty named_target is allowed for sbx ls/version/diagnose/help.
ALLOWED_TARGETS = {"claude-darb", "codex-darb", "opencode-nrp-darb"}

MAX_ARG_LEN = 20_000
MAX_ARGS = 128
TIMEOUT_SECONDS_DEFAULT = 120
TIMEOUT_SECONDS_MAX = 900
POLL_SECONDS = 0.5


def log(msg: str) -> None:
    print(f"[sbx-relay] {msg}", flush=True)


def safe_json_load(path: pathlib.Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("request must be a JSON object")
    return data


def validate_request(data: dict[str, Any]) -> tuple[list[str], int]:
    kind = data.get("kind")
    if kind != "sbx":
        raise ValueError("kind must be 'sbx'")

    args = data.get("args")
    if not isinstance(args, list) or not all(isinstance(x, str) for x in args):
        raise ValueError("args must be a string array, e.g. ['ls'] or ['exec','opencode-nrp-darb','--','echo','hi']")
    if not args:
        raise ValueError("args cannot be empty")
    if len(args) > MAX_ARGS:
        raise ValueError(f"too many args; max {MAX_ARGS}")
    if any(len(x) > MAX_ARG_LEN for x in args):
        raise ValueError(f"an arg exceeds max length {MAX_ARG_LEN}")

    sub = args[0]
    if sub not in ALLOWED_SBX_SUBCOMMANDS:
        raise ValueError(f"sbx subcommand not allowed: {sub}")

    # For exec/run, require one of the known target names somewhere in the early argv.
    # sbx syntax may be `sbx exec <name> ...` or use flags; this permits both while preventing
    # accidental use against unknown sandboxes.
    if sub in {"exec", "run"}:
        if not any(a in ALLOWED_TARGETS for a in args[1:6]):
            raise ValueError(f"{sub} requires an allowed target in early args: {sorted(ALLOWED_TARGETS)}")

    timeout = data.get("timeoutSeconds", TIMEOUT_SECONDS_DEFAULT)
    if not isinstance(timeout, int):
        raise ValueError("timeoutSeconds must be an integer")
    timeout = max(1, min(timeout, TIMEOUT_SECONDS_MAX))

    return ["sbx", *args], timeout


def write_response(req_id: str, response: dict[str, Any]) -> None:
    tmp = RESP_DIR / f"{req_id}.json.tmp"
    final = RESP_DIR / f"{req_id}.json"
    response.setdefault("id", req_id)
    response.setdefault("ts", time.time())
    tmp.write_text(json.dumps(response, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, final)


def handle(path: pathlib.Path) -> None:
    req_id = path.stem
    try:
        data = safe_json_load(path)
        req_id = str(data.get("id") or req_id or uuid.uuid4().hex)
        argv, timeout = validate_request(data)
        log("running: " + " ".join(shlex.quote(a) for a in argv))
        started = time.time()
        p = subprocess.run(argv, text=True, capture_output=True, timeout=timeout)
        elapsed = time.time() - started
        write_response(req_id, {
            "ok": p.returncode == 0,
            "returncode": p.returncode,
            "elapsedSeconds": round(elapsed, 3),
            "stdout": p.stdout[-200_000:],
            "stderr": p.stderr[-200_000:],
            "argv": argv,
        })
    except subprocess.TimeoutExpired as e:
        write_response(req_id, {
            "ok": False,
            "error": "timeout",
            "stdout": (e.stdout or "")[-200_000:] if isinstance(e.stdout, str) else "",
            "stderr": (e.stderr or "")[-200_000:] if isinstance(e.stderr, str) else "",
        })
    except Exception as e:
        write_response(req_id, {"ok": False, "error": str(e)})
    finally:
        try:
            ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
            os.replace(path, ARCHIVE_DIR / path.name)
        except Exception:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass


def main() -> int:
    for d in (REQ_DIR, RESP_DIR, ARCHIVE_DIR):
        d.mkdir(parents=True, exist_ok=True)
    log(f"workspace={WORKSPACE}")
    log(f"request_dir={REQ_DIR}")
    log(f"allowed_targets={', '.join(sorted(ALLOWED_TARGETS))}")
    log("ready")
    while True:
        for path in sorted(REQ_DIR.glob("*.json")):
            # Skip partially-written files if any writer did not use atomic rename.
            try:
                if time.time() - path.stat().st_mtime < 0.1:
                    continue
            except FileNotFoundError:
                continue
            handle(path)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
