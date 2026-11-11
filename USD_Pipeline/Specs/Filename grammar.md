---
type: spec
status: draft
summary: The token rule every filename and folder name follows.
---

# Filename grammar

The one rule behind every filename in the pipeline. The patterns built from it are in [[Published USD filenames]], [[HIP filenames]] and [[Texture filenames]].

## Structure

```
<token>_<token>_<token>.<ext>

token    one or more words joined by hyphens      char-robot, fg-dressing
```

## Notes

- An underscore separates tokens. A hyphen joins words inside a token. Neither does the other's job.
- Lowercase only. Allowed characters: `a-z 0-9 _ - .`
- No spaces, no dates, and no words like `final`, `latest`, `new`, `test` or `fix`.
- No double underscores. When an optional token is left out, its underscore goes too.
- Folder names follow the same rules, except sub-folders, which are in [[Project tree]].
