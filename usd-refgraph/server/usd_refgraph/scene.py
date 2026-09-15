"""The composed prim hierarchy of one layer, read a level at a time.

The crawl deliberately stays on ``Sdf`` specs to see arcs as authored. This is
the other half of the picture: open the layer as a ``UsdStage`` and report what
composition actually produces — every prim the layer can see through its
sublayers, references, payloads and variant selections.

A shot can compose hundreds of thousands of prims, so nothing here walks the
whole stage. The viewer asks for one prim's children when a row is expanded,
and for one prim's detail when it is picked.
"""

from __future__ import annotations

import os
import threading
from collections import OrderedDict
from typing import Any

from pxr import Sdf, Usd

from .crawl import node_id

#: Children returned for one prim before the list is cut short.
DEFAULT_CHILD_LIMIT = 500

#: Prims listed by one expand-all before the rest is left collapsed. Enough for
#: an asset or a set; a whole shot is better opened a branch at a time.
DEFAULT_SUBTREE_LIMIT = 5000

#: Stages kept open between requests. Opening is the slow part; walking an open
#: stage is cheap, and expanding a tree is many small requests against one.
MAX_OPEN_STAGES = 4

#: Every prim, not just the defined, active, concrete ones: an `over` that never
#: got a `def`, a deactivated prim and a class are exactly what someone
#: debugging composition needs to see. Instance proxies are walked into so an
#: instanced asset does not read as empty.
PREDICATE = Usd.TraverseInstanceProxies(Usd.PrimAllPrimsPredicate)

SPECIFIER = {
    Sdf.SpecifierDef: "def",
    Sdf.SpecifierOver: "over",
    Sdf.SpecifierClass: "class",
}


