---
type: spec
status: draft
summary: What an assembly contains, and the order it lists its blocks in.
---

# Assembly file

The one file per asset, set or shot that lists its blocks. It is the file other work points at. A shot's assembly is called the shot root.

## Structure

```
#usda 1.0
(
    defaultPrim = "CharRobot"       # assets only
    # the stage metrics go here
    subLayers = [                   # strongest first
        @char-robot_lookdev.usda@,
        @char-robot_model.usdc@
    ]
)
```

Block order, strongest first:

```
asset     lookdev, model
set       lighting, lookdev, dressing
shot      lighting, fx, anim, layout, <set assembly>
```

## Notes

- An assembly holds no scene data of its own. It has only the sublayer list, the [[Stage metrics]], a default prim and default variant selections.
- A block listed earlier wins over one listed later.
- An asset's assembly is referenced at a prim path. A set's assembly is sublayered by the shot root. The shot root is the file that gets rendered.
- The shot root sublayers the set itself. The set does not arrive through the layout block.
- A simple asset built by one artist can be a single file published as the assembly, with no blocks.

## Open

- Where does a `rig` block sit in an asset's order?
- Where does an `fx` block sit in a set's order?
