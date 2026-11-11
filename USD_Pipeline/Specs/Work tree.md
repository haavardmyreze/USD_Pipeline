---
type: spec
status: draft
summary: Where HIP files and everything that feeds them live on the work drive.
---

# Work tree

HIP files and what feeds them, on the shared work drive, reached through `$WORK` (see [[Environment variables]]). It is not in SVN. Published data is in the [[Project tree]]. What a HIP is called is in [[HIP filenames]].

## Structure

```
$WORK/
└── <tier>/                   assets, sets or shots
    └── <context>/            one entity, or a named group
        └── [<task>/]         the owning folder
            ├── HIP versions
            └── geo/  sim/  render/  ...
```

## Notes

- The owning folder holds every version of one HIP and everything that HIP depends on.
- The task level is left out when a context has only one HIP.
- A context for one entity mirrors that entity's path in the project tree: `shots/kilo/0010/`.
- A context for a group of entities gets a descriptive name: `props-batch-a/`.
- Inside the owning folder, use Houdini's standard project folders, so `$HIP/geo` and the other defaults just work.
- Nothing resolves a file here by path, so it can be reorganised freely.

## Open

- Does the work tree mirror the optional sub-folder for assets and sets?
- Is a HIP with a descriptor (`kilo-0010_anim_blocking_erik_v002.hip`) a version of the anim HIP, or a second HIP with its own folder?
