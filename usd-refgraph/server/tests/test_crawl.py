"""Server tests: the layer crawler, and the file search behind drag-and-drop.

Run from the `server` directory:

    ../.venv/Scripts/python -m tests.test_crawl

No test framework needed — the crawler is the part most likely to break
quietly when USD changes, so the check is kept dependency-free and runnable
anywhere the app itself runs.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usd_refgraph.browse import locate  # noqa: E402
from usd_refgraph.crawl import Crawler  # noqa: E402
from usd_refgraph.naming import classify, describe  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixture")

failures: list[str] = []


def check(label: str, actual: object, expected: object) -> None:
    if actual == expected:
        print(f"  ok    {label}")
    else:
        print(f"  FAIL  {label}\n          expected {expected!r}\n          got      {actual!r}")
        failures.append(label)


def check_true(label: str, value: object) -> None:
    check(label, bool(value), True)


def main() -> int:
    graph = Crawler(os.path.join(FIXTURE, "shot.usda")).run().to_dict()
    nodes = {n["name"]: n for n in graph["nodes"]}
    edges = graph["edges"]
    by_target = {}
    for edge in edges:
        by_target.setdefault(graph_name(graph, edge["to"]), []).append(edge)

    print("arc kinds")
    counts = graph["stats"]["byArc"]
    check("sublayers", counts["sublayer"], 2)
    check("references", counts["reference"], 3)
    check("payloads", counts["payload"], 1)
    check("clips", counts["clip"], 3)
    check("assets", counts["asset"], 3)
    check("nothing unattributed", counts["unknown"], 0)

    print("\nnodes")
    check("every arc produced a node", len(graph["nodes"]), 13)
    check_true("binary flag is off for .usda", not nodes["anim.usda"]["binary"])
    check("layer metadata read", nodes["shot.usda"]["meta"]["defaultPrim"], "Shot")
    check(
        "customLayerData carried through",
        nodes["shot.usda"]["meta"]["customLayerData"]["pipeline_step"],
        "layout",
    )
    check("frame range read", nodes["shot.usda"]["meta"]["endTimeCode"], 48.0)

    print("\nmissing files")
    check("missing count excludes templates", graph["stats"]["missing"], 3)
    check_true("missing sublayer found", not nodes["missing_layer.usda"]["exists"])
    check_true("missing clip found", not nodes["sim.0002.usda"]["exists"])
    check_true("missing texture found", not nodes["nope.exr"]["exists"])
    check_true("present texture resolves", nodes["roughness.png"]["exists"])

    print("\nplaceholder paths")
    check_true("udim marked as template", nodes["basecolor.<UDIM>.exr"]["template"])
    check_true("frame token marked as template", nodes["frame.#.usda"]["template"])
    check(
        "templates raise no warnings",
        [w for w in graph["warnings"] if "basecolor" in w["message"]],
        [],
    )

    print("\narc detail")
    hero = by_target["hero.usda"][0]
    check("reference target prim", hero.get("targetPrim"), "/Hero")
    check("reference prim path", hero.get("primPath"), "/Shot/Hero")
    check("list op recorded", hero.get("listOp"), "prepend")

    payload = by_target["hero_proxy.usda"][0]
    check("payload classified", payload["kind"], "payload")

    high = by_target["crowd_high.usda"][0]
    check(
        "variant scope captured",
        high.get("variants"),
        [{"set": "lod", "variant": "high"}],
    )
    low = by_target["crowd_low.usda"][0]
    check_true(
        "unselected variant still crawled",
        low.get("variants") == [{"set": "lod", "variant": "low"}],
    )

    texture = by_target["roughness.png"][0]
    check("asset attribute recorded", texture.get("attribute"), "inputs:file")
    check("asset node is not a layer", nodes["roughness.png"]["kind"], "asset")

    print("\nassets can be excluded")
    lean = Crawler(
        os.path.join(FIXTURE, "shot.usda"), include_assets=False
    ).run().to_dict()
    check("no asset arcs", lean["stats"]["byArc"]["asset"], 0)
    check("clips are still composition", lean["stats"]["byArc"]["clip"], 3)

    print("\ndepth limit")
    shallow = Crawler(os.path.join(FIXTURE, "shot.usda"), max_depth=0).run().to_dict()
    check("root only", len(shallow["nodes"]), 1)

    print("\nnaming convention (guide 15.5, 15.10)")
    for filename, expected in [
        ("char-robot.usda", ("assembly", "asset")),
        ("prop-crate.usda", ("assembly", "asset")),
        ("set-living-room.usda", ("assembly", "set")),
        ("kilo-0010.usda", ("assembly", "shot")),
        ("char-robot_model.usdc", ("block", "asset")),
        ("set-living-room_fg-dressing.usda", ("block", "set")),
        ("kilo-0010_fx-sparks.usdc", ("block", "shot")),
        # An assembly is composition only, so it is always .usda.
        ("char-robot.usdc", ("other", None)),
        # Published filenames carry no version and no artist.
        ("char-robot_model_v002.usda", ("other", None)),
        # The convention is lowercase.
        ("Char-Robot.usda", ("other", None)),
        ("roughness.png", ("other", None)),
    ]:
        check(filename, classify(filename), expected)

    check("label for a shot root", describe("assembly", "shot"), "shot root")
    check("label for an asset assembly", describe("assembly", "asset"), "asset assembly")

    print("\nfinding a dropped file")
    hero = os.path.join(FIXTURE, "assets", "hero.usda")
    hero_size = os.path.getsize(hero)

    # Dropped while sitting in a sibling directory: has to climb out of
    # `clips/` and back down into `assets/`.
    found = locate("hero.usda", hero_size, [os.path.join(FIXTURE, "clips")])
    check("found from a sibling directory", [m["path"] for m in found["matches"]], [hero])
    check_true("size match flagged", found["matches"][0]["sizeMatches"])

    check(
        "a wrong size still returns the file, unflagged",
        [m["sizeMatches"] for m in locate("hero.usda", hero_size + 99, [FIXTURE])["matches"]],
        [False],
    )
    check("name is matched case-insensitively", len(locate("HERO.USDA", None, [FIXTURE])["matches"]), 1)
    check("a file that is not there finds nothing", locate("no-such-file.usda", None, [FIXTURE])["matches"], [])

    print()
    if failures:
        print(f"{len(failures)} check(s) failed")
        return 1
    print("all checks passed")
    return 0


def graph_name(graph: dict, node_id: str) -> str:
    for node in graph["nodes"]:
        if node["id"] == node_id:
            return str(node["name"])
    return node_id


if __name__ == "__main__":
    raise SystemExit(main())
