---
type: spec
status: draft
summary: The filename pattern for HIP files, including artist and version.
---

# HIP filenames

The name of a working file. Where it lives is in [[Work tree]].

## Structure

```
<context>_<task>[_<descriptor>]_<artist>_v###.hip

kilo-0010_anim_erik_v003.hip
kilo-0010_anim_blocking_erik_v002.hip
props-batch-a_model_alex_v002.hip
```

## Notes

- `<context>` is an entity name from [[Entity names]], or a group name when one HIP covers several entities.
- `<task>` is the work being done, not the block being written. One HIP can publish several blocks.
- A HIP always carries the artist and the version.
- The version is three digits and starts at `v001`. Increment it on any save you might want to return to.
