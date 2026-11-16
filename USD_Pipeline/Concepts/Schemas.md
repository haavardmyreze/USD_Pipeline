---
type: concept
aliases:
  - Types
  - Prim types
status: draft
summary: What USD schemas and prim types are, and how this pipeline uses them.
---

# Schemas

A schema says what a prim is and which properties it has. Without one, a prim is an empty container at a path.

## Structure

```
typed (IsA)   the prim's type, exactly one per prim    Xform, Scope, Mesh, Camera, Material, PointInstancer, SkelRoot
API           extra properties, any number per prim    MaterialBindingAPI, CollectionAPI, SkelBindingAPI
```

## Notes

- Typed schemas inherit. `Mesh` derives from `PointBased`, `Gprim`, `Boundable` and `Xformable`, so every mesh can be transformed.
- A `Scope` has no transform and an `Xform` does. Use an `Xform` only where something needs to move.
- Applied API schemas are listed in the prim's `apiSchemas` metadata. Solaris LOPs apply them for you: Assign Material applies `MaterialBindingAPI`.
- A schema is a contract, not a check. USD accepts a misspelled or missing property without an error, and tools simply do not find it.
- Every schema has a Python class, such as `UsdGeom.Mesh` or `UsdShade.MaterialBindingAPI`. Pipeline tools go through these classes, not raw attribute names.
- The Scene Graph Details pane in Houdini shows a prim's type and its applied API schemas. Check it first when a prim renders wrong.
- The pipeline uses only the schemas that ship with USD and Houdini. The types it fixes are in [[Asset scene graph]], [[World scene graph]] and [[Instancing]].

## Open

- Is the list of prim types allowed in published files closed, such as Xform, Scope, Mesh, Material, Shader, lights, Camera and PointInstancer, and checked by a validator? If so, the list becomes its own spec.
- Studio metadata on asset roots, such as asset name, version and publisher: `customData`, or attributes in a `myreze:` namespace?
- A custom schema waits until that metadata is a contract that tools must validate. Using the same property names from the start lets a later codeless schema adopt them.
