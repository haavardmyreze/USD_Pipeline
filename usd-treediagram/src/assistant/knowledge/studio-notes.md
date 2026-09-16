# Studio notes — folder structure, USD hierarchy, rendering

These notes are newer than the pipeline guide. Where the two disagree, these notes win.

## The Three Directories - Folder Structures

Each root resolves to the project's own folder on its storage, so the project code never appears in a path inside a scene file or comp script. All three roots must be reachable from every farm node.

**$WORK** is mentioned as "Suite Drive". This simply refers to the shared drive solution from Suite Studios. The pipeline does not require this specific solution - it could be any shared drive system - but we've had a very good experience using Suite.

**$PROJECT** is referred to as "SVN". This means the files live in version control, where we are specifically using the solution from TortoiseSVN.

| Root | Resolves to | Storage |
| --- | --- | --- |
| `$WORK` | `<suite-drive>/<project>` | Suite drive |
| `$PROJECT` | `<svn-checkout>/<project>` | SVN |
| `$OUTPUT` | `<nas>/<project>` | NAS |

### $WORK — suite drive, artist-facing

- $WORK/
    - 3d/
        - <tier>/ ← assets | sets | shots
            - <context>/ ← entity folder path, or a group name
                - [<task>/] ← owning folder; omitted if the context has one HIP
                    - `<context>_<task>[_<descriptor>]_<artist>_v###.hip`
                    - `geo/`  `sim/`  `render/`  … ← Houdini standard project folders
    - comp/
        - library/ ← elements shared across shots
            - <category>/
                - <element>/
        - shots/
            - <sequence>/
                - <shot>/
                    - [<task>/] ← owning folder; omitted if the shot has one script
                        - `<sequence>-<shot>_<task>[_<descriptor>]_<artist>_v###.<ext>`
                        - elements/ ← shot-specific stock, textures
                        - prerender/ ← working caches, disposable
    - proxy/ ← mirrors $OUTPUT below the root, exactly
        - <sequence>/
            - <shot>/
                - 3d/
                    - v###/
                        - `<sequence>-<shot>_3d[_<descriptor>]_v###.####.exr`
                - comp/
                    - v###/
                        - `<sequence>-<shot>_comp[_<descriptor>]_v###.####.exr`

### $PROJECT — SVN, USD publishes

- $PROJECT/
    - assets/
        - <asset>/ ← <category>-<name>
            - `<asset>_<block>.<usda|usdc>` ← blocks
            - `<asset>.usda` ← assembly
            - `<asset>_rig.hda` ← rigged assets only
            - tex/
                - `<asset>[_<descriptor>]_<channel>_<res>[.<udim>].<ext>`
            - materials/ ← Option B only
                - `<asset>_<material>.usda`
            - versions/ ← optional rollback
                - `<asset>_<block>_v###.<usda|usdc>`
    - sets/
        - <name>/
            - `set-<name>_<block>.<usda|usdc>` ← blocks
            - `set-<name>.usda` ← assembly
            - tex/
                - `set-<name>[_<descriptor>]_<channel>_<res>[.<udim>].<ext>`
            - cache/ ← only if a set block references a cache
                - `set-<name>_<block>[_<descriptor>][.####].<ext>`
            - versions/
                - `set-<name>_<block>_v###.<usda|usdc>`
    - shots/
        - <sequence>/
            - <shot>/
                - `<sequence>-<shot>_<block>.<usda|usdc>` ← blocks
                - `<sequence>-<shot>.usda` ← shot root
                - cache/
                    - `<sequence>-<shot>_<block>[_<descriptor>][.####].<ext>`
                - versions/
                    - `<sequence>-<shot>_<block>_v###.<usda|usdc>`
    - library/
        - materials/
            - `<material>.usda`
        - lights/
            - `<light-rig>.usda`
    - houdini/
        - otls/
            - `<tool>.hda`
        - ocio/
            - `config.ocio`
        - packages/
            - `project.json`

### $OUTPUT — NAS, render farm storage

- $OUTPUT/
    - <sequence>/
        - <shot>/
            - 3d/
                - v###/ ← own counter
                    - `<sequence>-<shot>_3d[_<descriptor>]_v###.####.exr`
                    - `manifest.json`
            - comp/
                - v###/ ← own counter
                    - `<sequence>-<shot>_comp[_<descriptor>]_v###.####.exr`
                    - `manifest.json`
            - encode/
                - v###/ ← no counter: the comp version it was made from
                    - `<project>_<sequence>-<shot>_encode[_<descriptor>]_v###.<ext>`
                    - `manifest.json`

## USD hierarchy

### Asset (referenced by sets and shots)

- /
    - <AssetName> (Xform, kind Component)
        - Geo (Scope)
            - <Mesh> (Mesh)
        - Mtl (Scope)
            - <Material> (Material)

### Shot / Set

- /
    - World (Xform, kind Assembly)
        - Characters (Scope)
            - <AssetName> (Xform, kind Component)
                - Geo (Scope)
                    - <Mesh> (Mesh)
                - Mtl (Scope)
                    - <Material> (Material)
        - Props (Scope)
            - <Asset> (Xform, kind Component)
        - Environment (Scope)
            - <Asset> (Xform, kind Component)
        - FX (Scope)
            - <Asset> (Xform, kind Component)
        - Cameras (Scope)
            - <Camera> (Camera)
        - Lighting (Scope)
            - <Light> (a light type, e.g. DomeLight, RectLight, DistantLight)
    - Render (Scope)
        - <Rendersettings> (RenderSettings)
            - Products (Scope)
                - <Renderproduct> (RenderProduct)
            - Vars (Scope)
                - <Aov> (RenderVar)

## Rendering the USD file

The render settings, including camera, resolution, AOVs, and sampling, are defined in the shot root. The output file path is constructed from several tokens. Some are already defined in the USD file, while some should be exposed as arguments for Husk, which will be supplied when initiating the render.

- **$OUTPUT** - argument from the render farm
- **<sequence>** - defined in render settings
- **<shot>** - defined in render settings
- **<descriptor>** - defined in render settings
- **<version>** - argument from the render farm

Output folder: `$OUTPUT/<sequence>/<shot>/3d/<version>/`

Output file: `<sequence>-<shot>_3d[_<descriptor>]_<version>.$F4.exr`

Render interface inputs (to be decided):

- USD file to render ← file path to the shot root to render
- Render Settings Primitive ← prim path to the render settings definition
- $OUTPUT ← file path to the output tree's root
- Version ← integer, formatted as "v###"
