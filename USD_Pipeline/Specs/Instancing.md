---
type: spec
status: draft
summary: How repeated assets are instanced in a set or shot.
---

# Instancing

How repeated assets are instanced in a set or shot. Where placed assets sit is in [[World scene graph]].

## Structure

```
plain reference          a handful of hand-placed assets
instanceable reference   5 to 200 repeats that vary only at the instance root
PointInstancer           hundreds or more, procedural: foliage, rocks, ground cover, crowds
```

## Notes

- `instanceable` is authored on the prim that carries the reference, by whoever places the asset: set dressing or layout. An asset never sets it on itself.
- An instance can vary its transform, visibility and material binding on its root prim. Prims inside an instance cannot be overridden.
- Each distinct variant selection makes its own prototype, so the instances of one asset share a handful of selections at most.
- PointInstancers are built in SOPs with Copy to Points and brought into Solaris with a SOP Import LOP.

## Open

- Where is the line between instanceable references and a PointInstancer, between 200 and a few hundred?
- Where do PointInstancer prototypes live?
- How are instancer prims and their prototypes named?
- Which department authors PointInstancers?
