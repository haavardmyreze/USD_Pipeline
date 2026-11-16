---
type: spec
status: stub
summary: The Karma engine and render settings every shot starts from.
---

# Render settings

The settings on the Karma Render Settings LOP that every shot starts from. Where the prims live is in [[World scene graph]]. The output colour space is in [[Colour configuration]].

## Structure

```
pixel oracle    uniform, on XPU
```

## Notes

- The pixel oracle follows [[Pixel oracle on XPU]], which is not yet confirmed.

## Open

- Is XPU the default engine, and when does a shot use Karma CPU instead?
- Primary and path traced samples for previews and finals?
- Which AOVs are standard?
- Is `KARMA_XPU_NUM_PER_DEVICE_BLENDING_THREADS` set in the project package?
