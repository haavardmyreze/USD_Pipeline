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

Nothing in a spec repeats its own structure. Worked examples, reasons and validation rules are not added while a spec is `draft`, because each one is another place to edit when the structure changes.

## Properties

| Property | Values |
| --- | --- |
| `type` | `spec`, or `meta` for notes about the vault. More types are added when they are needed |
| `status` | `stub`, `draft` or `decided`. A `stub` is a placeholder whose contents are not worked through yet. Only a person sets `decided` |
| `summary` | One sentence saying what the note settles |
