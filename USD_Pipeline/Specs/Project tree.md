---
type: spec
status: draft
summary: Where published files live in the project tree.
---

# Project tree

Published data, kept in SVN and reached through `$PROJECT` (see [[Environment variables]]). Working files are in the [[Work tree]]. What the files are called is in [[Published USD filenames]].

## Structure

```
$PROJECT/
├── assets/
│   └── [<sub-folder>/]
│       └── <asset>/              char-robot/
│           ├── assembly
│           ├── block(s)
│           ├── rig HDA           if rigged
│           └── tex/
├── sets/
│   └── [<sub-folder>/]
│       └── <set>/                set-living-room/
│           ├── assembly
│           ├── block(s)
│           └── tex/
├── shots/
│   └── <sequence>/               kilo/
│       └── <shot>/               0010/
│           ├── assembly          the shot root
│           ├── block(s)
│           └── cache/
├── library/
├── houdini/
│   ├── otls/                     project-wide tools
│   ├── ocio/                     colour config
│   └── packages/                 project environment
└── docs/
```

## Notes

- The sub-folder is optional, and only for assets and sets. Its name may also use underscores, such as `_global`.
- An assembly and its blocks sit directly in the entity folder.
- `tex/`, `materials/`, `cache/` and `versions/` appear only where an entity needs them.
- A file belongs here if anything resolves it by path. Otherwise it belongs in the work tree.

## Open

- Can sub-folders nest?
- Must asset and set names be unique across sub-folders?
- Do shots get a `tex/` folder?
