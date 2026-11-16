---
type: spec
status: draft
summary: How assets, sets, sequences and shots are named.
---

# Entity names

The name of an asset, a set or a shot. Each is one token under the [[Filename grammar]], and every file belonging to the entity starts with it.

## Structure

```
asset       <category>-<name>         char-robot, prop-crate
set         set-<name>                set-living-room
shot        <sequence>-<shot>         kilo-0010

category    char | prop | env | veh | fx | mtl     defaults, open list
sequence    3 to 5 letters            kilo
shot        4 digits, in steps of 10  0010, 0020
```

## Notes

- A category only sorts assets: `env-` is an environmental asset such as a tree or a rock, `prop-` a hammer, `veh-` a car. Every category builds the same way.
- `set-` is the dressed space built from assets.
- Shots step by 10 so a shot can be inserted later without renumbering.
- Sequence codes are chosen once, at the start of a project.
- The categories are defaults. A project can add its own, and `set` is never one of them.

## Open

- Is the category list fixed for the pipeline, or chosen per project?
