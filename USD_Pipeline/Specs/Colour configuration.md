---
type: spec
status: draft
summary: The OCIO config, working space and render output colour space.
---

# Colour configuration

The project's colour settings. They are the same for every artist and for the farm.

## Structure

```
config             one pinned OCIO config, found through $OCIO
working space      ACEScg
view transform     ACES SDR video
render output      scene-linear ACEScg EXR, with no view transform baked in
```

## Notes

- `$OCIO` is one of the [[Environment variables]], so everyone resolves the same config.
- Nobody overrides the config on their own machine.
- A texture's colour space follows its channel token, which is in [[Texture filenames]].
- The view transform is for review and is applied after the render, in comp.

## Open

- Which config is pinned: the one bundled with Houdini, or a copy in `houdini/ocio/`?
