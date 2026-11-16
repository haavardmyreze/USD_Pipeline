---
type: meta
summary: Entry point to the pipeline's Houdini digital assets.
---

# HDAs

The digital assets the pipeline is built with. Each page describes one HDA as it is now: its interface, what it writes and the network inside it.

## Solaris

- [[mz_usd_rop]]: publishes a block or assembly.
- [[mz_usd_loader]]: loads a published file as a sublayer or reference.
- [[mz_sopimport]]: SOP Import with everything but the SOP path fixed.
- [[mz_create_parent_prim]]: wraps a stage under one parent prim.
- [[mz_pointinstancer]]: builds a PointInstancer from SOP points and prototype prims.

## Copernicus

- [[mz_texture_rop]]: exports a texture and its `.rat`.

## Notes

- All are version `1.0` in the `Havard::` namespace.
- The libraries are in `~/houdini22.0/otls/` on one machine, not in the project.

## Open

- [[Project tree]] puts project-wide tools in `$PROJECT/houdini/otls/`. Move these there?
- Should the namespace be the project's or studio's rather than a person's?
- The labels differ: `Mz USD Rop`, `MZ USD Loader`, `Mz_PointInstancer`.
