"""Walk a USD layer's file dependencies and build a graph.

The crawl works entirely on ``Sdf`` layer specs rather than a composed
``UsdStage``. That is deliberate: we want the arcs *as authored*, including
opinions inside variants that a composed stage would have resolved away, and
we want to see a layer even when the file it points at is missing.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Any, Iterable

from pxr import Ar, Sdf

from .model import (
    BINARY_EXTS,
    ArcKind,
    Graph,
    GraphEdge,
    GraphNode,
    GraphWarning,
    LayerMeta,
    ListOp,
    VariantScope,
    is_usd_path,
    layer_format,
)
from .naming import classify, describe

#: Hard ceiling so a pathological scene cannot hang the server.
DEFAULT_MAX_NODES = 4000


@dataclass
class Dep:
    """One authored dependency, before it becomes a graph edge."""

    kind: ArcKind
    raw_path: str
    prim_path: str | None = None
    target_prim: str | None = None
    variants: list[VariantScope] = field(default_factory=list)
    list_op: ListOp | None = None
    attribute: str | None = None
    template: bool = False


# ---------------------------------------------------------------------------
# Path handling
# ---------------------------------------------------------------------------


def node_id(path: str) -> str:
    """A stable identity for a file path, case-insensitive on Windows."""
    return os.path.normcase(os.path.normpath(path))


def anchor_path(layer: Sdf.Layer, raw: str) -> str:
    """Resolve an authored asset path against the layer that authored it."""
    if not raw:
        return raw
    try:
        computed = layer.ComputeAbsolutePath(raw)
    except Exception:
        computed = raw
    if computed and os.path.isabs(computed):
        return os.path.normpath(computed)

    # Search-path or resolver-driven asset; let the resolver have a go.
    try:
        resolved = str(Ar.GetResolver().Resolve(raw))
        if resolved:
            return os.path.normpath(resolved)
    except Exception:
        pass
    return computed or raw


def split_package(path: str) -> tuple[str, str | None]:
    """Split ``foo.usdz[inner.usda]`` into its package and inner path."""
    try:
        if Ar.IsPackageRelativePath(path):
            outer, inner = Ar.SplitPackageRelativePathOuter(path)
            return outer, inner or None
    except Exception:
        pass
    return path, None


# ---------------------------------------------------------------------------
# Reading one layer
# ---------------------------------------------------------------------------


def _list_op_items(list_op: Any) -> Iterable[tuple[Any, ListOp]]:
    """Yield every item of an Sdf list op alongside the op that authored it."""
    if list_op is None:
        return
    for attr, name in (
        ("explicitItems", "explicit"),
        ("prependedItems", "prepend"),
        ("appendedItems", "append"),
        ("addedItems", "add"),
        ("deletedItems", "delete"),
        ("orderedItems", "reorder"),
    ):
        try:
            items = getattr(list_op, attr, None) or []
        except Exception:
            continue
        for item in items:
            yield item, name  # type: ignore[misc]


def read_layer_meta(layer: Sdf.Layer) -> LayerMeta:
    meta = LayerMeta()
    for attr in ("defaultPrim", "documentation"):
        try:
            value = getattr(layer, attr, None)
            if value:
                setattr(meta, attr, str(value))
        except Exception:
            pass
    for attr in ("startTimeCode", "endTimeCode", "framesPerSecond"):
        try:
            if layer.HasStartTimeCode() if attr == "startTimeCode" else True:
                value = getattr(layer, attr, None)
                if value is not None:
                    setattr(meta, attr, float(value))
        except Exception:
            pass

    # `upAxis` and `metersPerUnit` are stage metadata, held on the pseudo-root.
    try:
        root = layer.pseudoRoot
        if root.HasInfo("upAxis"):
            meta.upAxis = str(root.GetInfo("upAxis"))
        if root.HasInfo("metersPerUnit"):
            meta.metersPerUnit = float(root.GetInfo("metersPerUnit"))
    except Exception:
        pass

    try:
        custom = layer.customLayerData or {}
        meta.customLayerData = {
            str(k): _stringify(v) for k, v in custom.items() if v is not None
        }
    except Exception:
        pass

    try:
        meta.primCount = len(layer.rootPrims)
    except Exception:
        pass

    return meta


def _stringify(value: Any) -> str:
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    try:
        return str(value)
    except Exception:
        return "<unprintable>"


def collect_deps(layer: Sdf.Layer, include_assets: bool) -> list[Dep]:
    """Every external file this layer points at, with the arc that points."""
    deps: list[Dep] = []

    for raw in list(layer.subLayerPaths):
        if raw:
            deps.append(Dep(kind="sublayer", raw_path=str(raw)))

    def visit(prim: Sdf.PrimSpec, variants: list[VariantScope]) -> None:
        prim_path = str(prim.path)

        for item, op in _list_op_items(getattr(prim, "referenceList", None)):
            asset = str(getattr(item, "assetPath", "") or "")
            if not asset:
                continue  # internal reference: a prim path with no file
            deps.append(
                Dep(
                    kind="reference",
                    raw_path=asset,
                    prim_path=prim_path,
                    target_prim=str(getattr(item, "primPath", "") or "") or None,
                    variants=list(variants),
                    list_op=op,
                )
            )

        for item, op in _list_op_items(getattr(prim, "payloadList", None)):
            asset = str(getattr(item, "assetPath", "") or "")
            if not asset:
                continue
            deps.append(
                Dep(
                    kind="payload",
                    raw_path=asset,
                    prim_path=prim_path,
                    target_prim=str(getattr(item, "primPath", "") or "") or None,
                    variants=list(variants),
                    list_op=op,
                )
            )

        deps.extend(_collect_clips(prim, prim_path, variants))

        if include_assets:
            deps.extend(_collect_asset_attrs(prim, prim_path, variants))

        for child in prim.nameChildren:
            visit(child, variants)

        # Opinions inside variants never compose on their own, but they are
        # very much real dependencies of the file, so walk into them too.
        try:
            variant_sets = prim.variantSets
        except Exception:
            return
        for set_name, variant_set in variant_sets.items():
            for variant_name, variant in variant_set.variants.items():
                scope = variants + [VariantScope(str(set_name), str(variant_name))]
                try:
                    visit(variant.primSpec, scope)
                except Exception:
                    continue

    for root_prim in layer.rootPrims:
        visit(root_prim, [])

    return deps


def _collect_clips(
    prim: Sdf.PrimSpec, prim_path: str, variants: list[VariantScope]
) -> list[Dep]:
    """Value-clip asset paths, in both the clip-set and the legacy layout."""
    out: list[Dep] = []

    def add(raw: Any, attribute: str) -> None:
        text = str(getattr(raw, "path", raw) or "")
        if not text:
            return
        out.append(
            Dep(
                kind="clip",
                raw_path=text,
                prim_path=prim_path,
                variants=list(variants),
                attribute=attribute,
                template="#" in text,
            )
        )

    try:
        if not prim.HasInfo("clips"):
            return out
        clips = prim.GetInfo("clips") or {}
    except Exception:
        return out

    for set_name, clip_set in dict(clips).items():
        if not isinstance(clip_set, dict):
            continue
        label = str(set_name)
        for key in ("assetPaths", "clipAssetPaths"):
            for path in clip_set.get(key, []) or []:
                add(path, f"clips:{label}")
        for key in ("templateAssetPath", "clipTemplateAssetPath", "manifestAssetPath"):
            value = clip_set.get(key)
            if value:
                add(value, f"clips:{label}:{key}")

    return out


def _collect_asset_attrs(
    prim: Sdf.PrimSpec, prim_path: str, variants: list[VariantScope]
) -> list[Dep]:
    """Asset-valued attributes: textures, MaterialX documents, volume grids."""
    out: list[Dep] = []
    try:
        attributes = prim.attributes
    except Exception:
        return out

    for name, attr in attributes.items():
        try:
            type_name = attr.typeName
            if type_name not in (
                Sdf.ValueTypeNames.Asset,
                Sdf.ValueTypeNames.AssetArray,
            ):
                continue
        except Exception:
            continue

        values: list[Any] = []
        try:
            default = attr.default
            if default is not None:
                values.extend(default if _is_sequence(default) else [default])
        except Exception:
            pass
        try:
            if attr.HasInfo("timeSamples"):
                for sample in (attr.GetInfo("timeSamples") or {}).values():
                    values.extend(sample if _is_sequence(sample) else [sample])
        except Exception:
            pass

        seen: set[str] = set()
        for value in values:
            text = str(getattr(value, "path", value) or "")
            if not text or text in seen:
                continue
            seen.add(text)
            out.append(
                Dep(
                    kind="asset",
                    raw_path=text,
                    prim_path=prim_path,
                    variants=list(variants),
                    attribute=str(name),
                    template="<UDIM>" in text or "#" in text,
                )
            )

    return out


def _is_sequence(value: Any) -> bool:
    return isinstance(value, (list, tuple)) or type(value).__name__.endswith("Array")


# ---------------------------------------------------------------------------
# The crawl
# ---------------------------------------------------------------------------


class Crawler:
    def __init__(
        self,
        root: str,
        *,
        include_assets: bool = True,
        max_depth: int | None = None,
        max_nodes: int = DEFAULT_MAX_NODES,
        reload: bool = True,
    ) -> None:
        self.root = os.path.normpath(os.path.abspath(root))
        self.include_assets = include_assets
        self.max_depth = max_depth
        self.max_nodes = max_nodes
        self.reload = reload
        self.root_dir = os.path.dirname(self.root)

        self.nodes: dict[str, GraphNode] = {}
        self.edges: list[GraphEdge] = []
        self.warnings: list[GraphWarning] = []
        self._edge_keys: set[str] = set()

    # -- node bookkeeping ---------------------------------------------------

    def _ensure_node(self, path: str, depth: int) -> GraphNode:
        package, inner = split_package(path)
        nid = node_id(path)
        existing = self.nodes.get(nid)
        if existing:
            existing.depth = min(existing.depth, depth)
            return existing

        normalised = os.path.normpath(path)
        display = normalised if not inner else f"{package}[{inner}]"
        name = os.path.basename(inner or package) or normalised
        directory = os.path.dirname(package)
        ext = os.path.splitext(inner or package)[1].lower()

        size: int | None = None
        mtime: int | None = None
        exists = False
        try:
            stat = os.stat(package)
            exists = True
            size = stat.st_size
            mtime = int(stat.st_mtime * 1000)
        except OSError:
            exists = False

        try:
            rel_dir = os.path.relpath(directory, self.root_dir) if self.root_dir else "."
        except ValueError:
            rel_dir = directory  # different drive

        role, tier = classify(name)
        node = GraphNode(
            id=nid,
            path=display,
            name=name,
            dir=directory,
            relDir=rel_dir or ".",
            ext=ext.lstrip("."),
            kind="layer" if is_usd_path(inner or package) else "asset",
            format=layer_format(inner or package),
            exists=exists,
            size=size,
            mtime=mtime,
            binary=ext in BINARY_EXTS,
            depth=depth,
            packagePath=package if inner else None,
            role=role,
            tier=tier,
            roleLabel=describe(role, tier),
        )
        self.nodes[nid] = node
        return node

    def _add_edge(self, source: GraphNode, target: GraphNode, dep: Dep) -> None:
        key = "|".join(
            [
                source.id,
                target.id,
                dep.kind,
                dep.prim_path or "",
                dep.attribute or "",
                dep.raw_path,
                ",".join(f"{v.set}={v.variant}" for v in dep.variants),
            ]
        )
        if key in self._edge_keys:
            return
        self._edge_keys.add(key)
        self.edges.append(
            GraphEdge(
                id=f"e{len(self.edges)}",
                source=source.id,
                target=target.id,
                kind=dep.kind,
                rawPath=dep.raw_path,
                primPath=dep.prim_path,
                targetPrim=dep.target_prim,
                variants=list(dep.variants),
                listOp=dep.list_op,
                attribute=dep.attribute,
                template=dep.template,
            )
        )

    # -- main loop ----------------------------------------------------------

    def run(self) -> Graph:
        started = time.perf_counter()

        root_node = self._ensure_node(self.root, 0)
        if not root_node.exists:
            self.warnings.append(
                GraphWarning(
                    message=f"{root_node.name} does not exist on disk.",
                    severity="error",
                    nodeId=root_node.id,
                )
            )

        queue: list[tuple[str, int]] = [(self.root, 0)]
        seen_layers: set[str] = {root_node.id}

        while queue:
            path, depth = queue.pop(0)
            node = self._ensure_node(path, depth)

            if not node.exists or node.kind != "layer":
                continue
            if self.max_depth is not None and depth >= self.max_depth:
                continue
            if len(self.nodes) >= self.max_nodes:
                self.warnings.append(
                    GraphWarning(
                        message=(
                            f"Stopped at {self.max_nodes} files; the graph is "
                            "larger than the display limit."
                        ),
                        severity="warning",
                    )
                )
                break

            layer = self._open(node)
            if layer is None:
                continue

            node.scanned = True
            node.meta = read_layer_meta(layer)

            try:
                deps = collect_deps(layer, self.include_assets)
            except Exception as exc:  # a malformed layer should not kill the crawl
                node.error = f"Could not read dependencies: {exc}"
                self.warnings.append(
                    GraphWarning(message=node.error, severity="error", nodeId=node.id)
                )
                continue

            deps.extend(self._sweep_missed(layer, deps))

            for dep in deps:
                if dep.template:
                    # Placeholder paths (`#` frames, `<UDIM>`) never resolve to a
                    # single file; record the arc but do not stat or recurse.
                    target = self._ensure_node(
                        anchor_path(layer, dep.raw_path), depth + 1
                    )
                    target.template = True
                    self._add_edge(node, target, dep)
                    continue

                resolved = anchor_path(layer, dep.raw_path)
                if not resolved:
                    continue
                target = self._ensure_node(resolved, depth + 1)
                self._add_edge(node, target, dep)

                if target.kind == "layer" and target.id not in seen_layers:
                    seen_layers.add(target.id)
                    queue.append((resolved, depth + 1))

        self._warn_about_missing()
        elapsed = (time.perf_counter() - started) * 1000

        return Graph(
            rootId=root_node.id,
            nodes=list(self.nodes.values()),
            edges=self.edges,
            warnings=self.warnings,
            cycles=find_cycles(self.nodes.keys(), self.edges),
            elapsedMs=elapsed,
            scannedAt=int(time.time() * 1000),
        )

    def _open(self, node: GraphNode) -> Sdf.Layer | None:
        try:
            cached = Sdf.Layer.Find(node.path)
            layer = cached or Sdf.Layer.FindOrOpen(node.path)
            if layer is None:
                node.error = "USD could not open this file."
                self.warnings.append(
                    GraphWarning(message=f"{node.name}: {node.error}", severity="error", nodeId=node.id)
                )
                return None
            if cached is not None and self.reload:
                # The layer was already in USD's cache, possibly from an earlier
                # scan; re-read it so edits on disk show up.
                try:
                    layer.Reload()
                except Exception:
                    pass
            return layer
        except Exception as exc:
            node.error = str(exc).strip().splitlines()[0] if str(exc) else "Failed to open."
            self.warnings.append(
                GraphWarning(
                    message=f"{node.name}: {node.error}", severity="error", nodeId=node.id
                )
            )
            return None

    def _sweep_missed(self, layer: Sdf.Layer, found: list[Dep]) -> list[Dep]:
        """Catch composition dependencies our walk did not attribute to an arc.

        USD's own dependency query is the authority on *what* a layer depends
        on; our walk adds the detail of *where* each dependency came from. Any
        gap between the two is a bug in the walk, so surface it rather than
        silently dropping the file.
        """
        try:
            getter = getattr(layer, "GetCompositionAssetDependencies", None) or getattr(
                layer, "GetExternalReferences", None
            )
            if getter is None:
                return []
            declared = {str(p) for p in getter() if p}
        except Exception:
            return []

        known = {d.raw_path for d in found}
        return [
            Dep(kind="unknown", raw_path=raw) for raw in sorted(declared - known) if raw
        ]

    def _warn_about_missing(self) -> None:
        for node in self.nodes.values():
            if node.exists or node.depth == 0 or node.template:
                continue
            label = "Layer" if node.kind == "layer" else "Asset"
            self.warnings.append(
                GraphWarning(
                    message=f"{label} not found on disk: {node.path}",
                    severity="error" if node.kind == "layer" else "warning",
                    nodeId=node.id,
                )
            )


# ---------------------------------------------------------------------------
# Cycles
# ---------------------------------------------------------------------------


def find_cycles(node_ids: Iterable[str], edges: list[GraphEdge]) -> list[list[str]]:
    """Every distinct cycle reachable by depth-first search.

    Layer cycles are illegal in USD but do occur in half-authored scenes, and
    they are exactly the thing a dependency view should point at.
    """
    adjacency: dict[str, list[str]] = {nid: [] for nid in node_ids}
    for edge in edges:
        if edge.target not in adjacency.get(edge.source, []):
            adjacency.setdefault(edge.source, []).append(edge.target)

    WHITE, GREY, BLACK = 0, 1, 2
    colour: dict[str, int] = {nid: WHITE for nid in adjacency}
    stack: list[str] = []
    found: list[list[str]] = []
    seen_signatures: set[str] = set()

    def visit(nid: str) -> None:
        colour[nid] = GREY
        stack.append(nid)
        for nxt in adjacency.get(nid, []):
            state = colour.get(nxt, WHITE)
            if state == GREY:
                cycle = stack[stack.index(nxt) :]
                signature = "|".join(sorted(cycle))
                if signature not in seen_signatures:
                    seen_signatures.add(signature)
                    found.append(list(cycle))
            elif state == WHITE:
                visit(nxt)
        stack.pop()
        colour[nid] = BLACK

    for nid in list(adjacency):
        if colour.get(nid) == WHITE:
            try:
                visit(nid)
            except RecursionError:
                break

    return found
