---
type: hda
status: draft
hda: Havard::Lop/mz_pointinstancer::1.0
summary: The LOP that builds a PointInstancer from SOP points and prototype prims.
---

# mz_pointinstancer

Scatters the prims on its input over the points of a SOP.

## Structure

```
input 1            Prototypes: the stage holding the prototype prims

primitive_name     default RockScatter
Import SOP Points  soppath (default ../null1)      pointsopgroup
Prototypes         protopattern (default %kind:component)
                   newprotoindexsrc   none | random | intattr | strattr
                   newseed | newintattr (protoindex) | newstrattr (protoname)
                   makeinstanceable

result             /<primitive_name>                      Xform, kind group
                   └── PointInstancer
                       └── Prototypes/<prototype>         copies of the input prims

network            input → pointinstancer1 → mz_create_parent_prim → output0
```

## Notes

- The parent prim is made by [[mz_create_parent_prim]].
- Positions, orientations, scales, velocities, accelerations and ids come from the points. Other point attributes become primvars.
- The source prims are hidden. Only the prototypes are copied into the instancer.
- Points are sampled at the current frame only.

## Open

- [[Instancing]] says PointInstancers are built in SOPs with Copy to Points and brought in with a SOP Import LOP. This HDA builds them in LOPs instead. Which one is the pipeline way?
- The HDA answers two of the [[Instancing]] open questions one way: prototypes live under `<instancer>/Prototypes`, and the instancer is `/<name>/PointInstancer`. Settle them there.
