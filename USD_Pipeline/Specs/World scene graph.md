---
type: spec
status: draft
summary: The prim hierarchy under /World that every set and shot authors into.
---

# World scene graph

The prim hierarchy of a composed set or shot. What an asset looks like inside is in [[Asset scene graph]]. How prims are named is in [[Prim names]].

## Structure

```
/World              Xform
  /Characters       Scope
  /Props            Scope
  /Environment      Scope
  /FX               Scope
  /Cameras          Scope
  /Lighting         Scope
/Render                       render settings
```

## Notes

- Sets and shots author into the same structure.
- An asset is referenced at `/World/<Scope>/<Instance>`: `Hero`, `CrateA`, `CrateB`. Repeats take letters, not numbers.
- Set dressing establishes `Props` and `Environment`. Layout establishes `Characters` and `Cameras`. Lighting establishes `Lighting` and `/Render`.

## Open

- Which prim names are used below `/Render`?
- Who establishes `/World/FX`?
- Where do vehicles go?
- Can instances be grouped inside a scope, such as `/World/Props/Kitchen/Kettle`?
