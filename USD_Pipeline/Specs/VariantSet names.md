---
type: spec
status: draft
summary: The standard VariantSets and the names of their variants.
---

# VariantSet names

The VariantSets an asset can carry. Using the same names on every asset lets tools read and switch them.

## Structure

```
lodVariant        LOD0, LOD1, LOD2 ...              LOD0 is the highest detail
damageVariant     pristine, damaged, destroyed
```

## Notes

- Modelling defines the VariantSets. The asset's assembly sets the default selection.
- Layout and lighting can pick another variant in their own block, without touching the asset.
- Use a VariantSet for versions of one asset. Two different assets are two files.

## Open

- Is a look or season VariantSet needed, and what is it called?