class SceneError(Exception):
    """A request that cannot be answered; carries the HTTP status to send."""

    def __init__(self, status: int, message: str, detail: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.detail = detail


class StageCache:
    """A few recently used stages, keyed by file and payload loading.

    Stages are not re-opened when files change: the graph crawl reloads every
    layer it reads, and an open stage recomposes itself when one of its layers
    is reloaded, so a rescan reaches these stages too.
    """

    def __init__(self, size: int = MAX_OPEN_STAGES) -> None:
        self.size = size
        self.lock = threading.RLock()
        self._stages: OrderedDict[tuple[str, bool], Usd.Stage] = OrderedDict()

    def get(self, path: str, load_payloads: bool) -> Usd.Stage:
        key = (node_id(path), load_payloads)
        with self.lock:
            stage = self._stages.get(key)
            if stage is not None:
                self._stages.move_to_end(key)
                return stage

            if not os.path.isfile(path):
                raise SceneError(404, "No such file", path)
            load = Usd.Stage.LoadAll if load_payloads else Usd.Stage.LoadNone
            try:
                stage = Usd.Stage.Open(path, load)
            except Exception as exc:
                first = str(exc).strip().splitlines()[0] if str(exc) else ""
                raise SceneError(422, "USD could not compose this file", first) from exc
            if stage is None:
                raise SceneError(422, "USD could not compose this file", path)

            self._stages[key] = stage
            while len(self._stages) > self.size:
                self._stages.popitem(last=False)
            return stage


STAGES = StageCache()


def children(
    path: str,
    prim_path: str = "/",
    load_payloads: bool = False,
    limit: int = DEFAULT_CHILD_LIMIT,
) -> dict[str, Any]:
    """One level of the hierarchy: the children of `prim_path`."""
    with STAGES.lock:
        stage = STAGES.get(path, load_payloads)
        return _level(path, stage, _prim(stage, prim_path), limit)[0]


def subtree(
    path: str,
    prim_path: str = "/",
    load_payloads: bool = False,
    max_prims: int = DEFAULT_SUBTREE_LIMIT,
) -> dict[str, Any]:
    """Every level beneath `prim_path`, for expanding a whole branch at once.

    Walked breadth first, so when the budget runs out it is the deepest levels
    that are left for later rather than a whole sibling branch. `truncated`
    says whether anything was left.
    """
    with STAGES.lock:
        stage = STAGES.get(path, load_payloads)
        queue = [_prim(stage, prim_path)]
        levels: list[dict[str, Any]] = []
        listed = 0
        truncated = False
        while queue:
            prim = queue.pop(0)
            if listed >= max_prims:
                truncated = True
                break
            level, shown = _level(path, stage, prim, DEFAULT_CHILD_LIMIT)
            levels.append(level)
            listed += len(shown)
            queue.extend(child for child in shown if child.GetFilteredChildren(PREDICATE))
        return {"levels": levels, "truncated": truncated, "prims": listed}


def detail(path: str, prim_path: str, load_payloads: bool = False) -> dict[str, Any]:
    """Everything the inspector shows for one picked prim."""
    with STAGES.lock:
        stage = STAGES.get(path, load_payloads)
        prim = _prim(stage, prim_path)
        out = _summary(prim)

        variant_sets = prim.GetVariantSets()
        out["variantSets"] = [
            {
                "name": name,
                "selection": variant_sets.GetVariantSelection(name) or None,
                "options": list(variant_sets.GetVariantSet(name).GetVariantNames()),
            }
            for name in variant_sets.GetNames()
        ]
        out["appliedSchemas"] = list(prim.GetAppliedSchemas())
        out["attributeCount"] = len(prim.GetAttributes())
        out["relationshipCount"] = len(prim.GetRelationships())
        out["opinions"] = _opinions(prim)
        return out


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _level(
    path: str, stage: Usd.Stage, prim: Usd.Prim, limit: int
) -> tuple[dict[str, Any], list[Usd.Prim]]:
    """One prim's children as the viewer reads them, and the prims listed."""
    kids = prim.GetFilteredChildren(PREDICATE)
    shown = list(kids[:limit])
    default = stage.GetDefaultPrim()
    level = {
        "layerId": node_id(path),
        "primPath": str(prim.GetPath()),
        "defaultPrim": str(default.GetPath()) if default else None,
        "children": [_summary(child) for child in shown],
        "total": len(kids),
    }
    return level, shown


def _prim(stage: Usd.Stage, prim_path: str) -> Usd.Prim:
    if not Sdf.Path.IsValidPathString(prim_path):
        raise SceneError(400, "Not a prim path", prim_path)
    sdf_path = Sdf.Path(prim_path)
    prim = stage.GetPseudoRoot() if sdf_path == Sdf.Path.absoluteRootPath else stage.GetPrimAtPath(sdf_path)
    if not prim:
        raise SceneError(404, "No such prim", prim_path)
    return prim


def _summary(prim: Usd.Prim) -> dict[str, Any]:
    """What a tree row needs: cheap queries only, since a level can be long."""
    arcs: list[str] = []
    if prim.HasAuthoredReferences():
        arcs.append("reference")
    if prim.HasAuthoredPayloads():
        arcs.append("payload")
    if prim.HasAuthoredInherits():
        arcs.append("inherit")
    if prim.HasAuthoredSpecializes():
        arcs.append("specialize")

    variant_sets = prim.GetVariantSets()
    variants = {
        name: variant_sets.GetVariantSelection(name) for name in variant_sets.GetNames()
    }

    out: dict[str, Any] = {
        "name": prim.GetName(),
        "path": str(prim.GetPath()),
        "typeName": str(prim.GetTypeName()),
        "specifier": SPECIFIER.get(prim.GetSpecifier(), "def"),
        "active": prim.IsActive(),
        "childCount": len(prim.GetFilteredChildren(PREDICATE)),
        "arcs": arcs,
    }
    kind = Usd.ModelAPI(prim).GetKind()
    if kind:
        out["kind"] = kind
    if variants:
        out["variants"] = variants
    if prim.IsInstance():
        out["instance"] = True
    if prim.IsInstanceProxy():
        out["instanceProxy"] = True
    if prim.HasAuthoredPayloads() and not prim.IsLoaded():
        out["unloaded"] = True
    return out


def _opinions(prim: Usd.Prim) -> list[dict[str, Any]]:
    """Every layer holding an opinion on the prim, strongest first.

    Each is labelled with the arc that brought its layer in, so a row reads as
    "hero.usda, through a reference" rather than as a bare prim stack. The
    session layer is the viewer's own scratch space and is left out.
    """
    out: list[dict[str, Any]] = []
    for arc in Usd.PrimCompositionQuery(prim).GetCompositionArcs():
        node = arc.GetTargetNode()
        kind = str(arc.GetArcType()).rsplit("ArcType", 1)[-1].lower()
        introducing = arc.GetIntroducingLayer()
        for layer in node.layerStack.layers:
            if layer.anonymous or not layer.GetPrimAtPath(node.path):
                continue
            real = layer.realPath or layer.identifier
            entry: dict[str, Any] = {
                "layerId": node_id(real),
                "layerPath": real,
                "name": os.path.basename(real),
                "specPath": str(node.path),
                "arc": kind,
            }
            if introducing and not introducing.anonymous and kind != "root":
                entry["introducedBy"] = os.path.basename(
                    introducing.realPath or introducing.identifier
                )
            out.append(entry)
    return out
