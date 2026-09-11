# usd-refgraph

Point it at a USD file and it reads the project around it: what is published,
who published it, what state it is in, and what depends on what. Six sections —
**Overview**, **Workspace**, **Artists**, **Publishes**, **Workfiles** and
**Graph**.

The first five read the project; the **Graph** is where you go to walk it.
They are deliberately not wired together everywhere — the tables are for
reading, not for clicking through. The one crossing is the **Graph it** button
on an expanded entity in the Workspace, which is an explicit action rather than
a link hiding under a row.

## The files are the database

There is no project file. Publishing writes each layer's bookkeeping into the
layer itself, in `customLayerData`:

```
artist                "havard"
status                "placeholder" | "production_ready" | "locked"
comment               free text
hip_file              "workfile_havard_v001.hip"
rop_path              "/stage/Bob_Lookdev/mz_usd_rop2"
export_datetime_unix  "1788769845"
```

Combined with the naming convention — which says the entity and block a file
belongs to — that is enough to rebuild the whole production picture by walking
the tree. Nothing is stored twice, so nothing can drift from what is on disk.

Older `wip` / `ready` / `final` spellings are still understood and mapped onto
the current three.

`hip_file` is a free string, so the **Workfiles** tab is the only place that
reads any structure out of it. A trailing version token — `_v001`, `-v12`,
`.v3` — marks a file as one version of a workfile rather than a workfile of its
own, so every version groups under one box and separates by version inside it,
newest first. A separator before the `v` is required, so a name like
`shot_rev2.hip` is left alone.

Versions are told apart by the token exactly as authored: a project that has
written both `v01` and `v001` has two files on disk, and the tab shows two
versions rather than quietly merging them. `.hip` and `.hipnc` with the same
stem stay separate for the same reason.

**What has no home in USD, and so is not shown:** project name and code,
software versions, a team roster (the Artists tab shows who has actually
published), and anything schedule-related. Publishes is a history, not a plan.

