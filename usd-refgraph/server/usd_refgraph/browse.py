"""Filesystem browsing for the in-app file picker.

The browser cannot hand us a real path from a file input, so the app does its
own picking against these endpoints.
"""

from __future__ import annotations

import os
import string
import sys
import time
from typing import Any

from .model import USD_EXTS

#: Directories with more entries than this are cut short.
MAX_ENTRIES = 3000

#: Never descend into these while searching for a dropped file.
SKIP_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "__pycache__",
    "node_modules",
    "$recycle.bin",
    "system volume information",
}


def start_roots() -> list[dict[str, str]]:
    """Sensible starting points for the picker."""
    roots: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(label: str, path: str) -> None:
        if not path:
            return
        norm = os.path.normpath(path)
        key = os.path.normcase(norm)
        if key in seen or not os.path.isdir(norm):
            return
        seen.add(key)
        roots.append({"label": label, "path": norm})

    home = os.path.expanduser("~")
    add("Home", home)
    add("Desktop", os.path.join(home, "Desktop"))

    if sys.platform == "win32":
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if os.path.exists(drive):
                add(f"{letter}:", drive)
    else:
        add("Root", "/")
        add("Volumes", "/Volumes")

    return roots


def list_dir(path: str) -> dict[str, Any]:
    """List one directory, directories first."""
    target = os.path.normpath(os.path.abspath(path))
    if not os.path.isdir(target):
        raise NotADirectoryError(f"Not a directory: {target}")

    dirs: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    truncated = False

    with os.scandir(target) as it:
        for entry in it:
            if len(dirs) + len(files) >= MAX_ENTRIES:
                truncated = True
                break
            try:
                is_dir = entry.is_dir()
            except OSError:
                continue

            size: int | None = None
            mtime: int | None = None
            try:
                stat = entry.stat()
                mtime = int(stat.st_mtime * 1000)
                if not is_dir:
                    size = stat.st_size
            except OSError:
                pass

            record = {
                "name": entry.name,
                "path": os.path.join(target, entry.name),
                "isDir": is_dir,
                "isUsd": (not is_dir)
                and os.path.splitext(entry.name)[1].lower() in USD_EXTS,
                "size": size,
                "mtime": mtime,
            }
            (dirs if is_dir else files).append(record)

    dirs.sort(key=lambda e: e["name"].lower())
    files.sort(key=lambda e: (not e["isUsd"], e["name"].lower()))

    parent = os.path.dirname(target)
    if parent == target:  # a drive root or `/`
        parent = None

    return {
        "path": target,
        "parent": parent,
        "crumbs": breadcrumbs(target),
        "entries": dirs + files,
        "truncated": truncated,
    }


def breadcrumbs(path: str) -> list[dict[str, str]]:
    """Absolute path segments, outermost first."""
    crumbs: list[dict[str, str]] = []
    current = os.path.normpath(path)
    while True:
        parent = os.path.dirname(current)
        label = os.path.basename(current)
        if not label:
            label = current.rstrip("\\/") or current
        crumbs.append({"label": label, "path": current})
        if parent == current:
            break
        current = parent
    crumbs.reverse()
    return crumbs


def locate(
    name: str,
    size: int | None,
    roots: list[str],
    *,
    ascend: int = 4,
    max_files: int = 40_000,
    budget_seconds: float = 2.0,
) -> dict[str, Any]:
    """Find a file by name when only its name is known.

    A browser hands over a dropped file's name and bytes but never its path, so
    to open a dropped layer we have to find it again. The search starts in the
    directories the user has already worked in and widens one parent at a time,
    stopping at the first level that yields a hit — so a file next to the
    current scene is found immediately and the search never wanders far.
    """
    started = time.perf_counter()
    wanted = name.lower()

    # Nearest directories first, then their parents, then grandparents.
    levels: list[list[str]] = []
    for level in range(ascend + 1):
        tier: list[str] = []
        for root in roots:
            current = os.path.normpath(os.path.abspath(root))
            for _ in range(level):
                parent = os.path.dirname(current)
                if parent == current:
                    current = ""
                    break
                current = parent
            if current and os.path.isdir(current):
                tier.append(current)
        levels.append(tier)

    matches: list[dict[str, Any]] = []
    visited: set[str] = set()
    scanned = 0
    truncated = False

    for tier in levels:
        for root in tier:
            stack = [root]
            while stack:
                if (
                    scanned > max_files
                    or time.perf_counter() - started > budget_seconds
                ):
                    truncated = True
                    break

                current = stack.pop()
                key = os.path.normcase(current)
                if key in visited:
                    continue
                visited.add(key)

                try:
                    with os.scandir(current) as it:
                        for entry in it:
                            scanned += 1
                            try:
                                if entry.is_dir():
                                    if entry.name.lower() not in SKIP_DIRS:
                                        stack.append(entry.path)
                                elif entry.name.lower() == wanted:
                                    stat = entry.stat()
                                    matches.append(
                                        {
                                            "path": entry.path,
                                            "name": entry.name,
                                            "dir": current,
                                            "size": stat.st_size,
                                            "mtime": int(stat.st_mtime * 1000),
                                            "sizeMatches": size is None
                                            or stat.st_size == size,
                                        }
                                    )
                            except OSError:
                                continue
                except OSError:
                    continue
            if truncated:
                break
        if matches or truncated:
            break

    # A byte-identical match is almost certainly the file that was dropped.
    matches.sort(key=lambda m: (not m["sizeMatches"], -m["mtime"]))
    return {"matches": matches, "truncated": truncated, "scanned": scanned}


def reveal(path: str) -> None:
    """Show a file in the OS file manager."""
    target = os.path.normpath(os.path.abspath(path))
    if sys.platform == "win32":
        os.system(f'explorer /select,"{target}"')
    elif sys.platform == "darwin":
        os.system(f'open -R "{target}"')
    else:
        os.system(f'xdg-open "{os.path.dirname(target)}"')
