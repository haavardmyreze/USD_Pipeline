"""Entry point: ``python -m usd_refgraph``."""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
import urllib.parse
import webbrowser

from .server import serve


def already_running(host: str, port: int) -> bool:
    """True when a usd-refgraph server is answering on this address."""
    import json
    import urllib.request

    try:
        with urllib.request.urlopen(
            f"http://{host}:{port}/api/caps", timeout=1.5
        ) as response:
            return "usdVersion" in json.load(response)
    except Exception:
        return False


#: A bare drive letter, which needs a separator before it means the drive root.
DRIVE_RE = re.compile(r"^[A-Za-z]:$")


def normalise_path(raw: str) -> str:
    """Clean up a path handed over by Explorer's right-click menu.

    A registry command is written as ``"%1"``, and a folder that already ends
    in a separator — a drive root does — turns that into ``"C:\\"``, where the
    backslash escapes the closing quote and the argument arrives as ``C:"``. So
    strip any stray quote, then put back the separator a bare drive letter
    needs before it means the root rather than the current directory there.
    """
    cleaned = raw.strip().strip('"')
    if DRIVE_RE.match(cleaned):
        cleaned += os.sep
    return os.path.abspath(cleaned)


def deep_link(url: str, path: str) -> str:
    """The URL that opens `path`: a folder is a project, a file is one layer.

    Those are different questions, so they travel as different parameters
    rather than as one the viewer has to guess about — a folder opens the
    project pages, a file opens its graph.
    """
    key = "project" if os.path.isdir(path) else "path"
    return f"{url}?{key}={urllib.parse.quote(path)}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="usd_refgraph",
        description="Serve the USD reference graph viewer on localhost.",
    )
    parser.add_argument(
        "target",
        nargs="?",
        metavar="PATH",
        # Printed to a Windows console, so it stays ASCII: an em dash comes
        # out as a replacement character under the default code page.
        help=(
            "A project folder, or a single USD file, to open straight away - "
            "from the right-click menu, or dropped on the launcher."
        ),
    )
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--no-browser", action="store_true", help="Do not open a browser window."
    )
    parser.add_argument("--quiet", action="store_true", help="Suppress request logs.")
    args = parser.parse_args(argv)

    try:
        from pxr import Usd  # noqa: F401
    except ImportError:
        sys.stderr.write(
            "OpenUSD's Python bindings are missing.\n"
            "Install them with:  pip install usd-core\n"
        )
        return 1

    url = f"http://{args.host}:{args.port}/"

    target = url
    opening = None
    if args.target:
        path = normalise_path(args.target)
        if not os.path.exists(path):
            sys.stderr.write(f"warning: {path} does not exist\n")
        target = deep_link(url, path)
        opening = os.path.basename(path.rstrip("\\/")) or path

    try:
        serve(args.host, args.port, quiet=args.quiet)
    except OSError as exc:
        # The port is taken. If it is taken by us — likely, when a file was
        # just opened from the right-click menu — hand the file to the window
        # that is already open instead of failing.
        if already_running(args.host, args.port):
            print(f"usd-refgraph is already running on {url}")
            if not args.no_browser:
                webbrowser.open(target)
            return 0
        sys.stderr.write(f"Could not bind {args.host}:{args.port} - {exc}\n")
        return 1

    print(f"usd-refgraph listening on {url}")
    if opening:
        print(f"opening {opening}")
    if not args.no_browser:
        webbrowser.open(target)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
