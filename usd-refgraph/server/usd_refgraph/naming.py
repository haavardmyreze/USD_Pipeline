"""Classify published USD filenames against the pipeline naming convention.

From the pipeline guide, sections 15.4, 15.5 and 15.10: `_` is the only token
separator and tokens never contain `_`, so a published filename parses
unambiguously.

    <name>_<block>.usda|.usdc     a block: one sparse layer, one concern
    <name>.usda                   an assembly: pure composition, no opinions

An assembly is the file downstream work points at — shots reference asset
assemblies, and a shot root subLayers the set assembly — so being able to see
only assemblies is the view of what a scene actually depends on.

Matching is case-sensitive on purpose. The convention is lowercase, so an
upper-case filename is a naming violation, and reporting it as `other` rather
than quietly accepting it is the useful answer.
"""

from __future__ import annotations

import os
import re
from typing import Literal

#: One token: lowercase words joined by hyphens, never underscores (15.10).
TOKEN = r"[a-z0-9]+(?:-[a-z0-9]+)*"

#: `<sequence>-<shot>`, e.g. `kilo-0010` (15.3).
SHOT = r"[a-z]{3,5}-[0-9]{4}"

SHOT_ROOT_RE = re.compile(rf"^{SHOT}\.usda$")
SHOT_BLOCK_RE = re.compile(rf"^{SHOT}_{TOKEN}\.(usda|usdc)$")
ASSEMBLY_RE = re.compile(rf"^{TOKEN}\.usda$")
BLOCK_RE = re.compile(rf"^{TOKEN}_{TOKEN}\.(usda|usdc)$")

#: Sets carry their own prefix (15.2).
SET_PREFIX = "set-"

Role = Literal["assembly", "block", "other"]
Tier = Literal["asset", "set", "shot"]


def classify(path: str) -> tuple[Role, Tier | None]:
    """Return the role and tier a published filename declares.

    `other` covers anything outside the convention: textures, `.usdz`
    packages, and published layers that simply do not follow it.
    """
    name = os.path.basename(path)

    # A shot root is also a clean name, so it has to be tested first.
    if SHOT_ROOT_RE.match(name):
        return "assembly", "shot"
    if SHOT_BLOCK_RE.match(name):
        return "block", "shot"
    if ASSEMBLY_RE.match(name):
        return "assembly", "set" if name.startswith(SET_PREFIX) else "asset"
    if BLOCK_RE.match(name):
        return "block", "set" if name.startswith(SET_PREFIX) else "asset"
    return "other", None


def describe(role: Role, tier: Tier | None) -> str:
    """A short human label, e.g. `shot root` or `asset assembly`."""
    if role == "assembly":
        if tier == "shot":
            return "shot root"
        return f"{tier} assembly" if tier else "assembly"
    if role == "block":
        return f"{tier} block" if tier else "block"
    return "unconventional name"
