"""Entry point: ``python -m usd_refgraph``."""

from __future__ import annotations

import argparse
import sys
import time
import webbrowser

from .server import serve


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="usd_refgraph",
        description="Serve the USD reference graph viewer on localhost.",
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

    try:
        serve(args.host, args.port, quiet=args.quiet)
    except OSError as exc:
        sys.stderr.write(f"Could not bind {args.host}:{args.port} - {exc}\n")
        return 1

    url = f"http://{args.host}:{args.port}/"
    print(f"usd-refgraph listening on {url}")
    if not args.no_browser:
        webbrowser.open(url)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
