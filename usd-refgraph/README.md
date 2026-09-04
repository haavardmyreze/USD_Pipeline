# usd-refgraph

Point it at a USD file and it draws every file that file reaches — sublayers,
references, payloads, value clips and textures — as an interactive graph in the
browser.

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

## Setup

Once:

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

There are four ways to open a layer:

- **Drop it** anywhere on the window
- **Paste a path** with `Ctrl`+`V`
- **Browse** with **Open a USD file**
- **Deep-link** it with `?path=`

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
| `R` | Rescan from disk |
| `O` | Open a file |
| `Ctrl`+`V` | Open the path on the clipboard |
| `Esc` | Clear the selection |

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

Matching is case-sensitive and rejects a version or artist in a published name,
so `Char-Robot.usda` and `char-robot_model_v002.usda` are reported as
unconventional rather than quietly accepted.

Assemblies are marked on the graph whether or not the filter is on: they carry a
stacked-layers glyph and a brighter name, and the blocks between them sit a step
back. The full classification — *shot root*, *asset assembly*, *set block* — is
in each file's detail panel.

Colour on a card means one thing only: the arc that reached the file. That is
the accent bar down its left edge, matching the wire that arrives there. The
extension chip is a fact about the file rather than about the arc, so it stays
neutral.

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
```

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
