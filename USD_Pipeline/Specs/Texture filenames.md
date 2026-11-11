---
type: spec
status: draft
summary: The filename pattern for textures, with the channel and resolution tokens.
---

# Texture filenames

The name of a texture in an entity's `tex/` folder. It follows the [[Filename grammar]].

## Structure

```
<name>[_<descriptor>]_<channel>_<resolution>[.<udim>].<ext>

char-robot_bc_4k.exr
char-robot_body_n_2k.exr
char-robot_aormt_4k.1001.exr

channel       bc       base colour                      colour-managed
              n        normal                           raw
              aormt    AO, roughness, metalness (RGB)   raw
              m        mask                             raw
              e        emission                         colour-managed
              op       opacity                          raw
              disp     displacement                     raw
resolution    128 | 256 | 512 | 1k | 2k | 4k | 8k
ext           exr
render file   <texture>.exr.rat     beside the EXR
```

## Notes

- `<name>` is the asset or set name from [[Entity names]].
- The channel list is closed. The channel also decides the texture's colour space.
- `aormt` is always AO in red, roughness in green and metalness in blue.
- `disp` is in scene units, not normalised. `op` and `m` are single-channel.
- The resolution list is closed. Below 1k the token is the pixel count.
- Materials point at the `.exr`, never at the `.rat`. How the `.rat` is made is in [[Texture export]].
