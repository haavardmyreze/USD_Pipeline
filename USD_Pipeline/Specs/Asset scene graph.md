---
type: spec
status: draft
summary: The prim hierarchy inside every published asset.
---

# Asset scene graph

The prim hierarchy inside a published asset. Where the asset is placed in a scene is in [[World scene graph]]. How prims are named is in [[Prim names]].

## Structure

```
/<AssetRoot>        Xform       default prim
  /Geo              Scope       geometry
  /Mtl              Scope       materials
  /Rig              SkelRoot    UsdSkel assets only
    /Skel           Skeleton
```

## Notes

- The root prim is the asset name in PascalCase: `char-robot` becomes `CharRobot`.
- The `model` block authors the root and `Geo`, `lookdev` authors `Mtl` and the bindings, and `rig` authors `Rig`.
- Placed in a scene, everything below the root keeps its path: `/World/Characters/Hero/Geo/Head`.

## Open

- UsdSkel may need the meshes below the SkelRoot, and here `/Rig` sits beside `/Geo`. Test before any asset uses UsdSkel.
- Is there a convention for proxy and render geometry under `Geo`?
