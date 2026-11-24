---
type: spec
status: draft
summary: How prims are named in the scene graph.
---

# Prim names

The naming rule for every prim. Which prims exist, and where, is in [[Asset scene graph]] and [[World scene graph]].

## Structure

```
PascalCase      Root, Geo, Hero, CrateA, KeyLight, Main
```

## Notes

- No underscores and no spaces. This also sets prims apart from filenames, which are lowercase.
- A name says what the prim is for: `KeyLight`, not `Light1`.
