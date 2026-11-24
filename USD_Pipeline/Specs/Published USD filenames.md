---
type: spec
status: draft
summary: The filename patterns for blocks, assemblies and the other published files.
---

# Published USD filenames

The names of the files in an entity folder. Where the folder is, is in [[Project tree]].

## Structure

```
block        <name>_<block>.<usda|usdc>       char-robot_model.usda
assembly     <name>.usda                      char-robot.usda, kilo-0010.usda
payload      <name>_<block>_<payload>.usdc    char-robot_model_lod0.usdc, char-robot_model_proxy.usdc

rig HDA      <asset>_rig.hda                  char-robot_rig.hda
snapshot     <name>_<block>_v###.<ext>        in versions/ only
```

`<name>` is from [[Entity names]], and `<block>` is from [[Block names]].

## Notes

- A published filename never carries a version or an artist. SVN holds the history.
- The assembly is the file with no block token. What it contains is in [[Assembly file]].
- An assembly is always `.usda`.
- A block is `.usda` for composition, overrides and materials, and `.usdc` for animation and caches.
- Asset geometry goes in payload files, which are always `.usdc`, or for a small asset in a `.usdc` model block. `<payload>` names what the file holds: `lod0`, `lod1`, `proxy`. Only its block points at a payload file. Which prims carry payloads is in [[Asset scene graph]].
- Changing a file's extension counts as renaming it.
