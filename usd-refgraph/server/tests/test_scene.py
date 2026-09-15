"""Server tests: the composed prim hierarchy behind the inspector's Scene tab.

Run from the `server` directory:

    ../.venv/Scripts/python -m tests.test_scene
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usd_refgraph import scene  # noqa: E402
from usd_refgraph.crawl import node_id  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixture")
SHOT = os.path.join(FIXTURE, "shot.usda")

failures: list[str] = []


def check(label: str, actual: object, expected: object) -> None:
    if actual == expected:
        print(f"  ok    {label}")
    else:
        print(f"  FAIL  {label}\n          expected {expected!r}\n          got      {actual!r}")
        failures.append(label)


def main() -> int:
    print("top level")
    top = scene.children(SHOT)
    names = [prim["name"] for prim in top["children"]]
    check("sublayer prims compose in beside the root layer's", sorted(names), ["Anim", "Shot"])
    check("default prim reported", top["defaultPrim"], "/Shot")

    print("\none level down")
    shot = {prim["name"]: prim for prim in scene.children(SHOT, "/Shot")["children"]}
    check(
        "children in authored order",
        list(shot),
        ["Hero", "Crowd", "Clipped", "Templated", "Surface"],
    )
    check("reference and payload flagged", shot["Hero"]["arcs"], ["reference", "payload"])
    check("payload left unloaded by default", shot["Hero"].get("unloaded"), True)
    check("variant selection carried", shot["Crowd"]["variants"], {"lod": "high"})
    check("child count", shot["Surface"]["childCount"], 3)

    print("\nvariants compose")
    body = scene.children(SHOT, "/Shot/Crowd")["children"]
    check("the selected variant's prim is there", [prim["name"] for prim in body], ["Body"])
    check("its reference is flagged", body[0]["arcs"], ["reference"])

    print("\nloading payloads")
    loaded = {p["name"]: p for p in scene.children(SHOT, "/Shot", load_payloads=True)["children"]}
    check("loaded when asked", loaded["Hero"].get("unloaded"), None)

    print("\nlimit")
    capped = scene.children(SHOT, "/Shot", limit=2)
    check("cut short", len(capped["children"]), 2)
    check("total still counts everything", capped["total"], 5)

    print("\nexpanding a whole subtree")
    tree = scene.subtree(SHOT)
    levels = {level["primPath"]: level for level in tree["levels"]}
    check(
        "every prim with children gets its level",
        sorted(levels),
        ["/", "/Shot", "/Shot/Crowd", "/Shot/Surface"],
    )
    check("nothing left out", tree["truncated"], False)
    check("from a branch, only that branch", [l["primPath"] for l in scene.subtree(SHOT, "/Shot/Surface")["levels"]], ["/Shot/Surface"])
    capped = scene.subtree(SHOT, max_prims=3)
    check("budget stops the walk", capped["truncated"], True)
    check("shallowest levels come first", capped["levels"][0]["primPath"], "/")

    print("\nprim detail")
    crowd = scene.detail(SHOT, "/Shot/Crowd/Body")
    arcs = [(o["arc"], o["name"]) for o in crowd["opinions"]]
    check(
        "opinions strongest first, labelled by arc",
        arcs,
        [("variant", "shot.usda"), ("reference", "crowd_high.usda")],
    )
    check(
        "layer ids match the graph's node ids",
        crowd["opinions"][-1]["layerId"],
        node_id(os.path.join(FIXTURE, "assets", "crowd_high.usda")),
    )
    variants = scene.detail(SHOT, "/Shot/Crowd")["variantSets"]
    check(
        "variant set options listed",
        variants,
        [{"name": "lod", "selection": "high", "options": ["high", "low"]}],
    )

    print("\nfailures")
    for label, call, status in [
        ("unknown prim", lambda: scene.children(SHOT, "/Nope"), 404),
        ("bad prim path", lambda: scene.children(SHOT, "not a path"), 400),
        ("missing file", lambda: scene.children(os.path.join(FIXTURE, "gone.usda")), 404),
    ]:
        try:
            call()
            check(label, "no error", status)
        except scene.SceneError as exc:
            check(label, exc.status, status)

    print()
    if failures:
        print(f"{len(failures)} check(s) failed")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
