---
type: spec
status: draft
summary: The prim hierarchy inside every published asset.
---

# Asset scene graph

The prim hierarchy inside a published asset. Where the asset is placed in a scene is in [[World scene graph]]. How prims are named is in [[Prim names]]. What types and kinds mean is in [[Schemas]] and [[Kind]].

## Structure

```
prim              type                 kind              payload
/Root             Xform                component
  /Geo            Scope
    /Render       Scope                                  one per LOD
      /<Part>     Xform                (subcomponent)
        /<Mesh>   Mesh
    /Proxy        Scope                                  one
      /<Part>     Xform
        /<Mesh>   Mesh
  /Mtl            Scope
    /<Material>   Material
      /<Node>     Shader | NodeGraph
  /Rig            SkelRoot
    /Skel         Skeleton
```

## Notes

- The root prim is the default prim, and is always named `Root`. Its `assetInfo` carries the asset's name, such as `char-robot`.
- Geometry sits behind payloads. Everything else stays above them, so an unloaded asset still has its kind, variants, purposes, materials and an `extentsHint` on `Root`.
- Each `lodVariant` variant payloads its own file onto `Render`. Without purposes, the payload goes on `Geo`.
- A payload file's default prim is named after the prim it lands on: `Render`, `Proxy` or `Geo`.
- A small asset made by one artist can skip payload files. Its model block is then `.usdc`, and payloads into its own `class` prims, named like the payload files: `Lod0`, `Proxy`.
- Every asset root is a `component`, whatever its category. The root is the only model in an asset: nothing below it is a `component`, `group` or `assembly`.
- `Render` and `Proxy` exist only in assets with purposes. Each authors its purpose, `render` or `proxy`, and its children inherit it.
- `Proxy` has its own parts. It does not mirror the parts in `Render`.
- Without purposes, parts and meshes sit directly under `Geo`.
- Parts are optional, nest to any depth and are `Xform`, never `Scope`. A mesh can also sit directly under `Geo`, `Render` or `Proxy`.
- `subcomponent` is optional. It goes only on a part someone needs to pick or address on its own, such as a door or a wheel.
- The prims below a `Material` are the `Shader` and `NodeGraph` prims Houdini authors.
- The `model` block authors the root, `Geo`, the purpose scopes, the variants and the payload arcs. The payload files hold the parts and meshes. `lookdev` authors `Mtl` and the bindings, and `rig` authors `Rig`, which only UsdSkel assets have.
- Placed in a scene, the root takes the instance's name and everything below it keeps its path: `/World/Characters/Hero/Geo/Render/Head`.

## Open

- UsdSkel may need the meshes below the SkelRoot, and here `/Rig` sits beside `/Geo`. Test before any asset uses UsdSkel.
