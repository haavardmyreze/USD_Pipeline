---
type: concept
status: draft
summary: How Karma reads textures, and where RAT and EXR differ.
---

# Karma textures

How Karma loads and filters textures. How we write them is in [[Texture export]].

## Structure

```
.rat   Houdini texture library; mipmaps every channel
.exr   OpenImageIO; imaketx mipmaps one AOV only
other  converted to a mipmapped .rat beside the original
```

## Notes

- RAT and EXR are filtered by different libraries and can look different. One user test found the EXRs blurrier than the RATs.
- Karma converts any texture without mipmaps or tiles to a RAT at render time, unless `HOUDINI_TEXTURE_DISK_CACHE` turns it off. Writing the RAT at export moves that cost off the render.
- XPU loads textures in tiles, on demand. Textures used by lights are loaded whole.
- XPU filters with OptiX hardware filtering, which can give artifacts in normal maps. Cubic filtering on the MtlX Image node fixes it.
- XPU has no Ptex. UDIMs are limited to 10 × 10 tiles by default.
- `KARMA_XPU_MAX_SHADER_TEXTURE_RES` caps texture resolution without touching materials.

## Sources

- [Karma User Guide: Textures](https://www.sidefx.com/docs/houdini/solaris/kug/textures.html)
- [Karma XPU: Textures](https://www.sidefx.com/docs/houdini/solaris/karma_xpu.html)
- [Forum: .rat vs .exr in Karma](https://www.sidefx.com/forum/post/373221/)
