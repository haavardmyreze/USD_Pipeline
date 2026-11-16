---
type: meta
summary: How this vault is organised and how its notes are written.
---

# Vault conventions

This vault is the source of truth for the pipeline, for people and for LLMs building tools against it.

## One home per fact

Every tree, pattern and rule is written in exactly one note. Other notes link to it (`[[Project tree]]`) or embed it (`![[Project tree#Structure]]`). They never restate it.

## Specs stay light

A spec is short enough to change in a minute:

- **Structure** is the tree or pattern itself, in one code block.
- **Notes** are a few lines for what the structure cannot show.
- **Open** lists what is not settled yet.

A blank column in a structure block means none. Nothing in a spec repeats its own structure. Worked examples, reasons and validation rules are not added while a spec is `draft`, because each one is another place to edit when the structure changes.

## Folders

`Specs/` and `Concepts/` hold notes that apply to the whole pipeline. A folder named after a tool, such as `Karma/`, holds everything about that tool, whatever the note type. Each tool folder has a hub note with its own name.

## Findings

A finding is something we tested ourselves. It has three parts:

- **Finding** is what we saw.
- **Test** is how it was measured, or how it still needs to be.
- **Consequence** is the spec it changes.

A finding is only true for the build and hardware it was tested on, so `houdini` and `engine` are always filled in once it is measured.

## Properties

| Property | Values |
| --- | --- |
| `type` | `spec`, `concept` for background on how USD or a tool works, `finding` for a result we tested, or `meta` for notes about the vault. More types are added when they are needed |
| `status` | `stub`, `draft` or `decided`. A `stub` is a placeholder whose contents are not worked through yet. Only a person sets `decided`. A finding is `observed` until a measured test makes it `confirmed` |
| `summary` | One sentence saying what the note settles |
| `houdini`, `engine` | Findings only: the Houdini build and the Karma engine tested |
