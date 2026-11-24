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
├── content/
│   ├── <project>/                    robot-film/
│   │   ├── assets/
│   │   │   └── [<sub-folder>/]
│   │   │       └── <asset>/          char-robot/
│   │   │           ├── assembly
│   │   │           ├── block(s)
│   │   │           ├── payload(s)    geometry
│   │   │           ├── rig HDA       if rigged
│   │   │           └── tex/
│   │   ├── sets/
│   │   │   └── [<sub-folder>/]
│   │   │       └── <set>/            set-living-room/
│   │   │           ├── assembly
│   │   │           ├── block(s)
│   │   │           └── tex/
│   │   └── shots/
│   │       └── <sequence>/           kilo/
│   │           └── <shot>/           0010/
│   │               ├── assembly      the shot root
│   │               ├── block(s)
│   │               └── cache/
│   ├── <other project>/              migrated from another project
│   └── library/                      shared by every project folder
├── houdini/
│   ├── otls/                         project-wide tools
│   ├── ocio/                         colour config
│   └── packages/                     project environment
└── docs/
```

## Notes

- `content/` holds one folder per project, like the content folder in Unreal Engine. This project's own work goes in a folder named after it. Work migrated from another project keeps that project's folder, so its names never clash with ours.
- A project folder can be copied into another project unchanged, because the paths inside published files are relative (see [[File paths]]). Anything it points at outside itself, such as `library/`, has to come with it.
- `houdini/` and `docs/` belong to the whole project and stay outside `content/`.
- The sub-folder is optional, and only for assets and sets. Its name may also use underscores, such as `_global`.
- An assembly and its blocks sit directly in the entity folder.
- `tex/`, `materials/`, `cache/` and `versions/` appear only where an entity needs them.
- A file belongs here if anything resolves it by path. Otherwise it belongs in the work tree.

## Open

- Can sub-folders nest?
- Must asset and set names be unique across sub-folders?
- Must they be unique across project folders? Two `char-robot` assets would share an `assetInfo` name.
- Do shots get a `tex/` folder?
