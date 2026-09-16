# USD Tree Diagram

Draw USD scene graph trees for documentation and save them as PNG. The trees
look exactly like the prim tree in `usd-refgraph`, with Houdini's icons, the
same connector lines, flags and selection, but nothing here reads real USD.
You type the structure, and the picture follows.

## Run

```bash
npm install
npm run dev
```

Or double-click `usd-treediagram.bat`. The tool opens at http://localhost:5180.

## Writing a tree

One prim per line, indented to nest. After the name, in any order:

```text
World  Xform  kind=assembly
  chars  Scope  kind=group
    hero  Xform  kind=component  +ref +payload  selected  "the published asset"
      geo  Scope  closed
    crowd  PointInstancer  +instance
  ... 4 more not shown
```

| Token | Draws |
| --- | --- |
| `Type` | Any word starting with a capital: `Xform`, `Mesh`, `Material`, `DomeLight_1` |
| `kind=component` | The kind's stars, replacing the icon on `Xform`, `Scope` and typeless prims |
| `+ref` `+payload` `+unloaded` | Houdini's reference and payload flags (`+unloaded` is greyed) |
| `+inherit` `+specialize` `+relocate` | These arcs, as words |
| `+instance` | The instanceable flag |
| `{set=value}` | A variant pill; several selections show a count |
| `over` `class` | The specifier, in italics |
| `inactive` | Struck through, with a grey icon |
| `proxy` | Dimmed, like a prim inside an instance |
| `closed` | A closed chevron; any children are not drawn |
| `selected` or `*` | The blue selection highlight |
| `icon=camera` | Any Houdini icon, by type name, kind or file name |
| `"text"` | A callout to the right of the row |
| `... text` | A grey note row |
| `# comment` | Ignored |

The editor draws hierarchy lines in the indentation, so the nesting is easy
to follow. The `?` button above the editor shows this table. Tab and Shift+Tab indent
and outdent the current line or selection.

In the preview, click a row to jump to its line, double-click to open or close
it, and Shift-click to move the selection highlight there.

## Exporting

**Save PNG** (or Ctrl+S) writes the image at the chosen resolution; 2× suits
most documentation. **Copy image** puts it on the clipboard for pasting
straight into a document.

Each saved PNG carries its outline and settings inside the file. Drop it back
onto the tool, or use **Open…**, to edit it again, so the image in the docs is
its own source. Plain `.txt` outlines open the same way.

Diagrams are kept in the browser's local storage, per browser and per machine.
Save a PNG of anything you want to keep.

## Rendering from the command line

`npm run render` turns outline files into PNGs without opening the app. It
runs the app's own drawing code in the installed Chrome or Edge, headless, so
the result matches a PNG saved from the app, outline included.

```bash
npm run render -- trees/shot.txt                    # writes trees/shot.png
npm run render -- trees/shot.txt -o docs/shot.png --theme light
npm run render -- trees/ --out-dir docs/img         # every .txt/.tree in a folder
npm run render -- docs/img/shot.png --theme light   # restyle a saved PNG from its own outline
npm run render -- trees/shot.txt --check --strict   # validate only
```

`npm run render -- --help` lists every option. An outline file can carry its
own settings on a `#!` line, which the app's Open… reads too; command-line
flags win over it:

```text
#! theme=light frame=none scale=2 title="Prims"
```

Settings: `theme` (dark, light), `frame` (panel, flat, none), `scale`,
`title`, `count`, `types` and `stripes` (on, off), `width`, `margin`.

To use a different Chromium-based browser, set `TREEDIAGRAM_BROWSER` to its
executable.

### Asking Claude

A personal Claude Code skill, `usd-treediagram`, in
`~/.claude/skills/usd-treediagram/`, teaches Claude this syntax and command.
From any project, ask for a diagram ("add a tree of the shot stage to this
page") and Claude writes the outline, renders it and checks the image.

## Look

- **Theme**: Dark matches usd-refgraph; Light suits white documentation pages.
- **Frame**: a rounded panel, a flat background, or a transparent background.
- **Alternating rows**: faint shading on every other row (on by default).
- **Heading**: an optional title with a prim count, like the app's panel header.
- **Minimum width** and **Margin** control the image size.

The icons in `src/assets/houdini/` are SideFX's Houdini icons, copied from
usd-refgraph.
