---
type: hda
status: draft
hda: Havard::Lop/mz_usd_rop::1.0
summary: The LOP that publishes a block or an assembly to the project tree.
---

# mz_usd_rop

Writes the input stage to its published path, then outputs a stage that loads the written file.

## Structure

```
input 1          the stage to publish

Export           project_root
                 tier              asset | set | shot
                 layer_category    block | assembly
                 sub_folder        name        block
                 file_extension    usda | usdc
                 artist            comment
                 status            placeholder | production_ready | locked
                 Save to Disk      trange, f, foffset      message
Import           composition_arc   sublayer | reference

output_path      asset, set   <project_root>/<tier>s/[<sub_folder>/]<name>/<name>[_<block>].<ext>
                 shot         <project_root>/shots/<seq>/<shot>/<name>[_<block>].<ext>
customLayerData  artist, comment, status, hip_file, rop_path, export_datetime_unix

network          input → configurelayer1 → usd_rop2            writes output_path
                 sublayer1 | reference1 of output_path → switch1 → output
```

## Notes

- Paths follow [[Project tree]] and [[Published USD filenames]]. Names are checked against [[Entity names]] and [[Block names]].
- Save to Disk stays disabled until every check passes. The failures are listed in Message.
- An assembly has no block token and is always `.usda`. A shot ignores the sub-folder.
- The output is not the input stage. It is a new stage that loads the file just written: as a sublayer, or as a reference to its default prim. Both reload after each save.
- The layer's start and end come from the frame range, and its FPS from `$FPS`.

## Open

- Project Root accepts an absolute path. [[mz_texture_rop]] insists on `$PROJECT`, as [[File paths]] asks.
- Status `locked` is not enforced: the ROP overwrites a locked file.
- The default prim is left as the input stage has it, and the reference import needs one.
- Checks run only from parameter callbacks, so values changed by script or expression are not checked again.
