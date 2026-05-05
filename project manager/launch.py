import json
import os
import shutil
import subprocess
import sys
import tempfile
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 47312
ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "pipeline.json"
BACKUP_PATH = ROOT / "pipeline.json.bak"
FRONTEND_DIST = ROOT / "frontend" / "dist"


def _array_one_object_per_line(items, indent):
    if not items:
        return "[]"
    pad = " " * indent
    inner = ",\n".join(f"{pad}  {json.dumps(item, separators=(', ', ': '))}" for item in items)
    return "[\n" + inner + "\n" + pad + "]"


def format_pipeline_json(payload):
    lines = ["{"]
    lines.append('  "project": ' + json.dumps(payload["project"], indent=2).replace("\n", "\n  ") + ",")
    lines.append('  "software": ' + json.dumps(payload["software"], indent=2).replace("\n", "\n  ") + ",")
    lines.append('  "conventions": ' + json.dumps(payload["conventions"], indent=2).replace("\n", "\n  ") + ",")
    lines.append(f'  "sequences": {_array_one_object_per_line(payload["sequences"], 2)},')
    lines.append(f'  "assets": {_array_one_object_per_line(payload["assets"], 2)},')
    lines.append(f'  "sets": {_array_one_object_per_line(payload["sets"], 2)},')
    lines.append('  "library": {')
    lines.append(f'    "materials": {_array_one_object_per_line(payload["library"]["materials"], 4)}')
    lines.append("  }")
    lines.append("}")
    return "\n".join(lines) + "\n"


