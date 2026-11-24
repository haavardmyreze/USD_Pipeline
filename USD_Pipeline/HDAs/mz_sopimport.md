---
type: hda
status: draft
hda: Havard::Lop/mz_sopimport::1.0
summary: A SOP Import LOP with every setting fixed except the SOP path.
---

# mz_sopimport

Imports SOP geometry onto the input stage.

## Structure

```
input 1       the stage to import into
soppath       the SOP to import

fixed         primpath       /<node name>
              path attribs   path, name
              packed prims   native instances

network       input → sopimport2 → output0
```

## Notes

- Everything except SOP Path is fixed inside the HDA.

## Open

- The prim is named after the node, for example `/mz_sopimport1`. [[Prim names]] asks for PascalCase, and [[Asset scene graph]] puts geometry under `/Root/Geo`.
- SOP Path defaults to `/stage/Bob_Model/sopnet1/_OUT`, left over from a test scene.
