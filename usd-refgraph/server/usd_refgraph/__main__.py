"""Entry point: ``python -m usd_refgraph``."""

from __future__ import annotations

import argparse
import os
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="usd_refgraph",
        description="Serve the USD reference graph viewer on localhost.",
    )
    parser.add_argument(
        "file",
        nargs="?",
        help="A USD file to open straight away, e.g. by dropping it on the launcher.",
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
    if args.file:
        path = os.path.abspath(args.file)
        if not os.path.exists(path):
            sys.stderr.write(f"warning: {path} does not exist\n")
        target = f"{url}?path={urllib.parse.quote(path)}"

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
    if args.file:
        print(f"opening {os.path.basename(args.file)}")
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