class PipelineServer(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None, "Invalid Content-Length"
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, "Invalid JSON body"

    def _write_pipeline_atomic(self, payload):
        if DATA_PATH.exists():
            shutil.copy2(DATA_PATH, BACKUP_PATH)

        fd, temp_path = tempfile.mkstemp(prefix="pipeline_", suffix=".json", dir=str(ROOT))
        os.close(fd)
        temp_file = Path(temp_path)
        try:
            with temp_file.open("w", encoding="utf-8", newline="\n") as handle:
                handle.write(format_pipeline_json(payload))
            os.replace(temp_file, DATA_PATH)
        finally:
            if temp_file.exists():
                temp_file.unlink(missing_ok=True)

    def _append_entry(self, data, entity_type, entry, sequence_code=None):
        if entity_type == "asset":
            data["assets"].append(entry)
        elif entity_type == "set":
            data["sets"].append(entry)
        elif entity_type == "shot":
            sequence = next((seq for seq in data["sequences"] if seq["code"] == sequence_code), None)
            if sequence is None:
                sequence = {"code": sequence_code, "name": sequence_code, "shots": []}
                data["sequences"].append(sequence)
            sequence.setdefault("shots", []).append(entry)

    def _create_asset_folders(self, name):
        base = ROOT / "assets" / name
        paths = [
            "model/hip", "model/usd",
            "rig/hip", "rig/usd",
            "lookdev/hip", "lookdev/usd", "lookdev/materials", "lookdev/textures",
            "assembly/hip", "assembly/usd",
        ]
        for rel in paths:
            (base / rel).mkdir(parents=True, exist_ok=True)

    def _create_shot_folders(self, sequence, shot):
        base = ROOT / "shots" / sequence / shot
        paths = [
            "layout/hip", "layout/usd",
            "anim/hip", "anim/usd",
            "fx/hip", "fx/usd", "fx/cache",
            "lighting/hip", "lighting/usd",
            "assembly/hip", "assembly/usd",
            "usd",
        ]
        for rel in paths:
            (base / rel).mkdir(parents=True, exist_ok=True)

    def _create_set_folders(self, name):
        short_name = name[4:] if name.startswith("set_") else name
        base = ROOT / "sets" / short_name
        paths = [
            "dressing/hip", "dressing/usd",
            "lighting/hip", "lighting/usd",
            "lookdev/hip", "lookdev/usd",
            "fx/hip", "fx/usd",
            "assembly/hip", "assembly/usd",
            "usd",
        ]
        for rel in paths:
            (base / rel).mkdir(parents=True, exist_ok=True)

    def _ensure_frontend_built(self):
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return
        raise FileNotFoundError("frontend/dist/index.html not found. Build frontend first.")

    def do_GET(self):
        if self.path == "/":
            try:
                self._ensure_frontend_built()
                index = (FRONTEND_DIST / "index.html").read_bytes()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(index)))
                self.end_headers()
                self.wfile.write(index)
            except FileNotFoundError as exc:
                self._send_json({"error": str(exc)}, status=HTTPStatus.NOT_FOUND)
            return

        if self.path == "/data":
            if not DATA_PATH.exists():
                self._send_json({"error": "pipeline.json not found", "first_run": True}, status=HTTPStatus.NOT_FOUND)
                return
            with DATA_PATH.open("r", encoding="utf-8-sig") as handle:
                self._send_json(json.load(handle))
            return

        asset = (FRONTEND_DIST / self.path.lstrip("/")).resolve()
        if FRONTEND_DIST in asset.parents and asset.exists() and asset.is_file():
            content = asset.read_bytes()
            self.send_response(HTTPStatus.OK)
            if asset.suffix == ".js":
                ctype = "application/javascript; charset=utf-8"
            elif asset.suffix == ".css":
                ctype = "text/css; charset=utf-8"
            elif asset.suffix == ".svg":
                ctype = "image/svg+xml"
            else:
                ctype = "application/octet-stream"
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        self._send_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if self.path == "/data":
            payload, error = self._read_body_json()
            if error:
                self._send_json({"error": error}, status=HTTPStatus.BAD_REQUEST)
                return
            self._write_pipeline_atomic(payload)
            self._send_json({"ok": True})
            return

        if self.path == "/create":
            payload, error = self._read_body_json()
            if error:
                self._send_json({"error": error}, status=HTTPStatus.BAD_REQUEST)
                return
            if not DATA_PATH.exists():
                self._send_json({"error": "pipeline.json not found"}, status=HTTPStatus.NOT_FOUND)
                return

            entity_type = payload.get("type")
            entry = payload.get("entry")
            if entity_type not in {"asset", "shot", "set"} or not isinstance(entry, dict):
                self._send_json({"error": "Expected body with type and entry"}, status=HTTPStatus.BAD_REQUEST)
                return

            with DATA_PATH.open("r", encoding="utf-8-sig") as handle:
                data = json.load(handle)

            if entity_type == "asset":
                self._create_asset_folders(entry["name"])
                self._append_entry(data, entity_type, entry)
            elif entity_type == "set":
                self._create_set_folders(entry["name"])
                self._append_entry(data, entity_type, entry)
            else:
                sequence_code = payload.get("sequence") or payload.get("sequence_code")
                if not sequence_code:
                    self._send_json({"error": "Shot creation requires sequence code in request body"}, status=HTTPStatus.BAD_REQUEST)
                    return
                self._create_shot_folders(sequence_code, entry["shot"])
                self._append_entry(data, entity_type, entry, sequence_code=sequence_code)

            self._write_pipeline_atomic(data)
            self._send_json({"ok": True, "data": data})
            return

        self._send_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)


def ensure_frontend_dist():
    if (FRONTEND_DIST / "index.html").exists():
        return

    frontend_dir = ROOT / "frontend"
    if not frontend_dir.exists():
        print("Frontend folder missing. Cannot build UI.")
        sys.exit(1)

    npm = "npm.cmd" if os.name == "nt" else "npm"
    print("Building frontend (frontend/dist missing)...")
    subprocess.run([npm, "install"], cwd=str(frontend_dir), check=True)
    subprocess.run([npm, "run", "build"], cwd=str(frontend_dir), check=True)


def print_banner():
    print(f"USD Pipeline Toolkit server running on http://localhost:{PORT}")
    print("Close this terminal to stop the server.")


def main():
    ensure_frontend_dist()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), PipelineServer)
    print_banner()
    webbrowser.open(f"http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
