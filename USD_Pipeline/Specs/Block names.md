---
type: spec
status: draft
summary: How a block is named, and the conventional names per tier.
---

# Block names

The block token in a published filename. It is one token under the [[Filename grammar]]. Where it sits in the filename is in [[Published USD filenames]].

## Structure

```
<block>     free-form, one token      model, fg-dressing, fx-sparks

Conventional names
asset       model, rig, lookdev
set         dressing, lighting, lookdev, fx
shot        layout, anim, fx, lighting
```

## Notes

- There is no closed list. Create the blocks an asset, set or shot needs.
- Use a conventional name where it fits, and a more specific one where it does not: `fg-dressing`, `room-a-lighting`.
- A block name says what the block's one concern is.
- `assembly` is not a block name. An assembly carries no block token.
