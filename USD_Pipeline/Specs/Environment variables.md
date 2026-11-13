---
type: spec
status: draft
summary: The project variables, what each points to, and where they are defined.
---

# Environment variables

The variables that locate the [[Project tree]] and the [[Work tree]] on any machine.

## Structure

```
$PROJECT     the project root, an SVN checkout
$WORK        the work root, on the shared work drive
$OUTPUT      the output root, where rendered frames go, typically on a NAS
$OCIO        the pinned OCIO config file
```

## Notes

- The variables are set per workfile, in Houdini's Aliases and Variables window (Edit menu), and saved with the HIP file.
- Where each kind of path is used is in [[File paths]].
- Which config `$OCIO` points at is in [[Colour configuration]].
