---
type: concept
aliases:
  - Model hierarchy
status: draft
summary: What USD kinds are, and the rules that make prims part of the model hierarchy.
---

# Kind

Kind is metadata that gives a prim a role, such as "this is one whole asset". It sits beside the prim's type and does not change it: an `Xform` can be a `component`, a `group` or neither. Types are in [[Schemas]].

## Structure

```
model                 abstract, never authored
  group               holds other models; the glue of the hierarchy
    assembly          an important group, often a published collection of assets
  component           one whole asset; a leaf model
subcomponent          a named, important part inside a component; not a model
```

```
/World              assembly or group
  /Props            group
    /CrateA         component
      /Geo          (no kind)
        /Lid        subcomponent
```

## Notes

- The rules below are what USD calls the model hierarchy.
- Only a `group` or an `assembly` can have model children. A `component` cannot contain a `component`, a `group` or an `assembly`.
- A prim is a model only if its parent is a `group` or an `assembly`. A `component` under an unkinded `Scope` is not a model.
- So the hierarchy must be unbroken from the root down to every component. A break is not an error: USD just stops treating the prims below it as models.
- A component nested inside a component is likewise not a model. It is plain scene data with a misleading label.
- Below a component, prims carry no kind, or `subcomponent` for a part worth picking or addressing on its own.
- Tools rely on kind. Houdini's viewport selects by kind, and traversals can stop at models instead of walking every prim.
- Houdini's Component Builder authors `component` on the asset root. The Configure Primitive LOP sets kind on any prim.
- USD's `assembly` kind is unrelated to our [[Assembly file]]. Say "assembly kind" when you mean the USD one.
- In this vault, `group` always means the kind. An `Xform` that organises geometry inside an asset is a part, as in [[Asset scene graph]].
