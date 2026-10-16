"""Replays one PFF match against the ML server over HTTP, the way the backend does.

    python -m tests.smoke_test [gameId]          (from the ml_server folder; default 10517 = 2022 final)

Uses a server already running on :8000, otherwise starts one for the test.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

URL = "http://127.0.0.1:8000"
ROOT = Path(__file__).resolve().parents[1]
GAME = sys.argv[1] if len(sys.argv) > 1 else "10517"
PFF = Path(os.environ.get("PFF_ROOT", ROOT.parent / "backend" / "data" / "pff_wc2022"))


def call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, headers={"Content-Type": "application/json"},
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def server_up():
    try:
        call("/health")
        return True
    except (urllib.error.URLError, ConnectionError, OSError):
        return False


def main():
    events = json.loads((PFF / "Event Data" / f"{GAME}.json").read_text(encoding="utf-8"))
    proc = None
    if not server_up():
        print("No server on :8000 - starting one...")
        proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                                 "--port", "8000"], cwd=ROOT)
        for _ in range(60):
            if server_up():
                break
            if proc.poll() is not None:
                sys.exit("Server failed to start - run `pip install -r requirements.txt` and check the error above.")
            time.sleep(0.25)
    try:
        pre = call("/init/football", {"gameId": GAME})["players"]
        worst, resp = 0.0, None
        for i in range(0, len(events), 5):                 # small batches, like the live backend
            t0 = time.perf_counter()
            resp = call("/predict/football", {"gameId": GAME, "events": events[i:i + 5]})
            worst = max(worst, (time.perf_counter() - t0) * 1000)
        m = resp["match"]
        print(f"events replayed: {len(events)} | worst round-trip {worst:.1f} ms | final {m['score']} shootout {m['shootout']}")
        low = sorted(resp["players"].items(), key=lambda kv: kv[1]["trustScore"])[:3]
        for pid, p in low:
            print(f"  lowest trust: player {pid} {p['position']}  pre {pre[pid]['trustScore']:.1f} -> {p['trustScore']:.1f}"
                  f"  top reasons {dict(sorted(p.get('attributions', {}).items(), key=lambda kv: kv[1])[:2])}")
        print("PASS")
    finally:
        if proc:
            proc.terminate()
            proc.wait(timeout=10)


if __name__ == "__main__":
    main()
