---
type: spec
status: draft
summary: The prim hierarchy under /World that every set and shot authors into.
---

# World scene graph

The prim hierarchy of a composed set or shot. What an asset looks like inside is in [[Asset scene graph]]. How prims are named is in [[Prim names]]. What types and kinds mean is in [[Schemas]] and [[Kind]].

## Structure

```
prim              type             kind
/World            Xform            assembly
  /Characters     Scope            group
    /<Instance>   Xform            component
  /Props          Scope            group
    /<Instance>   Xform            component
  /Environment    Scope            group
    /<Instance>   Xform            component
  /FX             Scope
  /Cameras        Scope
    /<Camera>     Camera
  /Lighting       Scope
    /<Light>      UsdLux light
/Render           Scope
  /<Settings>     RenderSettings
  /<Product>      RenderProduct
  /<Var>          RenderVar
```

## Notes

- Sets and shots author into the same structure.
- An instance's type and kind come from the asset's root through the reference. Whoever places the asset authors neither.
- A scope is a `group` only if it holds models. `FX`, `Cameras` and `Lighting` hold none, so they have no kind.
- Lights are any UsdLux type, such as `DomeLight` or `RectLight`.
- `/Render` holds the render settings. It is outside the model hierarchy and has no kind.
- An asset is referenced at `/World/<Scope>/<Instance>`: `Hero`, `CrateA`, `CrateB`. Repeats take letters, not numbers.
- Set dressing establishes `Props` and `Environment`. Layout establishes `Characters` and `Cameras`. Lighting establishes `Lighting` and `/Render`.

## Open

- Which prim names are used below `/Render`, and do products and vars nest?
- Who establishes `/World/FX`?
- Where do vehicles go?
- Can instances be grouped inside a scope, such as `/World/Props/Kitchen/Kettle`? If so, the grouping prim is an `Xform` of kind `group`.
- Do FX publishes ever arrive as referenced components? If so, `/World/FX` becomes a `group`.
