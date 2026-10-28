#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
from pathlib import Path

DESTINATION = Path("/var/lib/docker/liveorder-restore-inbox/restore.sqlite")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024


class RestoreReceiver(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/upload":
            self.send_error(404)
            return

        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.send_error(411)
            return
        if content_length < 1 or content_length > MAX_UPLOAD_BYTES:
            self.send_error(413)
            return

        DESTINATION.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            with DESTINATION.open("xb") as target:
                remaining = content_length
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ConnectionError("Upload ended before the declared content length")
                    target.write(chunk)
                    remaining -= len(chunk)
                target.flush()
                os.fsync(target.fileno())
            DESTINATION.chmod(0o600)
        except FileExistsError:
            self.send_error(409, "A restore upload is already staged")
            return
        except OSError:
            DESTINATION.unlink(missing_ok=True)
            self.send_error(400, "Restore upload failed")
            return

        self.send_response(201)
        self.end_headers()
        self.wfile.write(b"Restore backup staged.\n")

    def log_message(self, _format, *_args):
        return


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 18080), RestoreReceiver).serve_forever()
