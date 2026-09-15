"""A text layer's source, for reading the file itself beside the graph.

The text is returned byte for byte as it sits on disk, comments and
formatting included — the file an artist would open in an editor. Binary
crate and package layers have no text and are not shown.
"""

from __future__ import annotations

import os
from typing import Any

#: Text returned before the rest of a file is left out. Far past any layer
#: written by hand; only a baked layer saved as text gets near it.
MAX_CHARS = 4_000_000

#: Extensions that can hold a text layer. `.usd` can be either, so its bytes
#: decide; `.usdc` and `.usdz` are always binary.
TEXT_EXTS = {".usda", ".usd"}

#: The first bytes of a crate and a zip package, whatever the extension says.
BINARY_MAGIC = (b"PXR-USDC", b"PK\x03\x04")


class SourceError(Exception):
    def __init__(self, status: int, message: str, detail: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.detail = detail


def read(path: str, max_chars: int = MAX_CHARS) -> dict[str, Any]:
    if os.path.splitext(path)[1].lower() not in TEXT_EXTS:
        raise SourceError(415, "Not a text layer", path)
    if not os.path.isfile(path):
        raise SourceError(404, "No such file", path)

    with open(path, "rb") as fh:
        raw = fh.read()
    if raw.startswith(BINARY_MAGIC):
        raise SourceError(415, "Binary layer", "This .usd file is a binary crate, so it has no text to show.")

    text = raw.decode("utf-8", errors="replace")
    total_lines = text.count("\n") + (0 if text.endswith("\n") else 1)
    truncated = len(text) > max_chars
    if truncated:
        # Cut on a line boundary, so the last line shown is a whole one.
        cut = text.rfind("\n", 0, max_chars)
        text = text[: cut if cut > 0 else max_chars]

    return {
        "path": path,
        "text": text,
        "truncated": truncated,
        "totalLines": total_lines,
        "size": len(raw),
        "mtime": int(os.path.getmtime(path) * 1000),
    }
