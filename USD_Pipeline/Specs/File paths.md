---
type: spec
status: draft
summary: Which kind of path is used in a HIP parameter and which inside a published USD file.
---

# File paths

How one file points at another. The rule differs on each side of a publish.

## Structure

```
In a HIP parameter          $PROJECT/content/robot-film/assets/char-robot/char-robot.usda

Inside a published USD      @char-robot_model.usdc@
                            @../../../sets/living-room/set-living-room.usda@
```

## Notes

- A HIP parameter uses the [[Environment variables]].
- A path inside a published USD file is relative to that file. (This is handled automatically by Solaris during export)
- USD does not expand environment variables, so a variable written into a published file only resolves inside Houdini.
- No absolute path appears on either side.
