"""A small localhost HTTP server: JSON API plus the built viewer.

Deliberately stdlib-only, so the whole backend installs with a single
``pip install usd-core``.
"""

from __future__ import annotations

import json
import mimetypes
import os
import posixpath
import re
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from . import browse
from .crawl import DEFAULT_MAX_NODES, Crawler

#: Only browsers pointed at our own dev server may call the API.
LOCAL_ORIGIN = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")

#: Where `vite build` puts the viewer.
DIST_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "dist")
)


def _usd_version() -> str | None:
    try:
        from pxr import Usd

        # `GetVersion()` returns a (major, minor, patch) tuple.
        return ".".join(str(part) for part in Usd.GetVersion())
    except Exception:
        return None


class Handler(BaseHTTPRequestHandler):
    server_version = "usd-refgraph"
    protocol_version = "HTTP/1.1"

    # -- plumbing -----------------------------------------------------------

    def log_message(self, fmt: str, *args: object) -> None:
        if self.server.quiet:  # type: ignore[attr-defined]
            return
        sys.stderr.write(f"  {self.address_string()} {fmt % args}\n")

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin and LOCAL_ORIGIN.match(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status: int, message: str, detail: str = "") -> None:
        payload = {"error": message}
        if detail:
            payload["detail"] = detail
        self._send_json(payload, status)

    def do_OPTIONS(self) -> None:  # noqa: N802 - stdlib naming
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    # -- routing ------------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)

        try:
            if route.startswith("/api/"):
                self._api(route, query)
            else:
                self._static(route)
        except BrokenPipeError:
            pass
        except Exception as exc:
            traceback.print_exc()
            self._send_error_json(500, "Server error", str(exc))

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            self._send_error_json(400, "Malformed JSON body")
            return

        try:
            if parsed.path == "/api/reveal":
                path = str(body.get("path") or "")
                if not path or not os.path.exists(path):
                    self._send_error_json(404, "No such file", path)
                    return
                browse.reveal(path)
                self._send_json({"ok": True})
            else:
                self._send_error_json(404, "Unknown endpoint", parsed.path)
        except Exception as exc:
            traceback.print_exc()
            self._send_error_json(500, "Server error", str(exc))

    def _api(self, route: str, query: dict[str, list[str]]) -> None:
        def first(key: str, default: str = "") -> str:
            values = query.get(key)
            return values[0] if values else default

        if route == "/api/caps":
            self._send_json(
                {
                    "usdVersion": _usd_version(),
                    "pythonVersion": sys.version.split()[0],
                    "platform": sys.platform,
                    "roots": browse.start_roots(),
                }
            )
            return

        if route == "/api/browse":
            path = first("path") or os.path.expanduser("~")
            try:
                self._send_json(browse.list_dir(path))
            except (NotADirectoryError, FileNotFoundError) as exc:
                self._send_error_json(404, "Cannot list directory", str(exc))
            except PermissionError:
                self._send_error_json(403, "Permission denied", path)
            return

        if route == "/api/locate":
            name = os.path.basename(first("name"))
            if not name:
                self._send_error_json(400, "Missing `name` parameter")
                return
            size_text = first("size")
            size = int(size_text) if size_text.isdigit() else None
            roots = [r for r in query.get("root", []) if r and os.path.isdir(r)]
            if not roots:
                roots = [os.path.expanduser("~")]
            self._send_json(browse.locate(name, size, roots))
            return

        if route == "/api/graph":
            path = first("path")
            if not path:
                self._send_error_json(400, "Missing `path` parameter")
                return
            if not os.path.exists(path):
                self._send_error_json(404, "No such file", path)
                return

            include_assets = first("assets", "1") not in ("0", "false")
            depth_text = first("maxDepth")
            max_depth = int(depth_text) if depth_text.isdigit() else None
            limit_text = first("maxNodes")
            max_nodes = int(limit_text) if limit_text.isdigit() else DEFAULT_MAX_NODES

            crawler = Crawler(
                path,
                include_assets=include_assets,
                max_depth=max_depth,
                max_nodes=max_nodes,
            )
            self._send_json(crawler.run().to_dict())
            return

        self._send_error_json(404, "Unknown endpoint", route)

    # -- static files -------------------------------------------------------

    def _static(self, route: str) -> None:
        if not os.path.isdir(DIST_DIR):
            self._send_dev_hint()
            return

        rel = unquote(route.lstrip("/")) or "index.html"
        safe = posixpath.normpath(rel).lstrip("./")
        target = os.path.normpath(os.path.join(DIST_DIR, safe))
        if not target.startswith(DIST_DIR):
            self._send_error_json(403, "Forbidden")
            return

        if not os.path.isfile(target):
            target = os.path.join(DIST_DIR, "index.html")  # SPA fallback
            if not os.path.isfile(target):
                self._send_error_json(404, "Not found", route)
                return

        with open(target, "rb") as fh:
            body = fh.read()
        ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if "/assets/" in route:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _send_dev_hint(self) -> None:
        body = (
            "<!doctype html><meta charset=utf-8>"
            "<title>usd-refgraph</title>"
            "<style>body{background:#0b0d12;color:#e6e9ef;font:15px/1.6 system-ui,"
            "sans-serif;display:grid;place-items:center;height:100vh;margin:0}"
            "code{background:#171b24;padding:2px 7px;border-radius:5px;"
            "color:#7dd3fc}div{max-width:34rem}</style>"
            "<div><h1>API is running</h1><p>The viewer has not been built yet. "
            "Run <code>npm run dev</code> and open the address it prints, or "
            "build it once with <code>npm run build</code> and reload this "
            "page.</p></div>"
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    # On Windows SO_REUSEADDR lets a second process bind a port that is already
    # in use, so a stale backend and a fresh one both "succeed" and requests get
    # split between them. Everywhere else it just avoids TIME_WAIT churn.
    allow_reuse_address = sys.platform != "win32"

    def __init__(self, address: tuple[str, int], quiet: bool = False) -> None:
        super().__init__(address, Handler)
        self.quiet = quiet


def serve(host: str = "127.0.0.1", port: int = 8765, quiet: bool = False) -> Server:
    server = Server((host, port), quiet=quiet)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server
