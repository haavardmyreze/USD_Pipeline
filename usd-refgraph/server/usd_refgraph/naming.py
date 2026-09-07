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

# Textures (15.9): <asset-or-set>[_<descriptor>]_<channel>_<resolution>[.<udim>].<ext>
# The channel token is a closed enum and acts as the parse anchor, which is what
# makes the optional descriptor unambiguous.
CHANNEL = r"(?:bc|n|aormt|m)"
RESOLUTION = r"(?:1k|2k|4k|8k)"
TEXTURE_EXT = r"(?:exr|png|tif)"
#: A UDIM tile is four digits on disk, but a USD asset path holds the `<UDIM>`
#: placeholder, and both should read as a texture.
UDIM = r"(?:[0-9]{4}|<UDIM>)"

TEXTURE_RE = re.compile(
    rf"^{TOKEN}(?:_{TOKEN})?_{CHANNEL}_{RESOLUTION}\.{TEXTURE_EXT}$"
)
TEXTURE_UDIM_RE = re.compile(
    rf"^{TOKEN}(?:_{TOKEN})?_{CHANNEL}_{RESOLUTION}\.{UDIM}\.{TEXTURE_EXT}$"
)

Role = Literal["assembly", "block", "texture", "other"]
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
    if TEXTURE_RE.match(name) or TEXTURE_UDIM_RE.match(name):
        return "texture", "set" if name.startswith(SET_PREFIX) else "asset"
    return "other", None


#: Asset category prefixes (15.2). `set-` is handled as its own tier.
CATEGORY_PREFIXES = {
    "char": "character",
    "prop": "prop",
    "env": "environment",
    "veh": "vehicle",
    "fx": "fx",
    "set": "set",
}

SHOT_CODE_RE = re.compile(r"^([a-z]{3,5})-([0-9]{4})$")


def split_entity(path: str) -> tuple[str, str | None]:
    """Split a published filename into the entity it belongs to and its block.

    `_` is the only token separator, so the first token names the entity and
    the second, when there is one, names the block:

        char-bob.usda          -> ("char-bob", None)      the assembly
        char-bob_lookdev.usda  -> ("char-bob", "lookdev") a block
        char-bob_m_1k.exr      -> ("char-bob", None)      a texture

    Textures report no block: their trailing tokens are a descriptor, channel
    and resolution (15.9), not a block name.
    """
    name = os.path.basename(path)
    stem = name.split(".", 1)[0]
    role, _ = classify(name)

    if role == "texture" or "_" not in stem:
        return stem.split("_", 1)[0], None

    entity, block = stem.split("_", 1)
    return entity, block


def category_of(entity: str) -> str | None:
    """The category an asset name declares through its prefix (15.2)."""
    prefix = entity.split("-", 1)[0]
    return CATEGORY_PREFIXES.get(prefix)


def parse_shot_code(entity: str) -> tuple[str, int] | None:
    """Split `kilo-0010` into its sequence and shot number (15.3)."""
    match = SHOT_CODE_RE.match(entity)
    if not match:
        return None
    return match.group(1), int(match.group(2))


def describe(role: Role, tier: Tier | None) -> str:
    """A short human label, e.g. `shot root` or `asset assembly`."""
    if role == "assembly":
        if tier == "shot":
            return "shot root"
        return f"{tier} assembly" if tier else "assembly"
    if role == "block":
        return f"{tier} block" if tier else "block"
    if role == "texture":
        return "texture"
    return "unconventional name"
