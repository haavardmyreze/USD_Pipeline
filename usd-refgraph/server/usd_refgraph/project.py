"""Scan a project tree and rebuild the production picture from the files.

The old tool read a hand-maintained `pipeline.json`. There is no such file any
more: publishing writes each layer's bookkeeping into the layer itself, and the
naming convention says which entity and block a file belongs to. So the project
model is derived, not stored — it cannot drift from what is actually on disk.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Any

from pxr import Sdf

from .crawl import anchor_path, collect_deps, node_id
from .model import USD_EXTS
from .naming import category_of, classify, describe, parse_shot_code, split_entity
from .pipeline import PipelineRecord, Status, read_record, rollup_status

#: The three tiers live in these folders directly inside a project folder.
TIER_DIRS = {"assets": "asset", "sets": "set", "shots": "shot"}

#: The folder under the project root holding one folder per project, like an
#: Unreal Engine content folder: `$PROJECT/content/<project>/assets/...`.
CONTENT_DIR = "content"

#: Never descend into these while scanning.
SKIP_DIRS = {".git", ".svn", "__pycache__", "node_modules", "backup", ".mothership"}

#: Stop a runaway scan.
MAX_FILES = 60_000


@dataclass
class LayerEntry:
    """One published file, with its bookkeeping and where it belongs."""

    path: str
    name: str
    ext: str
    role: str
    roleLabel: str
    tier: str | None
    entity: str
    block: str | None
    size: int | None
    mtime: int | None
    record: PipelineRecord
    #: Entity names this file pulls in, resolved through composition arcs.
    dependsOn: list[str] = field(default_factory=list)
    #: Textures this layer itself references, from its asset-valued attributes.
    textures: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "path": self.path,
            "name": self.name,
            "ext": self.ext,
            "role": self.role,
            "roleLabel": self.roleLabel,
            "tier": self.tier,
            "entity": self.entity,
            "block": self.block,
            "size": self.size,
            "mtime": self.mtime,
            "pipeline": self.record.to_dict(),
        }
        if self.dependsOn:
            out["dependsOn"] = sorted(set(self.dependsOn))
        if self.textures:
            out["textures"] = self.textures
        if self.error:
            out["error"] = self.error
        return out


@dataclass
class Entity:
    name: str
    tier: str
    dir: str
    #: The project folder under `content/` it lives in; None in a legacy tree.
    project: str | None = None
    category: str | None = None
    sequence: str | None = None
    shotNumber: int | None = None
    assembly: LayerEntry | None = None
    blocks: list[LayerEntry] = field(default_factory=list)
    textures: list[LayerEntry] = field(default_factory=list)

    def statuses(self) -> list[Status]:
        parts = [layer.record.status for layer in self.blocks]
        if self.assembly:
            parts.append(self.assembly.record.status)
        return parts

    def to_dict(self) -> dict[str, Any]:
        blocks = sorted(self.blocks, key=lambda layer: layer.block or "")
        artists = sorted(
            {
                layer.record.artist
                for layer in [*self.blocks, self.assembly]
                if layer and layer.record.artist
            }
        )
        published = [
            layer.record.exportedAt
            for layer in [*self.blocks, self.assembly]
            if layer and layer.record.exportedAt
        ]
        depends: set[str] = set()
        for layer in [*self.blocks, self.assembly]:
            if layer:
                depends.update(layer.dependsOn)
        depends.discard(self.name)

        # A texture file in the entity's folder that no layer references is an
        # orphan worth flagging; one that is referenced belongs to the layer
        # referencing it, not to the entity as a whole.
        referenced = {
            node_id(str(texture["path"]))
            for layer in [*self.blocks, self.assembly]
            if layer
            for texture in layer.textures
        }
        unused = [
            texture.to_dict()
            for texture in self.textures
            if node_id(texture.path) not in referenced
        ]

        out: dict[str, Any] = {
            "name": self.name,
            "tier": self.tier,
            "dir": self.dir,
            "project": self.project,
            "status": rollup_status(self.statuses()),
            "assembly": self.assembly.to_dict() if self.assembly else None,
            "blocks": [layer.to_dict() for layer in blocks],
            "textures": [layer.to_dict() for layer in self.textures],
            "unusedTextures": unused,
            "artists": artists,
            "dependsOn": sorted(depends),
            "lastPublished": max(published) if published else None,
        }
        if self.category:
            out["category"] = self.category
        if self.sequence:
            out["sequence"] = self.sequence
        if self.shotNumber is not None:
            out["shotNumber"] = self.shotNumber
        return out


# ---------------------------------------------------------------------------
# Finding the project root
# ---------------------------------------------------------------------------


def _subdirs(path: str) -> dict[str, str]:
    """Lower-cased name to real name of each folder directly in `path`."""
    try:
        return {entry.name.lower(): entry.name for entry in os.scandir(path) if entry.is_dir()}
    except OSError:
        return {}


def is_project_folder(path: str) -> bool:
    """A project folder holds `assets`, `sets` and/or `shots`."""
    return bool(set(_subdirs(path)) & set(TIER_DIRS))


def project_folders(root: str) -> list[tuple[str | None, str]]:
    """The project folders under a root, as (name, path), sorted by name.

    The tree is `$PROJECT/content/<project>/assets|sets|shots`: one folder per
    project, including work migrated from other projects and the shared
    `library/`. A root that holds the tier folders itself is the older layout
    and counts as a single, unnamed project folder.
    """
    content = _subdirs(root).get(CONTENT_DIR)
    if content:
        base = os.path.join(root, content)
        return [
            (name, os.path.join(base, name))
            for name in sorted(_subdirs(base).values(), key=str.lower)
            if name.lower() not in SKIP_DIRS and is_project_folder(os.path.join(base, name))
        ]
    if is_project_folder(root):
        return [(None, root)]
    return []


def looks_like_root(path: str) -> bool:
    """A project root holds `content/` with project folders in it.

    A folder holding the tiers directly is a root too (the older layout), but
    not when it is itself a project folder inside `content/`: its root is two
    levels up.
    """
    path = os.path.normpath(os.path.abspath(path))
    if CONTENT_DIR in _subdirs(path):
        return bool(project_folders(path))
    in_content = os.path.basename(os.path.dirname(path)).lower() == CONTENT_DIR
    return is_project_folder(path) and not in_content


def find_root(start: str, levels: int = 10) -> str | None:
    """Walk up from a file or folder looking for the project root."""
    current = os.path.normpath(os.path.abspath(start))
    if os.path.isfile(current):
        current = os.path.dirname(current)

    for _ in range(levels):
        if looks_like_root(current):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return None


# ---------------------------------------------------------------------------
# Scanning
# ---------------------------------------------------------------------------


class ProjectScanner:
    def __init__(self, root: str, *, read_dependencies: bool = True) -> None:
        self.root = os.path.normpath(os.path.abspath(root))
        self.read_dependencies = read_dependencies
        self.entities: dict[str, Entity] = {}
        self.warnings: list[str] = []
        self.folders: list[tuple[str | None, str]] = []
        #: file id -> owning entity, so arcs can be mapped back to entities.
        self._owner: dict[str, str] = {}
        self._layers: list[LayerEntry] = []

    def run(self) -> dict[str, Any]:
        started = time.perf_counter()

        self.folders = project_folders(self.root)
        for project, folder in self.folders:
            tiers = _subdirs(folder)
            for tier_dir, tier in TIER_DIRS.items():
                if tier_dir in tiers:
                    self._scan_tier(os.path.join(folder, tiers[tier_dir]), tier, project)

        if self.read_dependencies:
            self._resolve_dependencies()

        entities = sorted(
            self.entities.values(),
            key=lambda e: (e.tier, e.sequence or "", e.shotNumber or 0, e.name),
        )
        elapsed = (time.perf_counter() - started) * 1000
        return self._assemble(entities, elapsed)

    # -- walking ----------------------------------------------------------

    def _scan_tier(self, base: str, tier: str, project: str | None) -> None:
        seen = 0
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d.lower() not in SKIP_DIRS]
            for filename in sorted(filenames):
                seen += 1
                if seen > MAX_FILES:
                    self.warnings.append("Scan stopped early: too many files.")
                    return
                self._consider(os.path.join(dirpath, filename), tier, project)

    def _consider(self, path: str, tier: str, project: str | None) -> None:
        name = os.path.basename(path)
        ext = os.path.splitext(name)[1].lower()
        role, name_tier = classify(name)

        if role == "other":
            return  # not something the convention describes
        if ext not in USD_EXTS and role != "texture":
            return

        entity_name, block = split_entity(name)
        entity = self._entity(entity_name, name_tier or tier, os.path.dirname(path), project)
        if entity.project != project:
            # Names are not yet unique across project folders (see the Project
            # tree spec); a second one would be merged into the first silently.
            clash = f"{entity_name} exists in both {entity.project} and {project}; showing {entity.project}."
            if clash not in self.warnings:
                self.warnings.append(clash)
            return

        try:
            stat = os.stat(path)
            size: int | None = stat.st_size
            mtime: int | None = int(stat.st_mtime * 1000)
        except OSError:
            size = mtime = None

        layer = LayerEntry(
            path=path,
            name=name,
            ext=ext.lstrip("."),
            role=role,
            roleLabel=describe(role, name_tier),
            tier=name_tier or tier,
            entity=entity_name,
            block=block,
            size=size,
            mtime=mtime,
            record=PipelineRecord(),
        )

        if role == "texture":
            entity.textures.append(layer)
            return

        self._read_layer(layer)
        self._owner[node_id(path)] = entity_name
        self._layers.append(layer)

        if role == "assembly":
            entity.assembly = layer
        else:
            entity.blocks.append(layer)

    def _entity(self, name: str, tier: str, directory: str, project: str | None) -> Entity:
        existing = self.entities.get(name)
        if existing:
            return existing

        entity = Entity(name=name, tier=tier, dir=directory, project=project)
        entity.category = category_of(name)
        shot = parse_shot_code(name)
        if shot:
            entity.sequence, entity.shotNumber = shot
        self.entities[name] = entity
        return entity

    # -- reading ----------------------------------------------------------

    def _read_layer(self, layer: LayerEntry) -> None:
        try:
            sdf_layer = Sdf.Layer.FindOrOpen(layer.path)
        except Exception as exc:
            layer.error = str(exc).strip().splitlines()[0] if str(exc) else "Failed to open."
            return
        if sdf_layer is None:
            layer.error = "USD could not open this file."
            return

        try:
            layer.record = read_record(dict(sdf_layer.customLayerData or {}))
        except Exception:
            layer.record = PipelineRecord()

        if not self.read_dependencies:
            return

        # Which files this layer pulls in. Mapping them to entities is done in
        # a second pass, once every file's owner is known.
        try:
            getter = getattr(sdf_layer, "GetCompositionAssetDependencies", None) or getattr(
                sdf_layer, "GetExternalReferences", None
            )
            if getter is not None:
                layer.dependsOn = [
                    node_id(anchor_path(sdf_layer, str(raw))) for raw in getter() if raw
                ]
        except Exception:
            layer.dependsOn = []

        layer.textures = self._read_textures(sdf_layer)

    def _read_textures(self, sdf_layer: Sdf.Layer) -> list[dict[str, Any]]:
        """Textures a layer references through its asset-valued attributes.

        Composition dependencies do not cover these, and a texture living in an
        entity's folder says nothing about which of that entity's layers uses
        it — only the asset arcs do. Lookdev references the textures; the model
        beside it usually references none.
        """
        try:
            deps = [d for d in collect_deps(sdf_layer, True) if d.kind == "asset"]
        except Exception:
            return []

        seen: dict[str, dict[str, Any]] = {}
        for dep in deps:
            resolved = anchor_path(sdf_layer, dep.raw_path)
            key = node_id(resolved)
            if key in seen:
                continue
            seen[key] = {
                "path": resolved,
                "name": os.path.basename(resolved),
                "rawPath": dep.raw_path,
                # A `<UDIM>` or `#` path stands for a family of files, so a
                # single path not existing is expected.
                "template": dep.template,
                "exists": bool(dep.template) or os.path.exists(resolved),
                "attribute": dep.attribute,
            }
        return sorted(seen.values(), key=lambda t: str(t["name"]))

    def _resolve_dependencies(self) -> None:
        """Turn file-level arcs into entity-level ones."""
        for layer in self._layers:
            owners = []
            for target in layer.dependsOn:
                owner = self._owner.get(target)
                if owner and owner != layer.entity:
                    owners.append(owner)
            layer.dependsOn = sorted(set(owners))

    # -- output -----------------------------------------------------------

    def _assemble(self, entities: list[Entity], elapsed: float) -> dict[str, Any]:
        artists: set[str] = set()
        block_names: set[str] = set()
        by_status: dict[str, int] = {}
        publishes = 0

        for entity in entities:
            for layer in [*entity.blocks, entity.assembly]:
                if not layer:
                    continue
                if layer.record.artist:
                    artists.add(layer.record.artist)
                if layer.block:
                    block_names.add(layer.block)
                by_status[layer.record.status] = by_status.get(layer.record.status, 0) + 1
                if layer.record.exportedAt:
                    publishes += 1

        sequences: dict[str, list[str]] = {}
        for entity in entities:
            if entity.tier == "shot" and entity.sequence:
                sequences.setdefault(entity.sequence, []).append(entity.name)

        tiers = {tier: 0 for tier in TIER_DIRS.values()}
        for entity in entities:
            tiers[entity.tier] = tiers.get(entity.tier, 0) + 1

        return {
            "root": self.root,
            "name": os.path.basename(self.root) or self.root,
            "projectFolders": [name for name, _ in self.folders if name],
            "entities": [entity.to_dict() for entity in entities],
            "artists": sorted(artists),
            "blockNames": sorted(block_names),
            "sequences": [
                {"name": name, "shots": sorted(shots)}
                for name, shots in sorted(sequences.items())
            ],
            "stats": {
                "assets": tiers.get("asset", 0),
                "sets": tiers.get("set", 0),
                "shots": tiers.get("shot", 0),
                "artists": len(artists),
                "layers": sum(
                    len(e.blocks) + (1 if e.assembly else 0) for e in entities
                ),
                "textures": sum(len(e.textures) for e in entities),
                "publishes": publishes,
                "byStatus": by_status,
                "elapsedMs": round(elapsed, 1),
            },
            "warnings": self.warnings,
            "scannedAt": int(time.time() * 1000),
        }
