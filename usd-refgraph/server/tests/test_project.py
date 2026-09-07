"""Tests for the pipeline metadata and the project scan.

Run from the `server` directory:

    ../.venv/Scripts/python tests/test_project.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from usd_refgraph.naming import category_of, parse_shot_code, split_entity  # noqa: E402
from usd_refgraph.pipeline import (  # noqa: E402
    normalise_status,
    read_record,
    rollup_status,
)
from usd_refgraph.project import ProjectScanner, find_root  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixture-project")

failures: list[str] = []


def check(label: str, actual: object, expected: object) -> None:
    if actual == expected:
        print(f"  ok    {label}")
    else:
        print(f"  FAIL  {label}\n          expected {expected!r}\n          got      {actual!r}")
        failures.append(label)


def main() -> int:
    print("entity and block from the filename")
    check("assembly has no block", split_entity("char-bob.usda"), ("char-bob", None))
    check("block token", split_entity("char-bob_lookdev.usda"), ("char-bob", "lookdev"))
    check("hyphenated block", split_entity("set-room_fg-dressing.usda"), ("set-room", "fg-dressing"))
    check("shot block", split_entity("kilo-0010_camera.usda"), ("kilo-0010", "camera"))
    # A texture's trailing tokens are a channel and resolution, not a block.
    check("texture reports no block", split_entity("char-bob_m_1k.exr"), ("char-bob", None))
    check("category from the prefix", category_of("char-bob"), "character")
    check("shot code", parse_shot_code("kilo-0010"), ("kilo", 10))

    print("\nstatus vocabulary")
    for raw, expected in [
        ("placeholder", "placeholder"),
        ("production_ready", "production_ready"),
        ("locked", "locked"),
        # The tool that preceded this one used wip/ready/final.
        ("wip", "placeholder"),
        ("ready", "production_ready"),
        ("final", "locked"),
        ("PRODUCTION_READY", "production_ready"),
        ("nonsense", "unknown"),
        ("", "unknown"),
        (None, "unknown"),
    ]:
        check(f"{raw!r}", normalise_status(raw)[0], expected)

    check("the original spelling is kept", normalise_status("WIP")[1], "WIP")
    print("\nrolling a status up")
    check(
        "an entity is only as finished as its weakest part",
        rollup_status(["locked", "production_ready", "placeholder"]),
        "placeholder",
    )
    check("all locked stays locked", rollup_status(["locked", "locked"]), "locked")
    check("unknown is ignored when something is known", rollup_status(["unknown", "locked"]), "locked")
    check("nothing known at all", rollup_status(["unknown"]), "unknown")

    print("\nreading a layer's record")
    record = read_record(
        {
            "artist": " havard ",
            "status": "production_ready",
            "comment": "Looks good",
            "hip_file": "workfile_havard_v001.hip",
            "rop_path": "/stage/Bob/rop2",
            "export_datetime_unix": "1788769845",
            "something_new": "kept anyway",
        }
    )
    check("artist is trimmed", record.artist, "havard")
    check("status", record.status, "production_ready")
    check("comment", record.comment, "Looks good")
    check("rop path", record.ropPath, "/stage/Bob/rop2")
    check("seconds become milliseconds", record.exportedAt, 1788769845000)
    check("unknown keys are not dropped", record.extra, {"something_new": "kept anyway"})
    check("an empty comment is not stored", read_record({"comment": ""}).comment, None)

    print("\nscanning a project")
    check("root found from a shot file", find_root(os.path.join(FIXTURE, "shots", "zulu", "0010")), FIXTURE)

    project = ProjectScanner(FIXTURE).run()
    entities = {e["name"]: e for e in project["entities"]}

    check("every entity found", sorted(entities), ["char-test", "set-room", "zulu-0010"])
    check("tiers", [entities[n]["tier"] for n in ["char-test", "set-room", "zulu-0010"]],
          ["asset", "set", "shot"])
    check("block columns", project["blockNames"], ["lookdev", "model"])
    check("artists are collected", project["artists"], ["erik", "ina", "maria"])
    check("sequences", project["sequences"], [{"name": "zulu", "shots": ["zulu-0010"]}])

    # char-test's assembly is production_ready but its model block is locked,
    # so the entity rolls up to the weaker of the two.
    check("entity status rolls up", entities["char-test"]["status"], "production_ready")
    check("legacy wip is understood", entities["zulu-0010"]["status"], "placeholder")

    check("a reference becomes a dependency", entities["set-room"]["dependsOn"], ["char-test"])
    check("a sublayer becomes a dependency", entities["zulu-0010"]["dependsOn"], ["set-room"])
    check("assets depend on nothing here", entities["char-test"]["dependsOn"], [])

    check("assembly is separated from blocks", entities["char-test"]["assembly"]["name"], "char-test.usda")
    # Look blocks up by name: their order is not part of the contract.
    blocks = {b["block"]: b for b in entities["char-test"]["blocks"]}
    check("blocks are named", sorted(blocks), ["lookdev", "model"])
    check("block metadata is read", blocks["model"]["pipeline"]["artist"], "erik")
    print("\ntextures belong to the layer that references them")
    char = entities["char-test"]
    layers = {layer["block"] or "assembly": layer for layer in [char["assembly"], *char["blocks"]]}

    # A texture sitting in an entity's folder says nothing about which of that
    # entity's layers uses it: lookdev references them, the model does not.
    check(
        "lookdev owns the texture it references",
        [t["name"] for t in layers["lookdev"].get("textures", [])],
        ["char-test_bc_2k.exr"],
    )
    check("the model owns none", layers["model"].get("textures", []), [])
    check("nor does the assembly", layers["assembly"].get("textures", []), [])
    check(
        "a texture nothing references is reported unused",
        [t["name"] for t in char["unusedTextures"]],
        ["char-test_n_2k.exr"],
    )
    check(
        "a referenced texture is found on disk",
        layers["lookdev"]["textures"][0]["exists"],
        True,
    )

    check("publish times counted", project["stats"]["publishes"], 5)
    check("layers counted", project["stats"]["layers"], 5)

    print()
    if failures:
        print(f"{len(failures)} check(s) failed")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
