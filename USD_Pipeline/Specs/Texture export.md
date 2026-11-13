---
type: spec
status: draft
summary: The EXR settings textures are written with, and the .rat file made from each one.
---

# Texture export

How the texture exporters write a texture. The names are in [[Texture filenames]].

## Structure

```
file          OpenEXR, scanline, no mip-maps
compression   ZIP                  every channel
bit depth     half float           bc, e, n, aormt, m, op
              32-bit float         disp
render file   one .rat per EXR     made with imaketx straight after the EXR is written
```

## Notes

- `.rat` is Houdini's own texture format. It is tiled and mip-mapped, so Karma reads only the tiles and the resolution it needs. Only Houdini and Karma can read it.
- Karma converts any texture that is not tiled and mip-mapped to `.rat` when a render starts. The exporter does this up front so farm nodes never do it.
- Compression is lossless. Lossy EXR compression (DWAA, DWAB, B44, Pxr24) is not used.

## Open

- Confirm that Karma uses the exporter's `.rat` and does not convert again. Check the render log at verbosity 3 or in the logging panel.
- Are `bc` and `e` written in ACEScg, or with their colour space set on the material? Karma's automatic colour space reads every EXR as linear.
