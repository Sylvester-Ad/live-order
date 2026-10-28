import importlib.util
import stat
import tempfile
import threading
import unittest
from http.server import HTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "liveorder-restore-receiver.py"
SPEC = importlib.util.spec_from_file_location("liveorder_restore_receiver", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
receiver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(receiver)


class RestoreReceiverTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        receiver.DESTINATION = Path(self.temporary_directory.name) / "restore.sqlite"
        receiver.MAX_UPLOAD_BYTES = 16
        self.server = HTTPServer(("127.0.0.1", 0), receiver.RestoreReceiver)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.temporary_directory.cleanup()

    def request(self, path, body=b""):
        request = Request(f"{self.url}{path}", data=body, method="POST")
        try:
            with urlopen(request, timeout=2) as response:
                return response.status
        except HTTPError as error:
            return error.code

    def test_stages_one_upload_with_restricted_permissions(self):
        self.assertEqual(self.request("/upload", b"sqlite backup"), 201)
        self.assertEqual(receiver.DESTINATION.read_bytes(), b"sqlite backup")
        self.assertEqual(stat.S_IMODE(receiver.DESTINATION.stat().st_mode), 0o600)
        self.assertEqual(self.request("/upload", b"second"), 409)

    def test_rejects_wrong_path_and_over_limit_upload(self):
        self.assertEqual(self.request("/other", b"data"), 404)
        self.assertEqual(self.request("/upload", b"x" * 17), 413)
        self.assertFalse(receiver.DESTINATION.exists())


if __name__ == "__main__":
    unittest.main()