![arc kinds: sublayer, reference, payload, value clip, texture](#)

## Why it is split in two

| Part | Language | Job |
| --- | --- | --- |
| `server/` | Python + `usd-core` | Opens layers, walks composition arcs, resolves asset paths, serves JSON |
| `src/` | TypeScript + Vite | The app you actually use |

The crawler has to be Python because OpenUSD's own bindings are the only
practical way to read `.usdc` crate files and to resolve asset paths the way USD
itself does. The viewer is TypeScript because that is where the interaction
lives. They talk over a small localhost JSON API.

### One vocabulary, both sides

Two files carry the shapes that must agree across the language boundary:

| | |
| --- | --- |
| `server/usd_refgraph/pipeline.py` | Reads `customLayerData` into a record |
| `src/shared/pipeline.ts` | The same reader, for layers the graph crawl hands through raw |

The project scan parses the record server-side, but the graph crawl returns
`customLayerData` untouched — so the viewer needs its own reader to describe a
node the way it describes a scanned layer. The two are deliberate mirrors,
including the older `wip` / `ready` / `final` spellings; change one and change
the other.

Inside the viewer, `src/client/ui/kit.ts` is the only thing that builds a card,
a table, a chip, a pill, an empty state or an expanding row, and
`src/client/ui/icons.ts` is the only place an icon is drawn. A page that styles
its own version of one of those is a page that will drift, so the kit is where
a new variant belongs.

## Quick start (Windows)

Double-click **`usd-refgraph.bat`**. The first run creates the Python
environment, installs OpenUSD and builds the viewer; later runs go straight to
the app. Leave the console window open while you use it — closing it stops the
server.

You can also **drop a project folder, or a single `.usda` file, onto the
launcher's icon** to open it directly.

For a right-click entry, run **`install-context-menu.bat`** once. It adds:

| Right-click | Menu entry | Opens |
| --- | --- | --- |
| A folder | *Open project in Reference Graph* | the whole tree, on the overview |
| Inside a folder | *Open project in Reference Graph* | that folder |
| `.usd` `.usda` `.usdc` `.usdz` | *Open in Reference Graph* | that layer's graph |

The folder entries are the ones you will use most: the app reads a project, so
the project folder is usually what you want to hand it.

It writes only to `HKEY_CURRENT_USER` — no administrator rights, no change to
which program owns the file type, and `uninstall-context-menu.bat` reverses it.
On Windows 11 the entries may sit under *Show more options*. Opening a second
thing hands it to the window already running rather than starting another
server.

On macOS or Linux use `./usd-refgraph.sh` instead.

> **This is a local tool.** The crawler reads files from your own disk and
> resolves relative paths against them, so it cannot be usefully deployed to a
> cloud host — a container there has no access to your project storage. Give
> people the folder, not a URL.

## Setup by hand

If you would rather not use the launcher:

```bash
python -m venv .venv
.venv/Scripts/pip install usd-core
npm install
```

On macOS or Linux the pip line is `.venv/bin/pip install usd-core`.

## Running it

```bash
npm run dev
```

That starts the Python API and the Vite dev server together and opens the app.
Stopping the dev server stops the backend with it.

For a build you can run without Node:

```bash
npm run build
cd server && ../.venv/Scripts/python -m usd_refgraph
```

The Python server then serves the built viewer itself, on
<http://127.0.0.1:8765>.

## Using it

**Open the project folder** — the one holding `assets`, `sets` and `shots`.
Browse to it and press **Use this folder**. Everything published inside is
scanned, and the graph opens on a shot root so you land on something.

From there the **Graph** tab lists every layer in a tree down the left side;
click one to draw its graph. Switching layers does not rescan the project.

You can still open a single file — drop it on the window, paste a path with
`Ctrl`+`V`, type one in the picker, or deep-link it with `?path=`. Opening a
file from inside a project tree scans that project too.

### About dropping

A browser never hands over a dropped file's real path — only its name and bytes
— and the crawler needs the path to anchor relative references like
`../../assets/char-bob.usda`. So a drop is resolved in three steps:

1. Some sources (VS Code, many file managers, a dragged link) attach a `file://`
   URI to the drag. That is the exact path, so it is used directly.
2. Otherwise the backend searches for a file of that name and size, starting in
   the directories you have already worked in and widening one parent at a time,
   stopping at the first level that yields a hit. Dropping `char-bob.usda` while
   a shot is open finds it in `assets/char-bob/` after scanning a few dozen
   entries.
3. If several files share the name, you pick which one. If none is found, the
   picker opens with the name filled in.

**Dragging from Windows Explorer takes route 2**, since Explorer attaches no
path to the drag. Pasting a path is always exact, and is usually quicker if you
already have the path on the clipboard.

| | |
| --- | --- |
| Click a node | Open its details |
| Double-click a node | Re-crawl from that file as the new root |
| Drag a node | Move it and everything under it; edges follow |
| `Alt`-drag a node | Move just that card |
| Drag the background | Pan |
| Wheel | Zoom at the cursor |
| Hover a node | Light up everything it reaches, and everything that reaches it |
| `/` | Filter box |
| `F` | Fit to view |
| `1`–`6` | Jump to a section |
| `R` | Rescan from disk |
| `O` | Open a file or project folder |
| `Ctrl`+`V` | Open the path on the clipboard |
| `?` | Show the shortcut sheet |
| `Esc` | Close, or clear the selection |

The same sheet is on the **Shortcuts** button at the foot of the navigation,
and it is generated from the list the keys are bound against, so it cannot
drift out of date.

## How it looks

The visual language follows Apple's Human Interface Guidelines and the
translucent, floating chrome of macOS 26:

- **Apple's system colours**, dark variants. Status keeps amber, blue and green
  and the tiers keep purple, cyan and orange — each in Apple's exact version of
  that hue. The interface accent is systemBlue.
- **Type is SF on a Mac and Inter elsewhere.** SF cannot be shipped off Apple
  platforms; Inter was drawn to the same proportions and has an optical-size
  axis, so large numbers take the display cut and body text the text cut. It
  is bundled, so it works offline.
- **Section headers are sentence case**, semibold and secondary, instead of
  small tracked capitals.
- **The navigation is a floating glass sidebar** with a blue selection, the
  toolbar has no strip of its own, and its controls are capsules.
- **Content sits on Apple's grouped grays** over a black window; separators are
  hairlines.
- **Buttons are filled capsules.** The primary action is solid blue; plain
  actions are blue text. Status pills are tinted and borderless.
- **The Workspace's Assets / Sets / Shots switch is a segmented control.**

## How it moves

The interaction follows Apple's approach to fluid interfaces (the
[`apple-design`](https://github.com/emilkowalski/skills) skill, distilled from
WWDC's *Designing Fluid Interfaces*). In practice:

- **The graph's camera runs on springs, from the live value.** Fit, zoom and
  centring all spring into place, critically damped so nothing overshoots —
  and all of them can be grabbed mid-flight. Pressing on the graph while it is
  still gliding stops it exactly where it is on screen and pans from there.
- **Pans carry momentum.** Let go of a quick drag and the view keeps going,
  handed the pointer's own velocity and aimed at where that throw would come to
  rest. A slow, deliberate drag stops where you put it. A throw cannot lose the
  graph: it eases to a halt with a strip still on screen.
- **The wheel tracks your hand 1:1**; the zoom buttons and `F` spring.
- **Fit lives with the zoom controls**, on the stage, beside the thing it moves.
- **The inspector floats over the graph** as a translucent panel instead of
  taking a column, and the camera frames and centres around it.
- **Project pages scroll beneath a translucent header.** A soft edge appears
  under it only once something is actually passing underneath, and filtering
  or expanding a row keeps your place instead of jumping back to the top.
- **Everything answers the press, not the release.** Buttons give a little
  under the pointer; wide rows darken.
- **Sheets and panels leave the way they came in**, and a drag, sheet or
  panel can be reversed partway.

It also respects what you have told your system:

| Setting | Effect |
| --- | --- |
| Reduce motion | No sliding, scaling or momentum — changes cross-fade instead |
| Reduce transparency | Every translucent surface turns solid |
| Increase contrast | Firmer borders and brighter secondary text |
| Browser text size | The whole layout scales with it — type and spacing are in `rem` |

## Reading the graph

The graph is laid out as a tree, left to right. Every file gets one *tree
parent* — the layer that first brings it in — and sits inside that parent's
vertical band, so a subtree always occupies a contiguous run of rows.

Arcs leave a parent's right edge, run to a shared vertical trunk in the gutter,
then turn into each child. Children are grouped onto one trunk per arc kind, and
stacked in the same order the trunks are nested — sublayers, then references,
payloads, value clips and textures. That ordering is what keeps the trunks from
crossing each other's branches.

A file pulled in by more than one layer is drawn once, under a single parent,
with a `2×` badge on the card. Its other arcs appear as thin dashed cross links,
so they read as secondary to the structure rather than competing with it.

## Assemblies only

The **Assemblies** toggle reduces the graph to assembly files — the ones
downstream work actually points at.

It follows the pipeline guide's naming convention (§15.5, §15.10): `_` is the
only token separator, so **blocks carry a block token and assemblies do not**.

| | |
| --- | --- |
| `char-robot.usda` | asset assembly |
| `set-living-room.usda` | set assembly |
| `kilo-0010.usda` | shot root |
| `char-robot_model.usdc` | asset block |
| `kilo-0010_fx-sparks.usdc` | shot block |
| `char-robot_body_bc_4k.exr` | texture (§15.9) |

Matching is case-sensitive and rejects a version or artist in a published name,
so `Char-Robot.usda` and `char-robot_model_v002.usda` are reported as
unconventional rather than quietly accepted.

Assemblies are marked on the graph whether or not the filter is on: they carry a
stacked-layers glyph and a brighter name, and the blocks between them sit a step
back. The full classification — *shot root*, *asset assembly*, *set block* — is
in each file's detail panel.

Each node also carries the **artist** who published that layer and a **status
dot**, both read from its own `customLayerData` by the same reader the project
pages use — so a layer that is a placeholder in the Workspace is a placeholder
on the graph, in the same amber.

## Colour means one thing, and lines mean the other

The graph shows two things at once — what a file *is*, and how it was *reached*
— and they use different visual channels on purpose. A picture that says two
things in colour says neither quickly.

**Cards carry colour.** A card's tint is the tier the file belongs to: violet
for an asset, cyan for a set, orange for a shot. Areas hold colour well, and a
tint still reads when the whole graph is zoomed out to fit, which is exactly
when you want to see how a scene divides. A file outside the three tiers keeps
the plain card surface. The rail carries a key under **Tiers**.

**Wires carry line style.** Every arc is drawn in the same neutral grey and
told apart by its stroke:

| | | |
| --- | --- | --- |
| Sublayer | the one solid line | the structural spine that holds a stage together |
| Reference | long dashes | |
| Payload | short dashes | half the reference's dash, twice its cadence |
| Value clip | dash-dot | the only pattern with two different marks in it |
| Texture / asset | fine faint stipple | hangs off the composition rather than forming it |
| Other | tight ticks | the catch-all, matching nothing else |

They are told apart by *rhythm*, not by thickness — two solid lines of
different weight are nearly the same line. Only the sublayer is left solid,
which makes the spine of a stage findable at a glance.

The **Arcs** panel draws a real sample of each, using the same CSS class as the
wires themselves, so the key cannot drift from the picture.

Dash patterns are drawn in graph space, so they shrink with the view. Zoomed
right out the kinds converge — which is the point at which you are reading tier
colour and the shape of the tree anyway, not individual arcs.

Two marks are notes *about* an arc rather than kinds of arc, so each keeps
whatever pattern its kind gave it and changes only colour or weight: a
**missing** target turns the line red, and a **cross link** — a second arc into
a file already drawn elsewhere — fades it back.

The **status dot** on a card is the publisher's own state: amber placeholder,
blue production ready, green locked. It is the same dot the tree, the tables
and the detail panel use. The extension chip and the artist name are facts
about the file rather than about any of this, so they stay neutral.

Assemblies rarely point at each other directly — a shot root subLayers its
layout block, and *that* block references the asset assembly — so hiding the
blocks would leave a pile of disconnected files. Instead each chain of blocks
between two assemblies **collapses into one arc**, labelled with the arc that
actually pulls the assembly in and remembering the route: selecting the file
shows `via kilo-0010_props.usda`. The ten-layer demo shot collapses to four
assemblies, which is the dependency graph a supervisor wants — which shots use
which sets, and which assets those pull in.

The **Textures**, **Missing** and **Assemblies** toggles filter the graph. Hiding an arc kind
also removes any file that was only reachable through that kind of arc, so
switching off textures collapses the graph to composition alone.

You can deep-link a file with `?path=`, which makes it easy to launch from a
shelf tool or a shell alias:

```
http://localhost:5173/?path=C:\show\shots\kilo\0010\kilo-0010.usda
```

## What counts as a dependency

Arcs are read from `Sdf` layer specs rather than a composed `UsdStage`. That is
deliberate — it means you see arcs *as authored*, including opinions inside
variants that a composed stage would have resolved away, and you still see a
layer when the file it points at is missing.

- **Sublayer** — `subLayers` in layer metadata
- **Reference** — `references` on any prim, in every list-edit position
- **Payload** — `payload` / `payloads`
- **Value clip** — `assetPaths`, `templateAssetPath`, `manifestAssetPath`, and
  the legacy `clipAssetPaths` spelling
- **Texture / asset** — any `asset` or `asset[]` attribute, defaults and time
  samples alike
- **Other** — anything USD's own dependency query reports that the walk above
  did not account for, so nothing is silently dropped

Variant-embedded arcs carry their variant scope, and a graph edge records the
prim it was authored on, the target prim, and the list op that authored it.

Paths containing `#` or `<UDIM>` are marked as templates: they stand for a
family of files, so they are shown but never reported as missing.

## Tests

```bash
cd server && ../.venv/Scripts/python tests/test_crawl.py
cd server && ../.venv/Scripts/python tests/test_project.py
```

`test_project.py` covers the metadata reading, the status vocabulary and the
project scan, against a fixture project in `server/tests/fixture-project/`.

`server/tests/fixture/` is a small scene that exercises every arc kind at once,
including a missing sublayer, a missing clip, a missing texture and two
placeholder paths. No test framework is needed — the crawler is the part most
likely to break quietly when USD changes, so the check runs anywhere the app
does.

## Limits

- Layout is comfortable up to a few hundred files; the crawl stops at 4000 so a
  runaway scene cannot hang the server.
- Only the local filesystem is browsed. A studio asset resolver would work for
  path *resolution* — `Ar` is used for that — but the picker has no notion of it.
- The server binds to `127.0.0.1` and accepts API calls only from localhost
  origins. It is a desktop tool, not something to expose on a network.
