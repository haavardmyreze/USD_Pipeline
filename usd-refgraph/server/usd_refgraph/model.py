"""Graph data model.

These dataclasses mirror ``src/shared/types.ts``. They serialise to camelCase
JSON, which is what the viewer consumes; keep the two files in step.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Literal

ArcKind = Literal["sublayer", "reference", "payload", "clip", "asset", "unknown"]
ListOp = Literal["explicit", "prepend", "append", "add", "delete", "reorder"]
NodeKind = Literal["layer", "asset"]
LayerFormat = Literal["usda", "usdc", "usdz", "usd", "other"]

#: Extensions we will try to open as USD layers and crawl into.
USD_EXTS = {".usd", ".usda", ".usdc", ".usdz"}

#: Extensions that are USD but not human-readable text.
BINARY_EXTS = {".usdc", ".usdz"}


def layer_format(path: str) -> LayerFormat:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".usda", ".usdc", ".usdz", ".usd"):
        return ext[1:]  # type: ignore[return-value]
    return "other"


def is_usd_path(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in USD_EXTS


@dataclass
class VariantScope:
    set: str
    variant: str

    def to_dict(self) -> dict[str, Any]:
        return {"set": self.set, "variant": self.variant}


@dataclass
class LayerMeta:
    defaultPrim: str | None = None
    upAxis: str | None = None
    metersPerUnit: float | None = None
    startTimeCode: float | None = None
    endTimeCode: float | None = None
    framesPerSecond: float | None = None
    documentation: str | None = None
    customLayerData: dict[str, str] = field(default_factory=dict)
    primCount: int | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, value in self.__dict__.items():
            if value is None:
                continue
            if key == "customLayerData" and not value:
                continue
            out[key] = value
        return out


@dataclass
class GraphNode:
    id: str
    path: str
    name: str
    dir: str
    relDir: str
    ext: str
    kind: NodeKind
    format: LayerFormat
    exists: bool
    size: int | None
    mtime: int | None
    binary: bool
    scanned: bool = False
    depth: int = 0
    meta: LayerMeta | None = None
    error: str | None = None
    packagePath: str | None = None
    #: True for placeholder paths (`#` frame numbers, `<UDIM>` tiles) that
    #: stand for a family of files rather than one file on disk.
    template: bool = False
    #: What the filename declares under the pipeline naming convention.
    role: Literal["assembly", "block", "other"] = "other"
    tier: Literal["asset", "set", "shot"] | None = None
    #: Human label for `role`/`tier`, e.g. "shot root".
    roleLabel: str = ""

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "path": self.path,
            "name": self.name,
            "dir": self.dir,
            "relDir": self.relDir,
            "ext": self.ext,
            "kind": self.kind,
            "format": self.format,
            "exists": self.exists,
            "size": self.size,
            "mtime": self.mtime,
            "binary": self.binary,
            "scanned": self.scanned,
            "depth": self.depth,
            "meta": self.meta.to_dict() if self.meta else None,
            "error": self.error,
            "role": self.role,
            "tier": self.tier,
            "roleLabel": self.roleLabel,
        }
        if self.packagePath:
            out["packagePath"] = self.packagePath
        if self.template:
            out["template"] = True
        return out


@dataclass
class GraphEdge:
    id: str
    source: str
    target: str
    kind: ArcKind
    rawPath: str
    primPath: str | None = None
    targetPrim: str | None = None
    variants: list[VariantScope] = field(default_factory=list)
    listOp: ListOp | None = None
    attribute: str | None = None
    template: bool = False

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "from": self.source,
            "to": self.target,
            "kind": self.kind,
            "rawPath": self.rawPath,
        }
        if self.primPath:
            out["primPath"] = self.primPath
        if self.targetPrim:
            out["targetPrim"] = self.targetPrim
        if self.variants:
            out["variants"] = [v.to_dict() for v in self.variants]
        if self.listOp:
            out["listOp"] = self.listOp
        if self.attribute:
            out["attribute"] = self.attribute
        if self.template:
            out["template"] = True
        return out


@dataclass
class GraphWarning:
    message: str
    severity: Literal["info", "warning", "error"] = "warning"
    nodeId: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"message": self.message, "severity": self.severity}
        if self.nodeId:
            out["nodeId"] = self.nodeId
        return out


@dataclass
class Graph:
    rootId: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    warnings: list[GraphWarning]
    cycles: list[list[str]]
    elapsedMs: float
    scannedAt: int

    def to_dict(self) -> dict[str, Any]:
        by_arc: dict[str, int] = {
            "sublayer": 0,
            "reference": 0,
            "payload": 0,
            "clip": 0,
            "asset": 0,
            "unknown": 0,
        }
        for edge in self.edges:
            by_arc[edge.kind] = by_arc.get(edge.kind, 0) + 1

        layers = sum(1 for n in self.nodes if n.kind == "layer")
        assets = sum(1 for n in self.nodes if n.kind == "asset")
        # Placeholder paths stand for a family of files, so a single path not
        # resolving is expected and is not counted as a broken dependency.
        missing = sum(1 for n in self.nodes if not n.exists and not n.template)
        total_bytes = sum(n.size or 0 for n in self.nodes)
        max_depth = max((n.depth for n in self.nodes), default=0)

        return {
            "rootId": self.rootId,
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "stats": {
                "layers": layers,
                "assets": assets,
                "missing": missing,
                "edges": len(self.edges),
                "maxDepth": max_depth,
                "totalBytes": total_bytes,
                "elapsedMs": round(self.elapsedMs, 1),
                "byArc": by_arc,
            },
            "warnings": [w.to_dict() for w in self.warnings],
            "cycles": self.cycles,
            "scannedAt": self.scannedAt,
        }
