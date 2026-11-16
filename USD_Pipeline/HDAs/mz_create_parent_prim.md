---
type: hda
status: draft
hda: Havard::Lop/mz_create_parent_prim::1.0
summary: The LOP that puts a stage's root prims under one new parent prim.
---

# mz_create_parent_prim

Defines one parent prim and grafts the input stage underneath it.

## Structure

```
input 1          the stage to wrap

parent_name      default Parent
primkind         the parent's kind
parentprimtype   default UsdGeomXform

result           /<parent_name>          <parentprimtype>, kind <primkind>
                 └── the input's root prims

network          primitive1 + input → graftstages1 → output0
```

## Notes

- Kinds are in [[Kind]]. [[mz_pointinstancer]] uses this HDA for its parent prim.

## Open

- Parent Name is not checked against [[Prim names]].
