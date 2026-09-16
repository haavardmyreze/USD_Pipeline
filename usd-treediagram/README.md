# USD Tree Diagram

Draw USD scene graph trees and layer flowcharts for documentation, and save
them as PNG. Trees look exactly like the prim tree in `usd-refgraph`, with
Houdini's icons, connector lines, flags and selection; flowcharts look like
its reference graph. Nothing here reads real USD: you type the structure, and
the picture follows.

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

Drag the dividers between the columns to resize the sidebar, the editor and
the settings; double-click a divider to reset it. Widths are remembered.

In the preview, click a row to jump to its line, double-click to open or close
it, and Shift-click to move the selection highlight there.

## Writing a flowchart

Switch **Diagram** to **Flowchart** (or put `#! mode=graph` in the outline) to
draw layers and the arcs between them, as usd-refgraph's graph does: columns
left to right, pipes that share a trunk per arc kind, tinted cards, and a
dash pattern for each kind of arc.

```text
zulu-0010.usda  shot  root  status=ready  artist=anna
zulu-0010.usda -> layout.usda  sublayer
zulu-0010.usda -> anim.usda  sublayer
layout.usda -> char-test.usda  reference
anim.usda -> char-test.usda  reference
char-test.usda  asset  assembly  "assembly"
char-test.usda -> char-test_model.usda -> sim.0001.usda  payload
old_hero.usda  missing
```

A line with `->` is one or more arcs, and the word after the last node is the
arc kind: `sublayer` (the default), `reference` or `ref`, `payload`, `clip`,
`texture` or `asset`, and `other`. Nodes appear the first time they are
named; a line without an arrow decorates one. Quote names with spaces.

| Node word | Draws |
| --- | --- |
| `asset` `set` `shot` | The tier tint |
| `color=blue` | Any other tint: green, red, yellow, pink, teal, indigo, gray |
| `root` | The blue root outline |
| `assembly` `block` | A bold name with the layers mark, or a quieter name |
| `missing` `template` | A dashed red card, or the placeholder mark |
| `status=ready` `artist=anna` | The status dot (placeholder, ready, locked) and a name |
| `"text"` | A second line on the card |
| `icon=camera` | A Houdini icon before the name |
| `selected` | The selection outline |

A layer reached by more than one arc is drawn once, with a `2×` badge; the
extra arcs are fainter cross links. **Arc legend** adds a key to the kinds
used, and **Dotted grid** the stage's grid. Click a node to find its line, and
Shift-click to select it. If the outline has arrows, Open and the command line
treat it as a flowchart even without `#! mode=graph`.

## Assistant

**Assistant** in the sidebar opens a chat with Claude Haiku 4.5 that builds
diagrams for you: "a flowchart of char-robot's blocks", "add an fx block to
this", "a tree of the shot scene graph with two characters". It draws straight
into the editor, and the preview builds as the outline is written. If the
tool cannot read a line, the assistant is told and corrects it. Ctrl+Z in the
editor undoes whatever it drew. It also answers questions about the pipeline.

It works from the studio's own documents, bundled into its instructions:

- `../docs/pipeline-guide.md`, read at build time, so it follows the guide as
  it currently stands;
- `src/assistant/knowledge/studio-notes.md`: the three folder trees
  (`$WORK`, `$PROJECT`, `$OUTPUT`), the USD hierarchy and render output paths,
  which are newer than the guide and win where the two disagree.

Edit either file to change what it knows; the instructions themselves are in
`src/assistant/prompt.ts`.

It needs an Anthropic API key, entered in the panel. The key stays in the
browser and is sent only to the Anthropic API: for the tab's lifetime, or on
this computer if **Remember** is ticked. The documents come to roughly 35,000
tokens, sent with every question but cached, so the first question in a while
costs a few cents and later ones a fraction of that.

## Exporting

**Save PNG** (or Ctrl+S) writes the image at the chosen resolution; 2× suits
most documentation. **Copy image** puts it on the clipboard for pasting
straight into a document.

Each saved PNG carries its outline and settings inside the file. Drop it back
onto the tool, or use **Open…**, to edit it again, so the image in the docs is
its own source. Plain `.txt` outlines open the same way.

Diagrams are not stored in the browser. The page holds the one you are
editing, so save a PNG (or keep the outline as a `.txt`) of anything you want
to keep. New, a preset or Open asks before discarding unsaved changes, and so
does closing the tab. Only the look settings, panel widths and zoom are
remembered.

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
`mode` (tree, graph), `title`, `count`, `types`, `stripes`, `legend` and `grid`
(on, off), `width`, `margin`.

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
- **Alternating rows** (trees): faint shading on every other row.
- **Arc legend** and **Dotted grid** (flowcharts): a key to the arc kinds, and
  the stage's grid behind the chart.
- **Heading**: an optional title with a prim count, like the app's panel header.
- **Minimum width** and **Margin** control the image size.

The icons in `src/assets/houdini/` are SideFX's Houdini icons, copied from
usd-refgraph.
