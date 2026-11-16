---
type: hda
status: draft
hda: Havard::Cop/mz_texture_rop::1.0
summary: The Copernicus ROP that exports an asset texture as EXR and makes its .rat.
---

# mz_texture_rop

Writes its input image to the asset's `tex/` folder at a set resolution, then converts the EXR to `.rat`.

## Structure

```
input 1          the image to export

project_root     default $PROJECT
sub_folder       name       descriptor (optional)
type             bc | n | aormt | m | e | op | disp
resolution       128 | 256 | 512 | 1k | 2k | 4k | 8k
Advanced         bit_depth (half_float | 32_bit)     ociocolorspace     color_managed
Render to Disk   message

output_path      <project_root>/assets/[<sub_folder>/]<name>/tex/<name>[_<descriptor>]_<type>_<resolution>.exr

network          input → resample1 (square, resolution) → rop_image1    writes output_path
                 post-render: imaketx → <texture>.exr.rat
```

## Notes

- Names follow [[Texture filenames]] and the file settings follow [[Texture export]]. Names are checked against [[Entity names]] and [[Filename grammar]].
- Changing Type sets Color Managed and Bit Depth to match the channel. Render to Disk stays disabled until every check passes, and the failures are listed in Message.
- Project Root must start with a variable, as [[File paths]] asks.
- A `.rat` that is newer than its EXR is skipped. Up to 8 convert at once, and each one times out after 10 minutes.

## Open

- No UDIMs. [[Texture filenames]] allows `.<udim>`, but the path never adds one and the inner ROP has UDIM output off.
- Asset textures only. [[Project tree]] gives sets a `tex/` folder too.
- The Signature parameter is not connected to anything.
- The module's docstring names an OnLoaded script, but the HDA has none.
