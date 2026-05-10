#!/usr/bin/env python3
"""Submit one request to the host-side sbx relay and print the JSON response.

Examples from inside OpenClaw container:
  python3 tools/sbx-relay-request.py ls
  python3 tools/sbx-relay-request.py version
  python3 tools/sbx-relay-request.py diagnose
  python3 tools/sbx-relay-request.py exec opencode-nrp-darb -- echo hello
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import time
import uuid

WORKSPACE = pathlib.Path(__file__).resolve().parents[1]
BASE = WORKSPACE / ".openclaw" / "sbx-relay"
REQ_DIR = BASE / "requests"
RESP_DIR = BASE / "responses"


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    for d in (REQ_DIR, RESP_DIR):
        d.mkdir(parents=True, exist_ok=True)
    req_id = uuid.uuid4().hex
    req = {
        "id": req_id,
        "kind": "sbx",
        "args": argv,
        "timeoutSeconds": int(os.environ.get("SBX_RELAY_TIMEOUT", "120")),
    }
    tmp = REQ_DIR / f"{req_id}.json.tmp"
    final = REQ_DIR / f"{req_id}.json"
    tmp.write_text(json.dumps(req, indent=2), encoding="utf-8")
    os.replace(tmp, final)

    resp = RESP_DIR / f"{req_id}.json"
    deadline = time.time() + int(os.environ.get("SBX_RELAY_WAIT", "150"))
    while time.time() < deadline:
        if resp.exists():
            print(resp.read_text(encoding="utf-8"))
            return 0
        time.sleep(0.25)
    print(json.dumps({"ok": False, "error": "relay response timeout", "id": req_id}, indent=2))
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
