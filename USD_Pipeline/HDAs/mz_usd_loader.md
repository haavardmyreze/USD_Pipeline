---
type: hda
status: draft
hda: Havard::Lop/mz_usd_loader::1.0
summary: The LOP that loads a published USD file and shows who published it.
---

# mz_usd_loader

Loads a USD file onto the input stage as a sublayer or a reference.

## Structure

```
input 1          the stage to load into

composition_arc  sublayer | reference
file             Reload File
Reference        primpath1
                 reftype1          file | payload | prim | inherit | specialize
                 instanceable1
                 filerefprim1      automaticPrim | defaultPrim | specific prim
metadata         Artist, Status, Comment, Default Prim

network          input → sublayer1 | reference2 → switch1 → output0
```

## Notes

- Metadata reads the `customLayerData` that [[mz_usd_rop]] writes, and the layer's default prim. It updates when File changes or Reload File is pressed.
- The Reference tab only shows when the arc is `reference`.
- Whether a reference should be instanceable is in [[Instancing]].

## Open

- The module also lists `upAxis`, `metersPerUnit` and the time codes, but Metadata does not show them.
