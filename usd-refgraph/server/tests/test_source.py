"""Server tests: a layer's text, behind the inspector's Source tab.

Run from the `server` directory:

    ../.venv/Scripts/python -m tests.test_source
"""

from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pxr import Sdf  # noqa: E402

from usd_refgraph import source  # noqa: E402

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
    print("text layers")
    text = source.read(SHOT)
    with open(SHOT, "rb") as fh:
        on_disk = fh.read().decode("utf-8")
    check("returned exactly as on disk", text["text"], on_disk)
    check("not cut short", text["truncated"], False)

    print("\nbinary layers are not read")
    with tempfile.TemporaryDirectory() as tmp:
        hero = Sdf.Layer.FindOrOpen(os.path.join(FIXTURE, "assets", "hero.usda"))
        crate = os.path.join(tmp, "hero.usdc")
        hero.Export(crate)
        # A `.usd` file can be either; the bytes decide, not the extension.
        disguised = os.path.join(tmp, "hero.usd")
        hero.Export(disguised, args={"format": "usdc"})
        plain = os.path.join(tmp, "plain.usd")
        hero.Export(plain, args={"format": "usda"})

        for label, path, status in [
            ("a .usdc file", crate, 415),
            ("a crate behind a .usd extension", disguised, 415),
        ]:
            try:
                source.read(path)
                check(label, "read", status)
            except source.SourceError as exc:
                check(label, exc.status, status)
        check("a text .usd file is read", source.read(plain)["text"].startswith("#usda"), True)

    print("\nlimits")
    short = source.read(SHOT, max_chars=200)
    check("cut short when too long", short["truncated"], True)
    check("cut on a line boundary", on_disk.startswith(short["text"] + "\n"), True)
    check("total lines still counted", short["totalLines"], text["totalLines"])

    print("\nfailures")
    for label, path, status in [
        ("not a USD file", os.path.join(FIXTURE, "tex", "roughness.png"), 415),
        ("missing file", os.path.join(FIXTURE, "gone.usda"), 404),
    ]:
        try:
            source.read(path)
            check(label, "no error", status)
        except source.SourceError as exc:
            check(label, exc.status, status)

    print()
    if failures:
        print(f"{len(failures)} check(s) failed")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
