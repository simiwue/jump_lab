#!/usr/bin/env python3
"""Serves the lab, and lets its save button write to configs/.

    python3 server.py [port]

Standard library only. Everything but saving works from any static host; saving
needs this, because a page cannot write to a folder by itself.

It answers on this machine only, and only PUT /configs/<name>.json can change
anything. Other websites cannot reach it: a cross-site PUT needs a preflight this
server refuses, and the Host check stops DNS rebinding.
"""

import json
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
CONFIGS = ROOT / "configs"
MAX_BYTES = 256 * 1024
SAVE_PATH = re.compile(r"/configs/([\w ()+-][\w .()+-]*\.json)")


class Handler(SimpleHTTPRequestHandler):
    def do_PUT(self):
        match = SAVE_PATH.fullmatch(unquote(urlsplit(self.path).path))
        if not match or match[1].lower() == "index.json":
            return self.refuse(403, "not a config file name")
        host = self.headers.get("Host", "").rpartition(":")[0]
        if host not in ("localhost", "127.0.0.1"):
            return self.refuse(403, "wrong host")

        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BYTES:
            return self.refuse(413, "bad size")
        body = self.rfile.read(length)
        try:
            if not isinstance(json.loads(body), dict):
                raise ValueError
        except ValueError:
            return self.refuse(400, "not a JSON object")

        target = CONFIGS / match[1]
        created = not target.exists()
        CONFIGS.mkdir(exist_ok=True)
        # Written to the side first, so a failed write cannot damage a saved config.
        temp = target.with_suffix(".tmp")
        temp.write_bytes(body)
        temp.replace(target)

        self.send_response(201 if created else 200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def refuse(self, status, reason):
        self.send_error(status, reason)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(Handler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Jump Lab on http://localhost:{port}  (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
