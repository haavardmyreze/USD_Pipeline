# Houdini Solaris & USD — Production Pipeline Guide

**V3 · Draft · How we name things, where they live, who owns what, and how work moves between us.**

---

### Table of Contents

**Part I — Understanding USD**

1. Introduction
2. What USD Is
3. The Two Files: HIP and USD
4. USD in Depth

**Part II — How the Pipeline Works**

*How the work is organised*

5. The Daily Loop
6. Naming at a Glance
7. The Pipeline
8. Folder Structure

*How the scene is built*

9. Solaris Essentials
10. Scene Graph Conventions
11. Materials
12. Rigging
13. VariantSets
14. Instancing

**Part III — Reference**

15. Naming Conventions
16. Paths and Environment Variables
17. Colour Management (OCIO)
18. Publishing
19. Source Control (SVN)
20. Debugging Checklist
21. Core Rules
22. Mental Models

**Part IV — Putting It Together**

23. Worked Example: Full Production Cycle
24. Further Reading

---

**Part I — Understanding USD**

---

## 1. Introduction

This is our production guide for building work in Houdini, using Solaris and USD. It covers how we name things, where they live, who owns what, and how work moves between us.

It is written for everyone who touches a shot — modelling, lookdev, rigging, layout, animation, FX, lighting. On a small team one person covers several of those. That changes nothing about the rules; it just means one person owns more of the work.

One shot runs through the whole guide: **`kilo-0010`, a robot in a living room, worked by four people.** You meet it as a picture at the end of this section, then a piece at a time as each part of the pipeline is explained, and in full in Section 23. Everything in between is a rule about how their work meets.

### 1.1 The problem

Two artists need the same shot on the same afternoon. One is adjusting the camera; the other is animating the character it is pointing at. In a single-file pipeline there are only three ways that ends: one of them waits, one of them loses work, or someone spends the evening merging two files by hand and hoping nothing was missed.

That is the problem this pipeline exists to solve, and nearly everything that follows is a consequence of solving it.

On a traditional production — Maya, Cinema 4D, Blender — a scene lives in one file holding everything: geometry, materials, animation, lighting, cameras, render settings. That is a good format for one person working alone, and it stops being one the moment two people need it at once: only one artist can safely have it open, files get locked or silently overwritten, and merging two people's changes is manual and easy to get wrong.

Those tools have partial answers — references, XRefs, linked files — and they work up to a point. Where they run out is exactly what USD fixes: they let you *split* a scene, but give you no shared rules for how the pieces recombine. Every studio invents its own, informally, and the conventions end up living in people's heads rather than in the format.

**USD is that missing set of rules.** It defines a consistent way for many separate files to combine into one scene. No single file owns the scene: everyone contributes their own, and the scene is assembled from those contributions automatically — including, and this is the part that changes how a team works, contributions that change what someone upstream did without touching their file.

Nobody waits. Nobody merges. Nobody loses work.

### 1.2 The pipeline in one picture

Four ideas hold the whole thing up — Figure 1 draws all of them — and every rule in this guide is detail underneath one.

- **You work in one place and publish to another.** Your Houdini files are yours; what you *publish* is a small, separate file holding only your contribution, at a path that never moves. (Sections 3, 8)
- **The scene is built from many partial files.** Everyone authors their own, USD combines them, and a fixed order settles it where two disagree. Nobody ever edits anybody else's file. (Sections 4, 7)
- **Everything is an asset, a set, or a shot** — a thing, a place, a moment. All three are built identically, so the shape is worth learning once. (Section 7)
- **Your work reaches other people when you commit it,** and theirs reaches you when you update. Nothing shifts under you mid-task. (Sections 5, 19)

Put together, every working day looks the same:

```
SVN update  →  open your HIP  →  work  →  publish USD  →  verify  →  SVN commit
```

That loop is the pipeline. Everything else is detail in service of one of those six steps.

### 1.3 What it buys us

USD was built for productions far larger than ours, and most of what it can do we will never need. Six things are what we actually want out of it — and what the overhead in 1.4 is buying:

- **Parallel work on the same shot** — layout, animation, FX and lighting at once, without waiting, locking or merging.
- **A clean line between the work and the production data** — your Houdini files stay yours to break and restructure, and the production holds only finished contributions, so it can be handed to the farm, a vendor, or whoever picks up your task next without explanation.
- **Overrides that survive** — any stage can override what came before it without editing anyone's file, and the override holds when the thing underneath it changes.
- **Sets built once, used everywhere** — a room is dressed and lit one time, and fixing the room fixes every shot in it.
- **One file to render, with links that hold** — the farm gets a single shot file that pulls in everything else, and because those links are published data rather than something rebuilt at submission time, they resolve the same on a farm node as on the machine that made them. (Section 16)
- **A history that means something** — every change is a commit by a named person with a reason attached, and any state can be recovered.

If a rule in this guide ever seems arbitrary, the right question to ask is which of those six it serves.

### 1.4 What it costs

It would be dishonest to present this as free. There are three real costs, and knowing them in advance makes them much easier to live with.

**More files, and a publishing step.** A shot that used to be one scene file is now several. You cannot simply save and tell someone it is ready — you publish, check it, and commit.

**Failures are silent.** A broken scene file usually tells you so. USD's characteristic failure is *nothing happening*: a file pointing at something that is no longer there produces an empty result and no error at all. Much of this guide — checking a publish in a fresh session, the rules about what every published file must declare, the whole debugging checklist in Section 20 — exists because of this one property. Build the habit of checking what you published rather than assuming it worked. Where a rule below exists to prevent one of these, it is flagged as a **silent failure**.

**Discipline is load-bearing.** In a single-file pipeline, naming things consistently is tidiness. Here, a name or a location is a contract that other people's files depend on. Break one and you quietly break their work, often with no visible error. The naming rules in this guide are not aesthetics.

Below a certain scale — one artist, one shot, one afternoon — this overhead is not worth it. We are past that scale, which is why we work this way.

### 1.5 What changes, and what does not

Most of your work is unaffected. Modelling is still modelling, lookdev is still lookdev, animation is still animation. What changes is the **handoff**: where your work goes when you are finished with it, and how someone else builds on it. That is the entire subject of this guide, and it is why nearly every rule in it is about the boundaries between people's work rather than the work itself.

It is not a USD reference or a Houdini tutorial — Section 24 points at the authoritative sources for both. And a fair amount of what follows is **ours, not USD's**: the three tiers, the words we use for the files that make them up, the naming grammar and the fixed scene structure are conventions we chose, and another studio would choose differently and be equally correct. That matters when you go looking for help, because searching the OpenUSD documentation for our house words will not get you far — so where a convention is ours, this guide says so.

### 1.6 How to read this

| You are… | Read… |
| --- | --- |
| New to USD | Part I (Sections 1–4) in order, then Part II |
| Starting a task | Section 5 (the daily loop) + Section 6 (naming at a glance) |
| Wondering where a file goes | Section 8 (folder structure) |
| Looking up a filename pattern | Section 15 (naming conventions) |
| Setting up a new project | Section 8 (folder structure) + Section 16 (paths) + Section 17 (colour) |
| Going deeper on USD | Section 4 (USD in Depth) |
| Something is broken | Section 20 (debugging) |
| Onboarding someone | Part I, then walk through Section 23 together |

If you are new to all of this, read Part I in order before you open Houdini. It is short, and everything after it assumes it.

The eight figures are not decoration. Each one draws a part of the pipeline that is genuinely shaped like a graph, and the section it opens explains it a piece at a time rather than restating it in words. Each figure closes the section it belongs to, so the words come first and the picture gathers them up.

---

> **FIGURE 1 · The pipeline in one picture** — two places, three tiers, one loop.

## 2. What USD Is

USD — Universal Scene Description — was developed at Pixar and open-sourced in 2016. It is easy to think of it as a file format, but it is really three things stacked together: **a set of file formats** (`.usda` text, `.usdc` binary, `.usd` either of those, `.usdz` a packaged archive); **a scene-graph data model**, a standard way to describe geometry, materials, cameras, lights and their hierarchy so that every tool reads the same scene the same way; and **a composition engine**, the rules for combining many files into one scene.

The composition engine is the part that matters, and it is what makes everything else in this guide possible. It lets many separate files each state *opinions* about the same scene, then resolves them into a single result by strict, predictable rules. No file has to contain the whole scene.

### 2.1 Six words

Four of these are USD's own and mean the same thing everywhere in the industry:

- A **stage** is the fully composed scene — what you see in the viewport and render. It lives in no single file; it is the result of combining files.
- A **layer** is a single USD file on disk and everything it contributes to the scene. Layers are the unit of collaboration: each artist authors their own, and each published file in this pipeline is one.
- A **prim** (primitive) is a node in the scene hierarchy — a mesh, a light, a camera, a transform, a material.
- An **opinion** is a single statement of a value on a prim: the intensity of a light, the position of an asset, the roughness of a material. Many layers can hold opinions about the same value; composition decides which one wins.

Two more are **ours, not USD's**. Every published file in this pipeline is one or the other, and nothing else:

- A **block** is one artist's sparse contribution — a single concern, authored by one person. A lookdev block holds an asset's materials and the bindings that attach them, but not the geometry they attach to. A lighting block holds lights and render settings but nothing they illuminate. Each block states only what its author authored, and leaves composition to supply everything else.
- An **assembly** is a small file holding no scene data of its own. It lists *every* block belonging to one asset, set or shot, in a deliberate order — the order decides which block wins where two disagree — so that a scattered set of contributions becomes one file the rest of the production can point at.

The split is what gives downstream work a **single stable address**. A shot does not point at the robot's model, rig and lookdev layers individually; it points at `char-robot.usda` and gets whatever that composes today. Blocks can be added, split or reordered without anything downstream noticing, which is what lets an asset keep evolving while the shots using it stay untouched.

Both words collide with something USD already means, so flag them if you use them outside the team: USD uses "blocking" for suppressing a value, Houdini's Layer Break is about blocking layers, and USD's own `assembly` is a model kind — a different idea from our assembly file entirely.

### 2.2 The shot, as files

The robot is an **asset**, built and textured once. The living room is a **set**, dressed and lit once and shared by every shot filmed there. `kilo-0010` is the **shot**: everything specific to this moment, worked by four people at the same time.

All three are built the same way — a handful of blocks, one concern each, gathered under one assembly that composes them. The shot's assembly is called the **shot root**, and it reaches out to the *asset and set assemblies*, never to their individual blocks. That single indirection is what lets the robot be built once and reused everywhere. Section 7 and Figure 5 draw it in full.

Each block has one owner, and no two people ever work in the same file. An artist may own several — on a small team, often all four in a shot — but a block never has two authors. When USD opens the shot root it reads every shot block, follows the arcs out to the asset and set assemblies, which pull in their own blocks in turn, and resolves the whole thing into a single stage.

So much for how the files are arranged. The part that makes USD click is what happens when two of them describe the same thing.

### 2.3 Who wins

Figure 2 traces this one. Layout places the robot at the origin; the lighter wants it nudged half a metre for a cleaner silhouette, but never opens layout's file. She states the new position in her own block, as an `over` on the prim layout established, and the shot resolves to her value.

Two separate rules make that work, and it is worth keeping them apart because they are different mechanisms:

- **A local opinion beats one that arrived through a reference.** The robot's own position is authored inside the asset and arrives in the shot through a reference; the lighter's `over` is authored locally, on top, so it wins. This is why an override works at all — the edit you layer on top always beats the thing you are editing underneath.
- **Among the blocks, the shot root's order decides.** It lists the lighting block above the layout block, so if layout had also touched that transform, lighting would still take it. Earlier-listed is stronger.

Layout's file stays exactly as it was. If layout re-blocks the shot and republishes tomorrow, the nudge still applies on top. Nobody merged anything, nobody overwrote anyone, and four people worked the same shot in parallel.

That is what USD buys you. Section 4 states the same machinery precisely; Section 7 is how we divide work to make use of it.

> 👉 **You will almost never write USD by hand.** This guide shows USD as text throughout, because it is the clearest way to explain what composition does — and because reading a published file is how you check it (Section 18.1). But authoring happens in Solaris: the `over` above is simply what Houdini writes out when the lighter nudges the robot in the viewport with an Edit LOP. The listings here are so you can recognise the result, not so you can type it. Reading USD is a debugging skill, not a daily one.

---

> **FIGURE 2 · Who wins** — how opinions from several layers resolve onto one prim.

## 3. The Two Files: HIP and USD

Every artist works with two kinds of file, kept in two separate places — the two territories in Figure 3. This is the most important boundary in the pipeline, and nearly every rule later in this guide is a consequence of it.

```
$WORK                                 $PROJECT
the work drive                        the SVN project tree
─────────────                         ────────────────────
your HIP files          publish  →    published USD layers
source geometry                       textures
reference                             rig HDAs
scratch caches                        published caches
```

Everything on the left is **how you work**. Everything on the right is **what the production is made of**. Nobody but you ever opens anything on the left; everything on the right is read by other artists, by other layers, and by the farm.

The reason the two are kept apart is not tidiness. It is that they have opposite properties, and the pipeline needs to treat them in opposite ways.

**A HIP file is your working environment** — your node graph, your experiments, your rig networks, your render setups. It versions in the filename, it lives on the shared work drive (`$WORK`, Section 8.2), and you never hand one to another artist as a deliverable. **Nothing in the pipeline resolves a HIP by path:** no USD layer points at one, the farm never opens one, and no downstream artist has a parameter with your HIP's name in it. That single fact is why HIPs can live outside SVN, why they can be reorganised at any time without warning anyone, and why the rules about them are so much looser than the rules about published files.

**A USD file is the production data** — the output of your HIP, and the source of truth for what the scene contains. Published USD filenames are **stable**, carrying no version and no artist name, because SVN tracks their history instead. Other departments reference them by path, so a published filename is a promise: change it and their work breaks, usually with no error at all. They live in the project tree in SVN (`$ASSETS`, `$SETS`, `$SHOTS`, Section 8.1).

```
HIP (your workspace)  →  publish  →  USD (the production data)
```

This direction never reverses. You do not edit a USD file directly; you update your HIP and republish.

Publishing is a deliberate act, not a side effect of saving. Saving your HIP changes nothing for anyone else — your work reaches the production only when you publish a layer and commit it. That gap is what lets you experiment freely: nothing you do in your own file can disturb someone else's, no matter how broken it gets, until you choose to publish.

|  | HIP | USD |
| --- | --- | --- |
| Who owns it | You, individually | Your role, shared with the team |
| Where it lives | The work tree, on the work drive (`$WORK`) | The project tree, in SVN (`$ASSETS`, `$SETS`, `$SHOTS`) |
| How it versions | Filename increments freely: `v001`, `v002`… | Filename stays stable, SVN tracks history |
| What it contains | Everything you needed to produce the output | Only your contribution to the scene |
| What others do with it | Nothing — they do not reference your HIP | They reference it from their own HIP |
| If you move it | Nothing breaks | Every reference to it breaks, silently |

### 3.1 One HIP does not mean one published USD

There is no rule that a Houdini session produces exactly one published layer, and expecting one would get in the way of the work. A lighter finishing a shot publishes two layers from one session — their lighting block and the shot root that composes it — because opening a second Houdini file to write five lines of composition would be ceremony for its own sake. An artist dressing a background publishes eight props from one session, because building them together is how the work goes. An artist building one simple prop publishes a single self-contained layer straight to the assembly, with no separate blocks at all (Section 7.1).

**What the pipeline fixes is where published files go and what they are called. How many Houdini sessions it took to make them is yours.** The one thing this costs you is that "which HIP made this file?" is no longer answered by the folder a file sits in — Section 8.2 covers how the work tree keeps that question easy to answer.

---

> **FIGURE 3 · One HIP is not one USD** — three legal shapes, one membrane, and what the shot actually sees.

## 4. USD in Depth

Sections 1–3 covered what USD is, the boundary it draws, and the two kinds of file you work with. This section states the composition machinery precisely, because the rest of the guide relies on it. Read it once now; come back whenever something composes in a way you did not expect.

### 4.1 Layers and opinions

A USD layer contains **opinions** — statements about what values prims should have. When layers are composed, opinions can conflict, and USD resolves conflicts using **opinion strength**. Two different orderings decide strength, and it is worth keeping them apart because you use one of them constantly and the other almost never.

**Sublayer order — the one you use every day.** *Sublayering* is one file listing the others it is built from: an assembly listing its blocks, a shot root listing the set and the shot's blocks (4.3). Where several layers are stacked that way, the one listed earlier is stronger. This is the whole basis of the block stack — in the shot root, lighting is listed above layout, so lighting wins:

```
# in shots/kilo/0010/kilo-0010.usda
subLayers = [
    @kilo-0010_lighting.usda@,     ← strongest
    ...
    @../../../sets/living-room/set-living-room.usda@      ← weakest
]
```

**Arc order (LIVRPS) — the one you rarely think about.** A single prim can also receive opinions through different *kinds* of composition arc at once — a local override, a reference, a variant, a payload. When that happens, USD ranks them in a fixed order called **LIVRPS**: **L**ocal > **I**nherits > **V**ariantSets > **R**eferences > **P**ayloads > **S**pecializes.

In practice only the first letter earns its keep here: **a local opinion beats one that came in through a reference** (L beats R). That single rule is what makes every override in this guide work, and you will lean on it constantly without ever needing the acronym.

The other four letters only matter when several *different* arc types collide on one prim at once — a referenced asset that also carries a variant selection and inherits from a class, all touching the same attribute. Our sparse block-and-assembly design mostly avoids that by construction. Know LIVRPS exists and where to look it up (Section 24); do not memorise it.

### 4.2 Prims

Everything in a USD scene is a **prim** (primitive): meshes, lights, cameras, materials, transforms (Xforms) and organisational groups (Scopes). Prims live at **prim paths**, describing where a prim sits in the scene hierarchy:

```
/World/Characters/Hero
/World/Lighting/KeyLight
/World/Props/CrateA
```

Prim paths are as important as file paths. A reference that finds the right file but the wrong prim path is a **silent failure** — it produces nothing and shows no error, and it is one of the most common causes of a mysteriously empty stage.

### 4.3 Composition arcs

Layers connect through **composition arcs**. The ones you will use most:

| Arc | What it does | When to use it |
| --- | --- | --- |
| **SubLayer** | Stacks one complete layer onto another, at the root level | Shot root composition, asset assembly |
| **Reference** | Embeds another file at a specific prim path in your scene | Placing assets into a shot |
| **Payload** | Like Reference, but loads on demand | Large or heavy assets |
| **VariantSet** | Named switchable alternatives on a prim | LODs, damage states, seasonal looks |

The distinction between the first two is the one that matters daily, and Figure 5 draws it: **SubLayer** merges layers at the same level, both contributing to the same part of the scene graph — asset assembly, shot roots. **Reference** places one scene inside another at a specific location — layout placing `char-robot.usda` at `/World/Characters/Hero`. Using the wrong one produces a scene that looks approximately right but has the wrong composition structure, which causes override problems downstream.

### 4.4 File formats

A layer's extension chooses its *encoding*, not its capabilities. The data model is identical either way: anything you can express in one format you can express in the other, and composition treats them the same. A `.usda` can hold heavy geometry; a `.usdc` can hold nothing but subLayers. Nothing in this guide's structure depends on the format.

| Format | Extension | What it is |
| --- | --- | --- |
| ASCII text | `.usda` | Human-readable text. Open it in any editor, read it, diff it. Slower to write, and much larger on disk once there is real data in it. |
| Binary crate | `.usdc` | Pixar's binary format. Compact, fast to open, and read lazily — USD pulls values off disk only when something asks for them. Not readable in an editor. |
| Either | `.usd` | Format is determined by the file's header, not its name. Both encodings are legal under this extension. |
| Package | `.usdz` | A zipped archive holding a stage and its textures together. An interchange and delivery format — you do not author into it. |

So the choice is a tradeoff between readability and speed, made per file, and **the extension follows the content, not the tier**:

- **`.usda` for composition and sparse opinions.** Every assembly and shot root, plus layout, lighting and material layers. These are small, they are the ones you want to read when something is wrong, and they are the ones where an SVN diff tells you something useful (Section 19.4).
- **`.usdc` for bulk data.** Published geometry, baked animation, FX caches. A deforming character bake written as text is hundreds of megabytes and slow to load; as crate it is a fraction of that and opens lazily. That you cannot read it barely matters — a table of a million point positions was never readable anyway.

The rule of thumb: **if you would ever want to read it, `.usda`; if it is mostly numbers, `.usdc`.** We spell the extension out rather than using bare `.usd`, so a filename says what you can do with the file without opening it (Section 15).

**Setting it in Solaris.** There is no format parameter. The extension you type into the USD ROP's **Output File** decides it.

**Changing a published file's format is a breaking change.** The extension is part of the filename, and downstream layers reference that filename by path — switching a block from `.usda` to `.usdc` breaks every layer pointing at it, silently, exactly as a rename would (Section 7.5).

**Reading a `.usdc`.** Use `usdview`, the Houdini scene graph tree, or `usdcat char-robot_model.usdc`, which prints the same layer as text — often the quickest way to check what actually got published. Never guess at binary contents.

---

**Part II — How the Pipeline Works**

---

**How the work is organised**

Sections 5–8: what you do each day, what things are called, how work is divided, and where it goes.

---

## 5. The Daily Loop

Section 1.2 introduced the loop. This is it in full — what every artist does every working day, in order:

```
1. SVN update                              ← published data
2. Open your HIP from $WORK
3. Do your work
4. Publish USD
5. Verify the published USD loads correctly
6. SVN commit                              ← published data
```

Step 5 is the one people skip, and it is the one that catches silent failures before they reach anyone else. Section 18.1 is the check in full.

Note what SVN carries and what it does not. Updating and committing move **published data** — USD layers, textures, rig HDAs. Your HIP is not in SVN; it sits on the work drive and is simply there, current, for you and for whoever takes the task over next.

**A few things that never change:**

- Always SVN update before you start. You need the latest version of everything upstream.
- Always publish USD before you hand off. A HIP file is not a handoff.
- Always verify your publish in a clean Houdini session — not the one you authored it in.
- Always commit with a message that describes what changed and why.

**Why the update step matters more than it looks.** In a live-linked pipeline, an upstream republish reaches you the instant it happens — often mid-task, often unannounced. Here it does not. Nothing upstream changes under you until *you* run `svn update`. That is a deliberate design property, not an accident of using SVN: the update step is the buffer that lets you finish what you are doing on a known-stable set of inputs, and take upstream changes at a moment you choose. The cost is that you must actually update — daily, at the start of work — or you drift.

**Commit messages that work:**

```
Layout: moved hero 2m left for camera framing, kilo-0010
Anim: rough walk cycle pass, kilo-0010 — timing not final
Lookdev: reduced specular on robot paint
Rig: added finger controls — notify animation, skeleton updated
```

**Commit messages that do not work:**

```
update
fixes
wip
v2
test
```

---

## 6. Naming at a Glance

Figure 4 is the whole of this section as one picture. The full reference — every pattern, the regex, texture channels — is **Section 15**; what follows is the minimum you need for the rest of Part II.

One rule governs every filename: **underscores separate tokens; hyphens join words inside a token.** An underscore never appears inside a token.

- A **name** is one token, hyphenated: `char-robot`, `set-living-room`, `kilo-0010`.
- A **published block** is `<name>_<block>`: `char-robot_model.usdc`, `kilo-0010_lighting.usda`.
- An **assembly** is just the clean name: `char-robot.usda`, `set-living-room.usda`, and `kilo-0010.usda` (the shot root).
- A **HIP** names the work, and adds artist and version: `kilo-0010_anim_erik_v003.hip`.

Published USD filenames are stable — they never carry a version or an artist. HIP files always do.

The extension follows the content, not the tier: `.usda` for composition and overrides, `.usdc` for geometry and animation caches (Section 4.4).

---

> **FIGURE 4 · Naming at a glance** — one rule, two anatomies, and the tokens that make a filename parseable.

## 7. The Pipeline

Everything this pipeline produces falls into one of three tiers:

| Tier | What it is | Scope |
| --- | --- | --- |
| **Asset** | A reusable component — a character, a prop, a vehicle | Built once, used anywhere |
| **Set** | A dressed, populated space that assembles assets | Shared by every shot in that location |
| **Shot** | One moment — camera, animation, effects, lighting | This shot only |

**All three are built identically.** There is no structural difference between an asset, a set and a shot — only a difference in what they contain and who works on them. 7.1 defines the structure once; 7.2, 7.3 and 7.4 then cover only what is specific to each tier, which is why they are short.

This three-tier structure also shapes the folder layout (Section 8) and the naming conventions (Section 15).

### 7.1 Blocks and assemblies

Every tier is built from **blocks** plus one **assembly** file, and Figure 5 draws all three side by side.

A **block** is a sparse layer owning a single concern — a model, a lighting pass, a set's dressing. One block, one author, one job. Blocks are the unit of parallel work: because each artist authors only their own, several people can work on the same asset, set or shot at once.

An **assembly** is a single file that subLayers every block belonging to one asset, set or shot. It holds **no scene opinions of its own** — only subLayers, the stage metrics, a `defaultPrim` where relevant, and any production-default variant selections. It is the file downstream work points at.

```
<name>_<block-a>            ← block: one concern, one author
<name>_<block-b>            ← block: one concern, one author
<name>_<block-c>            ← block: one concern, one author
        ↓
<name>.usda                 ← assembly: subLayers the blocks
```

**These rules apply to all three tiers without exception:**

- **Block names are free-form** — lowercase, hyphens, never underscores. There is no closed list; use the conventional names in Section 15.4 for the common disciplines rather than inventing synonyms.
- **A block owns one concern.** Two blocks should not author opinions on the same prims unless that overlap is intentional and coordinated.
- **The assembly is always `.usda`** — pure composition, kept readable and diffable. Blocks choose their extension by content (Section 4.4).
- **Assembly sublayer order is opinion strength** — earlier listed is stronger (Section 4.1). Whoever owns the assembly owns that ordering.
- **Downstream work points at the assembly, never at individual blocks.** That indirection is what lets blocks be added, split or renamed without breaking anything downstream.
- **Blocks and their assembly share one folder** — the entity's folder in the project tree (Section 8.1), so an assembly names its blocks by filename alone.
- **How many HIPs produced them is not part of the structure.** One session may publish several blocks, or a block and the assembly together (Section 3.1).

An asset assembly, for example:

```
#usda 1.0
(
    defaultPrim = "CharRobot"
    subLayers = [
        @char-robot_lookdev.usda@,
        @char-robot_model.usdc@
    ]
)
```

A set assembly and a shot root look the same, with different filenames in the list.

**Assembly files are not hand-edited for daily work.** An assembly is created when its asset, set or shot is set up, and touched again only when a block is added or removed. Daily work belongs in the blocks.

#### When one block is enough

Splitting into blocks earns its keep when different people own different concerns, or when the entity is complex enough that separating them has clear organisational value. When one artist builds an asset end to end — a smaller prop, a tightly integrated hero asset where shading decisions are made alongside geometry — there is no requirement to split it. The asset can be a single self-contained layer published directly as the assembly, in which case the assembly file *is* the asset file.

```
prop-lamp.usda     ← geometry, materials, everything — authored in one HIP
```

The rule is not *always split*. The rule is that whatever gets published as the assembly must be a stable, correctly structured USD file with a default prim set, at a stable path. Blocks serve parallel work and clear ownership; where neither is a concern, splitting adds overhead without adding value.

### 7.2 Assets — what is specific

An asset is a reusable component of the production — a character, a prop, a vehicle, a single piece of furniture. It is built once and reused wherever it is needed, and it is not specific to any location or moment in the film.

**Common blocks:** `model`, `rig`, `lookdev`. They have a natural workflow dependency — modelling publishes first, rig and lookdev then run in parallel, and assembly waits for both:

```
char-robot_model.usdc       ← block: geometry and prim hierarchy
char-robot_rig.usda         ← block: bind-pose skeleton — Lane 3 only (Section 12.2)
char-robot_lookdev.usda     ← block: materials and bindings
        ↓
char-robot.usda             ← assembly: what sets and shots reference
```

**Only assets require a default prim.** The asset assembly is pulled in at a prim path by sets and shots, so it has to declare which prim to pull. A missing default prim is a **silent failure** — nothing appears, nothing errors (Section 9.4).

**How it is consumed:** sets and shots **reference** the asset assembly at a prim path — `/World/Characters/Hero`, `/World/Props/CrateA` — because they are placing one scene inside another (Section 4.3).

### 7.3 Sets — what is specific

A set is a dressed, populated space — a living room, a warehouse floor, a forest clearing. It assembles assets into a persistent shared environment that multiple shots inhabit.

Where the sofa sits is a set-level truth: re-dress it against the far wall and it is against the far wall in every shot filmed in that room. Whether the sofa gets shoved aside during one particular shot is a shot-level truth, and nobody opens the set to make that happen — the shot's layout block authors a stronger opinion about the sofa's position (7.4). Because the set sits at the bottom of the shot root's subLayer stack, layout's opinion wins in that shot and nowhere else: the set file is untouched, every other shot still finds the sofa where set dressing left it, and if the room is re-dressed later, this shot keeps its shoved sofa.

**Common blocks:** `dressing`, `lighting`, `lookdev`, and sometimes `fx`. More specific block names are more common here than anywhere else:

```
set-living-room_fg-dressing.usda    ← block: foreground dressing
set-living-room_practicals.usda     ← block: the lamps that are physically in the room
        ↓
set-living-room.usda                ← assembly: what shot roots subLayer
```

**The set owns everything about the space that persists across shots, and nothing that does not.**

**How it is consumed:** the shot root **subLayers** the set assembly rather than referencing it, because the set already defines the full scene graph structure — `/World/Props/Sofa`, `/World/Environment/Walls`. The shot adds new prims on top of that structure rather than placing the set somewhere inside it (Section 4.3).

**Set dressing usually needs no Layer Break.** A set dressing HIP starts from an empty stage, and the references it authors *are* its contribution — there is no upstream context to discard (Section 9.1).

### 7.4 Shots — what is specific

A shot is a specific moment — a particular range of frames with a specific camera, specific character positions, specific lighting. It takes a set and adds everything unique to that moment.

**Common blocks:** `layout`, `anim`, `fx`, `lighting`. The assembly is called the **shot root**.

**Build order — who works when:**

```
Set → Layout → Animation → FX → Lighting → Shot Root
```

The shot root lists lighting — the last department to touch the shot — at the top, and the set at the bottom, because earlier-listed sublayers are stronger (Section 4.1):

```
#usda 1.0
(
    subLayers = [
        @kilo-0010_lighting.usda@,
        @kilo-0010_fx.usdc@,
        @kilo-0010_anim.usdc@,
        @kilo-0010_layout.usda@,
        @../../../sets/living-room/set-living-room.usda@
    ]
)
```

Five lines, and every ingredient of the shot is named — strongest first, with the set as the weakest layer, so everything the shot authors sits above it and can override it. This is the stack Figure 2 resolves.

**The set is subLayered by the shot root, not by the layout block.** Layout *loads* the set for context, but what it *publishes* is only its own sparse contribution. If the set arrived through the layout block instead, the shot root would not name it, and whether the set appeared at all would depend on how one artist configured one Layer Break (Section 9.1). Naming it in the shot root makes the shot self-describing.

**Shot-specific changes to the space live in the layout block.** A prop moved for a stunt, a door left open — the set file is unchanged, and layout's opinion wins automatically because it is the stronger layer:

```
# kilo-0010_layout.usda — shot-specific override example
over "World" {
    over "Props" {
        over "CoffeeTable" {
            double3 xformOp:translate = (2.0, 0, 0.5)   # moved for stunt
        }
    }
}
```

### 7.5 Ownership, dependency, and change

**A block has one owner at a time**, so two people never author it in parallel. Ownership is a production assignment, and it moves: hand a task over and the layer, the working files and the published path all go with it. Whoever owns the assembly owns its subLayer order.

USD is a dependency chain, so when something upstream changes, everything downstream may be affected.

**When you change something upstream:**

1. Commit with a clear message describing what changed.
2. Notify downstream artists directly — do not rely on them noticing an SVN update.
3. Flag explicitly if **prim paths have changed** — this is a breaking change.

**Renaming a prim path in a published layer is a breaking change.** Every reference downstream that points at the old path will fail silently. Never rename a published prim path without coordinating first.

**When you receive an upstream change:**

1. SVN update.
2. In Solaris: Scene Graph Tree → right click → Reload Layer.
3. Check your layer visually — do not assume it still works.
4. Republish if affected, and notify your own downstream.

And the converse, which matters as much: **only republish if your layer has actually changed or broken.** Composition propagates upstream updates on its own. Republishing for its own sake creates noise and forces other people to reload for nothing.

---

> **FIGURE 5 · Three tiers, one structure** — what points at what, and with which arc.

## 8. Folder Structure

There are two trees, on two different storage systems, organised on different principles — Figure 6 sets them side by side.

The **project tree** holds published data — every file the pipeline resolves by path. It lives in SVN, reached through `$PROJECT` and its derived variables (Section 16.2).

The **work tree** holds HIPs and everything that feeds them. It lives on the shared work drive, reached through `$WORK`.

The split is the one drawn in Section 3: published USD is the production data, a HIP is the tool that produces it. Nothing in the pipeline resolves a HIP by path, which is why the two can live apart — and why the work tree can be organised for the convenience of the person working rather than for a downstream reference.

### 8.1 The project tree

One folder per asset, set and shot. Its published layers sit directly in it, and the assembly is identifiable at a glance because it is the one with no block token in its name (Section 15.5).

```
project_root/
├── assets/                                       ← individual reusable assets
│   └── char-robot/
│       ├── char-robot_model.usdc
│       ├── char-robot_rig.usda                   ← bind-pose skeleton, Lane 3 only (12.2)
│       ├── char-robot_lookdev.usda
│       ├── char-robot.usda                       ← assembly: clean name, no block token
│       ├── char-robot_rig.hda                    ← the rig, for animators (12.1)
│       ├── tex/
│       │   ├── char-robot_bc_4k.exr
│       │   ├── char-robot_n_2k.exr
│       │   └── char-robot_aormt_4k.exr
│       └── materials/                            ← only if using separate material files
│           ├── char-robot_paint.usda
│           └── char-robot_metal.usda
│
├── sets/                                         ← dressed spaces shared across shots
│   └── living-room/
│       ├── set-living-room_dressing.usda         ← prop placement, furniture
│       ├── set-living-room_lighting.usda         ← practicals, env lights
│       ├── set-living-room_lookdev.usda          ← location-specific surface overrides
│       ├── set-living-room_fx.usda               ← optional: persistent effects
│       ├── set-living-room.usda                  ← assembly: shot roots subLayer this
│       └── tex/
│           ├── set-living-room_walls_bc_4k.exr
│           └── set-living-room_walls_aormt_4k.exr
│
├── shots/                                        ← shot-specific work only
│   └── kilo/
│       └── 0010/
│           ├── kilo-0010_layout.usda
│           ├── kilo-0010_anim.usdc               ← baked animation (12.2)
│           ├── kilo-0010_fx.usdc
│           ├── kilo-0010_lighting.usda
│           ├── kilo-0010.usda                    ← shot root (the shot's assembly)
│           └── cache/
│               └── sim.####.vdb                  ← published cache (19.3)
│
├── library/                                      ← reusable shared assets
│   ├── materials/
│   │   ├── metal-bare.usda
│   │   └── plastic.usda
│   └── lights/
│       └── studio-rig.usda
│
├── houdini/
│   ├── otls/
│   │   └── usd-publish.hda                       ← project-wide tools, on the tab menu
│   ├── ocio/
│   │   └── config.ocio                           ← pinned colour config (Section 17)
│   └── packages/
│       └── project.json                          ← project environment (16.3)
│
└── docs/
    └── pipeline-guide.md
```

Because every layer sits beside its siblings, the paths inside a published file are short — an assembly points at its blocks by filename alone, and the longest path in the project is a shot root reaching across to a set (Section 16.1).

Subfolders appear only where an entity needs them. `tex/` holds textures a published layer resolves. `materials/` holds separate material files, and only if the project uses Option B in Section 11.1. `cache/` holds any cache a published layer references — production data on the same footing as the layer itself (Section 19.3). `versions/` holds rollback snapshots where someone wants them (Section 18.2).

### 8.2 The work tree

Three levels, and only the first two are named by the pipeline:

```
$WORK/
└── <tier>/          ← assets, sets, or shots
    └── <context>/   ← what the work is about: one entity, or a named group
        └── <task>/  ← the owning folder: one HIP, all its versions,
                        and everything that HIP depends on
```

The **owning folder** is the unit that matters. Every HIP has one, and it holds all of that HIP's versions alongside its source geometry, reference and scratch caches. Where a context has only one HIP, the context folder *is* the owning folder and there is no task level.

In full:

```
$WORK/
├── assets/
│   ├── char-robot/                               ← context: one entity
│   │   ├── model/
│   │   │   ├── char-robot_model_alex_v001.hip
│   │   │   ├── char-robot_model_alex_v004.hip
│   │   │   └── geo/
│   │   │       └── robot-blockout.fbx
│   │   ├── rig/
│   │   │   └── char-robot_rig_alex_v011.hip
│   │   └── lookdev/
│   │       ├── char-robot_lookdev_maria_v003.hip
│   │       ├── render/                           ← lookdev turntables
│   │       └── ref/
│   │           └── paint-reference.jpg
│   │
│   ├── prop-lamp/                                ← one HIP builds it end to end,
│   │   ├── prop-lamp_model_ina_v002.hip             so no task folder is needed
│   │   └── geo/
│   │       └── lamp-scan.fbx
│   │
│   └── props-batch-a/                            ← context: a group, not one entity
│       ├── props-batch-a_model_alex_v002.hip
│       └── geo/
│           └── kitbash-set.fbx
│
├── sets/
│   └── living-room/
│       ├── dressing/
│       │   └── set-living-room_dressing_ina_v006.hip
│       └── lighting/
│           └── set-living-room_lighting_maria_v002.hip
│
└── shots/
    └── kilo/
        └── 0010/
            ├── layout/
            │   └── kilo-0010_layout_ina_v003.hip
            ├── anim/
            │   ├── kilo-0010_anim_erik_v012.hip
            │   └── geo/
            │       └── walk-test_v003.bgeo.sc    ← working cache, disposable
            └── lighting/
                └── kilo-0010_lighting_maria_v007.hip
```

**Nothing sits loose at tier level or above.** Every HIP is inside a context folder.

**The context is the narrowest subject covering everything the HIP produces.** Where that is a single asset, set or shot, the context folder mirrors that entity's folder path in the project tree — `assets/char-robot/`, `sets/living-room/`, `shots/kilo/0010/`. Where it is not — one HIP building eight background props — the context is a descriptive group name following the same token rules, and it has no counterpart in the project tree. It does not need one: each prop gets its own project folder, and nothing downstream cares how they were made.

**Inside the owning folder, use Houdini's standard project folders** — `geo/`, `sim/`, `render/`, `tex/`, `abc/`, `comp/` and the rest. This is not tidiness for its own sake. Because every version of a HIP lives in its owning folder, `$HIP` resolves to that folder, so Houdini's out-of-the-box defaults land exactly where they should with no parameter editing: a File Cache SOP writes to `$HIP/geo`, a DOP cache to `$HIP/sim`, a ROP to `$HIP/render`. Add whatever else a job needs, but add to the standard layout rather than inventing a different one.

### 8.3 What decides where a file goes

One question sorts everything the pipeline produces: **does anything resolve it by path?**

| | Lives in | Examples |
| --- | --- | --- |
| Referenced by a published layer | Project tree | USD layers, textures, published caches |
| Handed to another artist, not referenced by a layer | Project tree | Rig HDAs (12.1) |
| Referenced by nothing | Work tree | HIPs, source geometry, reference, scratch caches |

Anything in the first two rows has a stable path that other people's work depends on, and moving it is a breaking change (Section 7.5). Anything in the third can be moved, renamed or reorganised at any time without consequence — which is why artists are free to arrange the inside of an owning folder as the work demands.

*For texture naming conventions and validation patterns, see Section 15.9.*

---

> **FIGURE 6 · The two trees** — where every file the pipeline produces lives, and the one question that sorts them.

**How the scene is built**

Sections 9–14: what you author once you are inside a scene — the nodes, the prim paths, and the materials, rigs, variants and instances built against them.

---

## 9. Solaris Essentials

These are the nodes everything after this section assumes, which is why they come first. The Layer Break in particular decides whether a publish is correct or quietly wrong, and it is referenced throughout the rest of the guide.

Worth knowing before any of them: **nothing you do in a LOP network changes a file on disk.** Composition only ever reads. What these nodes control is what gets *written* when you publish, which is a separate and deliberate act.

### 9.1 The Layer Break LOP

**A Layer Break marks where your own work starts** (Figure 7). It draws a line across your LOP network: everything *before* it is material you loaded to work against, everything *after* it is yours, and when you publish, only what comes after the break is written out.

You need that line because of how a LOP network is built. To do your job you load other people's published work first — the set, the assets, the blocks before yours — and all of it becomes part of the stage in your network, indistinguishable from what you authored. Without a Layer Break the USD ROP writes the whole lot: your sparse block comes out containing a full copy of the set, the assets and every upstream block. You would be republishing data you do not own, in a stronger layer than its owner, and their future changes would stop reaching the shot. Nothing errors.

**Where the break goes: after context, before contribution.** The rule is not "after all references" — it is that the break separates what you *loaded to look at* from what you are *publishing*. Those are different things, and confusing them is the most common way to publish an empty layer.

- A **Sublayer LOP bringing in upstream published work** for context goes *before* the break.
- A **Reference LOP placing an asset that is your own deliverable** goes *after* the break. When layout places the hero character, or the set dresser places a sofa, that reference **is** the contribution — put it before the break and it vanishes from the published file.
- Anything that authors new prims you own — cameras, lights, imported caches — goes *after* the break.

The test to apply: *if this disappeared from my published file, would my work be missing?* If yes, it belongs after the break.

A network whose stage starts empty — a set dressing HIP that references props into a blank stage — needs no Layer Break at all. There is no upstream context to discard.

**Node colours confirm this is working.** Houdini assigns each layer a colour — not meaningful in itself, but consistent across all nodes writing to the same layer. When the colour changes at your Layer Break, that visually confirms your edits are isolated in a separate layer. If everything in your network is one colour and you expected a break, the Layer Break is missing or in the wrong position.

### 9.2 The USD ROP

Key settings:

- **Save Path** — use environment variables here (Section 16). Never a local absolute path.
- **Output Primitive** — for asset publishing, set this to write only the subtree from a specific prim, not the entire stage.
- **Save Style** — this is the setting that controls flattening, and it is the one to get right. Choose the option that writes **only your layer**, not a flattened composed stage. A flattened publish loses composition structure and destroys downstream override capability.
- Verify the paths written *inside* the file are relative (Section 16.1), not absolute paths baked in at write time.

After publishing: open the USD file in `usdview` or as text and verify it contains only what you intended (Section 18.1).

### 9.3 The Reference LOP

- **File Path** — use environment variables.
- **Primitive Path** — where in your stage the asset is placed: `/World/Characters/Hero`.
- **Reference Primitive** — which prim inside the file to pull from: `/CharRobot`. If blank, uses the default prim. Always set the default prim on published assets.

### 9.4 Setting a Default Prim

Every published asset USD must define a default prim. Without it, a reference with no explicit prim path produces nothing and shows no error — a **silent failure**.

In USDA:

```
#usda 1.0
(
    defaultPrim = "CharRobot"
)
```

In Solaris: set it on the **Configure Layer LOP** before your USD ROP — the same node that carries the stage metrics from Section 10.6. Treat a missing default prim as a publish error.

### 9.5 Network organisation

Node colours are assigned by Houdini and communicate layer membership — not node type. Use **named null nodes** as your own labelling system:

```
[NULL: INCOMING_LAYOUT_USD]
[Reference LOP]
[NULL: LAYER_BREAK_START]
[Layer Break]
[NULL: ANIM_EDITS_BEGIN]
[SOP Import]
[NULL: PUBLISH_OUTPUT]
[USD ROP]
```

Anyone opening your HIP — including future you — should be able to understand the network without tracing every wire. A well-organised HIP is not optional. Iterative does not mean unreadable.

### 9.6 Rendering: Karma and Husk

What you render is the **shot root** — the fully composed `kilo-0010.usda`. Because it pulls in the set, the assets and every block through composition, the renderer sees the whole assembled scene from that one file.

**Interactively**, the lighting block's Karma Render Settings LOP defines the camera, resolution, samples, AOVs and output paths, and a USD Render ROP renders from the GUI. **On the farm**, `husk` — the standalone command-line USD renderer that ships with Houdini — loads the same stage, picks a Hydra render delegate (Karma by default) and renders with no interactive session, each node taking a different frame range:

```
husk --renderer Karma \
     --frame 1001 --frame-count 100 --make-output-path \
     --output "$SHOTS/kilo/0010/render/beauty.$F4.exr" \
     $SHOTS/kilo/0010/kilo-0010.usda
```

`--frame` is the start frame, `--frame-count` the number of frames, `--renderer` the Hydra delegate. Flags change between Houdini builds — check `husk --help` for the version you are on.

**Render settings live in the stage, not on the command line.** Camera, resolution, samples and AOVs are authored as RenderSettings and Render Var prims (from the Karma Render Settings and Render Var LOPs) in the lighting block, so Husk reads them straight from the USD — it looks for RenderSettings under `/Render`. Choosing CPU or XPU is part of the same thing: it is the render delegate selection, authored on the Karma Render Settings LOP in the lighting block, not a flag on the farm submission.

**Recent Houdini builds initialise the frame range from the stage.** `--frame` and `--frame-count` default to the stage's `startTimeCode` and `endTimeCode`, which is exactly why Section 10.6 makes layout responsible for authoring them. On the farm you still pass the range explicitly, because each node renders a different slice of it.

**Karma CPU vs XPU.** XPU is the hybrid CPU+GPU path — faster, shading with the same MaterialX, and a sensible default for lookdev and most shots. CPU is the full reference feature set and the ground truth. When an XPU frame looks off, confirm it on CPU before committing a sequence.

**Output.** Karma writes scene-linear ACEScg EXRs (Section 17), one per frame, into a per-shot `render/` folder that is **not** committed to SVN (Section 19). The view transform is applied in comp, never baked into the EXR.

---

> **FIGURE 7 · The Layer Break** — what actually lands in your published file, with the break and without it.

## 10. Scene Graph Conventions

USD does not require any particular scene graph shape. It has no `/World`, no reserved names, no rule that geometry sits under `/Geo`. Everything in this section is a convention we adopted — some of it common across the industry, none of it enforced by the standard.

It matters anyway, and arguably more than the parts USD does enforce: every override, every material binding and every reference in this pipeline targets a prim **by path**, and a path that does not match is a silent failure rather than an error (4.2). Consistency here is what makes overrides possible at all, which is why these paths are fixed rather than per-artist preference.

The one exception is 10.6, stage metrics — those are real USD metadata with real defaults, and are called out as such.

### 10.1 Prim naming conventions

Prim names follow **PascalCase** — capitalised words, no underscores, no spaces. This distinguishes them visually from filenames (lowercase, hyphen-and-underscore) and makes the scene graph easier to read.

| Context | Convention | Examples |
| --- | --- | --- |
| Asset root prim | PascalCase, no underscores | `CharRobot`, `PropCrate`, `EnvWarehouse` |
| Asset instance in shot | PascalCase, unique within its scope | `Hero`, `CrateA`, `CrateB` |
| Lights | PascalCase, descriptive | `KeyLight`, `FillLight`, `SkyDome` |
| Cameras | PascalCase | `Main`, `Witness` |
| Internal asset structure | PascalCase | `Geo`, `Mtl`, `Rig`, `Body`, `Head` |

Multiple instances of the same asset get a letter suffix: `CrateA`, `CrateB`, `CrateC`. Never `Crate1`, `Crate2` — letters sort more predictably and avoid confusion with shot numbering.

The asset root prim name is derived directly from the asset name token, with hyphens removed and each word capitalised: `char-robot` → `CharRobot`, `prop-crate` → `PropCrate`. This makes the relationship between filename and prim path unambiguous.

### 10.2 Shot scene graph structure

Every shot uses this fixed root structure, drawn in full — with owners — in Figure 8:

```
/World                   (Xform)
  /Characters            (Scope)
  /Props                 (Scope)
  /Environment           (Scope)
  /FX                    (Scope)
  /Cameras               (Scope)
  /Lighting              (Scope)
```

`/World` is the root transform, and all scene content lives under it. Do not add new top-level scopes without a team discussion. Scopes are organisational and have no transform; use Xforms when you need one.

### 10.3 Asset instances in shots

Assets placed into a shot live under the appropriate scope with a unique PascalCase instance name:

```
/World/Characters/Hero        ← char-robot.usda
/World/Props/CrateA           ← prop-crate.usda, first instance
/World/Props/CrateB           ← prop-crate.usda, second instance
/World/Environment/Ground     ← env-ground.usda
```

### 10.4 Asset internal structure

Inside a published asset USD, the root prim is PascalCase with no underscores:

```
/CharRobot               (Xform — root prim and default prim)
  /Geo                   (Scope — all geometry)
    /Body                (Mesh)
    /Head                (Mesh)
  /Mtl                   (Scope — materials)
    /Paint               (Material)
    /Metal               (Material)
  /Rig                   (SkelRoot — if skeletal)
    /Skel                (Skeleton)
```

Geometry always under `/Geo`. Materials always under `/Mtl`. Skeleton always under `/Rig`. These paths must be consistent across all assets — downstream references depend on them.

### 10.5 Cameras and lights

Cameras (owned by Layout):

```
/World/Cameras/Main
/World/Cameras/Witness
```

Lights (owned by Lighting), named with descriptive PascalCase:

```
/World/Lighting/KeyLight
/World/Lighting/FillLight
/World/Lighting/SkyDome
```

Never name lights `Light1`, `Light2`. Names should communicate intent.

### 10.6 Stage metrics and time

Scene graph structure is only half of what has to agree between layers. The other half is the **stage metrics** — the units, the up axis and the timing. These are layer metadata, not prims, and they are silent when they disagree: an asset authored in centimetres composed into a set authored in metres does not error, it just arrives a hundred times too big or too small.

Set these once, project-wide, and treat them as fixed:

| Metadata | Project value | Notes |
| --- | --- | --- |
| `upAxis` | `Y` | USD's default and Houdini's default. Do not vary it per asset. |
| `metersPerUnit` | `1` | One Houdini unit is one metre. USD's own default is `0.01` (centimetres), so this is a deliberate choice that must be authored, not assumed. |
| `timeCodesPerSecond` | project frame rate | Must match the Houdini scene FPS. Mismatches show up as animation playing at the wrong speed, not as an error. |
| `startTimeCode` / `endTimeCode` | the shot's frame range | Per shot, not project-wide. |

**Who authors what.** Units and up axis belong on every published layer that contains geometry — set them in the **Configure Layer LOP** before your USD ROP, the same node that sets the default prim (Section 9.4). The frame rate is also per-layer metadata and should match everywhere.

**The shot frame range is owned by layout.** Layout is where a shot's identity is first established — the camera, the blocking, and therefore the timing. The layout block authors `startTimeCode` and `endTimeCode`; every downstream block inherits the shot's range from the composed stage rather than each artist deciding independently. This matters practically as well as conceptually: recent Houdini builds initialise the frame range for command-line rendering from those values (Section 9.6), so if they are wrong or missing, farm renders come out with the wrong frame count.

Add these to the publish check: **every published layer states its units, up axis and frame rate, and shot layers state the shot's frame range.** They cost one node to author and are close to impossible to debug after the fact.

---

> **FIGURE 8 · The shot scene graph** — the fixed structure, what an asset looks like inside, and who owns which branch.

## 11. Materials

Lookdev and final render are always Houdini/Karma, so shading is authored in **MaterialX** and rendered by **Karma**. This section covers where material files live and how they are shaded. Colour management is project-wide infrastructure rather than a materials topic, and has its own section — see Section 17.

### 11.1 Where materials can live

**Option A — Inline in the lookdev file.** Material definitions sit directly inside `char-robot_lookdev.usda`, alongside the bindings. This is the right choice for small productions where materials are specific to one asset, you do not expect to share them elsewhere, and the overhead of separate files is not justified.

**Option B — Separate material definition files.** Material definitions live in their own files, and the lookdev assignment layer references them:

```
assets/char-robot/
    char-robot_lookdev.usda        ← references the below, adds bindings
    materials/
        char-robot_paint.usda
        char-robot_metal.usda
```

This is the right choice when materials are shared or reused across multiple assets, or when you want material definitions to be individually addressable for overrides.

**Be consistent within a project. Do not mix both approaches for the same asset.**

### 11.2 Library materials

Generic reusable materials — not specific to one asset — live in the library:

```
$LIBRARY/materials/metal-bare.usda
$LIBRARY/materials/plastic.usda
$LIBRARY/materials/glass.usda
```

Asset materials can reference library materials as a starting point. Changes to a library material affect every asset referencing it — communicate before changing one.

### 11.3 Shading: MaterialX and Karma

Author all shading in **MaterialX**. It is the USD-native shading standard, it is what Karma renders directly, and — unlike a renderer-specific VOP network — it survives the two things this pipeline depends on: USD interchange and the layering/override model. A MaterialX network travels with the asset and reads the same wherever the asset is referenced.

Use `mtlxstandard_surface` as the default surface. Build the network inside a **Material Library LOP** (a MaterialX subnet); Karma CPU and XPU both render it natively. Materials live under the asset's `/Mtl` scope (Section 10.4) and are attached with a `material:binding`. Keeping every asset's materials under `/Mtl` is what lets lookdev publish a consistent structure that downstream layers can find.

**`UsdPreviewSurface` is optional here.** Because lookdev and final render are always Karma, you do not need a separate preview surface for rendering. Author one only if you want assets to preview correctly in `usdview`, the Storm/GL viewport, or another DCC — it is a lightweight, portable fallback, not part of the Karma path.

**Binding strength is the technical basis for the lookdev/lighting boundary.** A material binding carries a strength (`bindMaterialAs`): the default `weakerThanDescendants` lets a more specific binding deeper in the hierarchy win, while `strongerThanDescendants` forces a binding to override descendants. This is the exact mechanism behind the lookdev/lighting boundary — a lighter can rebind or tweak a material in the shot's lighting block and have it win over the asset's own binding, without editing the asset. The override lives in the lighting layer; the asset is untouched. When an override reveals a real problem with the base material, the fix goes back to lookdev.

**Texture colour space is set by the channel token.** `bc` is colour-managed; `n`, `aormt` and `m` are raw data and must not be. Naming a texture correctly (Section 15.9) is what gets its colour space right — see Section 17.

---

## 12. Rigging

Rigging is the one place where the pipeline's normal shape does not quite fit, because **USD has no concept of a live rig**. Constraints, IK handles, control objects and muscle systems do not exist in USD and cannot be published as a USD layer. They live in Houdini.

The way through is to stop treating "rigging" as one handoff and split it into two independent contracts:

1. **How the rig reaches the animator** — a Houdini-side problem, solved with an HDA. USD is not involved.
2. **What animation publishes downstream** — a USD problem, solved with baked data. The rig is not involved.

Solve them separately and rigging stops being an exception. Each half becomes an ordinary instance of the rules the rest of this guide already uses.

### 12.1 The rig is published as an HDA

Do **not** hand the rig HIP to the animator to copy from. A copied rig network is a one-time snapshot: every later rig fix has to be re-merged by hand, and nothing tracks whether what the animator has is current. That is the same failure this pipeline exists to prevent, in HIP-land instead of USD-land.

Package the rig as a **digital asset (HDA)** instead, published into the asset's own folder beside its USD layers — `$ASSETS/char-robot/char-robot_rig.hda`. The animator installs that library once in their animation HIP (**File ▸ Import ▸ Houdini Digital Asset**, or the Asset Manager), drops one node, and has controls.

**Rig HDAs are not on the tab-menu scan path, and that is deliberate.** Only the handful of HIPs that animate a given character need it, and the alternative would put every rig in the project into every artist's tab menu. Generic project-wide tools do go on the scan path, in `houdini/otls/` (Section 16.3); rigs belong with the asset they rig.

The structure mirrors the HIP/USD split exactly:

| | Rig HIP | Rig HDA |
| --- | --- | --- |
| Example | `char-robot_rig_alex_v003.hip` | `char-robot_rig.hda` |
| Where it lives | The work tree (`$WORK`) | The project tree, in the asset's folder |
| Who owns it | The rigger, individually | The Rigging role, shared with the team |
| Versioning | Filename increments freely | Filename stable — SVN tracks history |
| Is it a deliverable? | No — never handed over | Yes — this is the handoff |

The HDA is the one thing in this pipeline that is a deliverable without being a USD layer. No layer resolves it, but an animator's HIP does, by path — so it lives in the project tree with the published data, not in the work tree with the HIP that built it (Section 8.3). That path reference is what makes updates work: the rigger republishes the HDA to the same filename and commits, the animator runs `svn update`, and because their scene points at the library rather than holding a copy, the definition refreshes in place with the animation on it intact.

**The HDA's interface is a contract.** Control names and parameter names are to rigging what prim paths are to everything else: rename or remove a control the animator has already animated on and their work breaks. Treat an interface change as a breaking change — coordinate before making it, exactly as Section 7.5 requires for prim paths.

**The HDA references the published model USD internally**, so the geometry it deforms is always the current published asset. That is plumbing inside the HDA; the animator never sees it.

### 12.2 What animation publishes

There is no single right answer here, and picking one globally is a mistake. Choose **per asset**, from three lanes, and prefer the simplest lane the asset allows. Two questions decide it: does the asset deform, and — if it does — are crowds, memory pressure or retargeting a real problem on this show?

**Lane 1 — Transform bake.** The default for rigid and mechanical assets: a robot, a vehicle, a mechanism, most props. Animation publishes time-sampled `xformOp` overrides on the prims that already exist under the instance path:

```
over "World" {
    over "Characters" {
        over "Hero" {
            over "Geo" {
                over "Head" {
                    double3 xformOp:translate.timeSamples = { ... }
                }
            }
        }
    }
}
```

Sparse, small on disk, readable, and it contracts only on the prim paths it overrides. This is the ideal citizen of this pipeline — use it wherever it is possible.

**Lane 2 — Deformed geometry bake.** The default for deforming characters. Publish time-sampled point positions as overrides on the model's existing meshes: SOP Import the deformed character and write it out. Files are heavier — publish as `.usdc` (Section 4.4) — but the renderer sees exactly what the animator saw and material bindings hold, because the prim hierarchy is untouched. The contract here is **topology**: point count and order must match the published model, so a model topology change is a breaking change for animation, on the same footing as a prim path rename (Section 7.5).

**Lane 3 — UsdSkel. Escalation only.** Publish the bind-pose skeleton (`char-robot_rig.usda`) with the asset and joint animation from the shot, and let the renderer skin at render time. This earns its complexity when you have crowds, memory pressure from many animated characters, or retargeting needs. It is also the most fragile corner of USD in practice — skinning is re-evaluated by Hydra, with more silent-failure modes than either lane above. For a small team's hero shots, you will probably never need it.

**Consequence:** the `_rig` USD block is only required in Lane 3. In Lanes 1 and 2 the asset assembly needs no skeleton at all, and the block should simply be omitted.

### 12.3 The update loop

Rigging and animation run on the standard daily loop, with no special cases:

```
Model republished
   → Rigger updates the rig against the new model, republishes char-robot_rig.hda, commits, notifies
   → Animator SVN updates; the HDA definition refreshes in their open scene
   → Animator verifies the animation still reads, re-bakes, republishes kilo-0010_anim.usdc, notifies lighting
```

Because both bake lanes publish *time-sampled* data, the stage timing conventions in Section 10.6 are a prerequisite, not a nicety: if `timeCodesPerSecond` disagrees between layers, animation plays at the wrong speed with no error anywhere.

### 12.4 A note on KineFX and APEX

This guide does not mandate a rigging technology. KineFX is the established path and the safer floor for a team new to Houdini; APEX is SideFX's forward direction and worth evaluating before you commit, particularly if character work will grow. The choice can wait and can differ per asset: because the USD contract in 12.2 is technology-agnostic — downstream sees only transforms, deformed points or UsdSkel data, never a rig — the decision lives entirely inside HIP-land and can be changed later without touching the pipeline.

---

## 13. VariantSets

VariantSets let a single asset carry named switchable alternatives, toggled without creating separate files.

### 13.1 When to use VariantSets vs separate files

| Situation | Use |
| --- | --- |
| Same asset, different LOD levels | VariantSet |
| Same asset, different damage states | VariantSet |
| Same asset, different seasonal look | VariantSet |
| Two genuinely different assets | Separate files |

### 13.2 Standard VariantSet names

| VariantSet | Variants | Notes |
| --- | --- | --- |
| `lodVariant` | `LOD0`, `LOD1`, `LOD2`… | Add as many levels as needed. LOD0 is highest detail. Matches Unreal Engine convention. |
| `damageVariant` | `pristine`, `damaged`, `destroyed` |  |

Do not invent alternate names without a team discussion. Consistent names allow programmatic access.

### 13.3 Who defines and who overrides

**Modelling** defines the VariantSet structure. **Assembly** sets the production default. **Layout and Lighting** can override the active variant in their own layers without touching the asset:

```
over "World" {
    over "Props" {
        over "CrateA" (
            variants = {
                string damageVariant = "damaged"
            }
        ) {
        }
    }
}
```

Note the syntax: `variants` is prim **metadata**, so it goes in the parentheses after the prim name — not inside the prim's body with the properties. Putting it in the body is a parse error, and it is the single most common mistake when hand-writing a variant override.

This opinion lives only in the overriding block (here, layout). The asset file is unchanged.

---

## 14. Instancing

When the same asset appears many times in a scene — rocks, trees, crowd characters, debris — placing each one as a separate Reference creates a scene graph with thousands of individually composed prims. This is slow to load and slow to render.

USD provides two mechanisms: **scene-level instancing** for a moderate number of repeated assets, and **PointInstancer** for very large numbers.

### 14.1 Scene-level instancing

When a prim is marked `instanceable = true`, USD recognises that all prims sharing the same composition structure can share a single composed prototype in memory. The scene graph shows each instance individually, but the underlying data is shared.

**The flag is authored where the asset is placed, not inside the asset.** `instanceable` goes on the prim that carries the reference — so it is set by whoever does the placing: the set dresser, or layout. The asset's own assembly knows nothing about it, which is correct, since the same asset may be instanced in one context and not in another.

```
# in sets/warehouse/set-warehouse_dressing.usda
def Xform "CrateA" (
    instanceable = true
    references = @../../assets/prop-crate/prop-crate.usda@
)
{
    double3 xformOp:translate = (4, 0, 2)
    uniform token[] xformOpOrder = ["xformOp:translate"]
}
```

**What you can and cannot override per instance.** This is the part that trips people up, and the boundary is not where most people guess. It is not about transforms versus materials — it is about the **instance root prim** versus everything **inside** the instance:

- **On the instance root prim — allowed, and does not fork the prototype:** the transform, visibility, and even the material binding. These properties live on the instance prim itself, above the shared prototype, so varying them costs nothing. Scatter a hundred crates at different positions, hide a few, bind three of them to a different material — still one prototype.
- **Inside the instance — not possible at all.** You cannot author an override on a prim beneath an instance. Descendants of an instance are *instance proxies*, and they are not editable. If you need to move the lid of one crate specifically, that crate cannot be an instance.
- **Forks the prototype:** a difference in the instance's **composition** — in practice, a different variant selection. Each distinct variant selection produces its own prototype. A handful of distinct variants is fine; a unique variant per instance defeats the purpose.

So: vary transforms, visibility and root-level bindings freely. If many instances need different *variants*, group them so each distinct look is one shared prototype, or use a PointInstancer. If any instance needs edits *inside* it, do not instance that one.

Use scene-level instancing for up to a few hundred repeated instances, where none needs internal edits, there are at most a handful of distinct variant selections, and the asset is complex enough that memory sharing matters.

### 14.2 PointInstancer

`UsdGeomPointInstancer` is the right tool for very large numbers of instances — foliage, rocks, crowd simulations, particle-driven props. It stores instances as a list of point positions, orientations and scales referencing a set of prototype prims, rather than as individual scene graph entries.

A PointInstancer can represent millions of instances with minimal scene graph cost. The tradeoff is that individual instances cannot easily carry overrides — they are all driven by the point data.

In Houdini, PointInstancers are most naturally generated from SOP networks using the **Copy to Points** pattern, then brought into Solaris via a SOP Import LOP. The resulting USD is compact and renderer-friendly.

Use this when you have hundreds to millions of instances, instances do not need individual overrides, and the content is driven procedurally.

### 14.3 Which to use

| Situation | Use |
| --- | --- |
| 5–200 repeated props varying by transform, visibility, or root-level binding | Scene-level instancing |
| Forests, rocks, ground cover, crowds | PointInstancer |
| A handful of manually placed assets | Plain references, no instancing needed |

---

**Part III — Reference**

*Sections 15–22 are for looking things up. Nobody reads them front to back.*

---

## 15. Naming Conventions

This section is the single reference for how all files, folders and prims are named. It applies to every project. When in doubt about a name, come here first.

**All of it is ours.** USD places almost no constraints on filenames, and none at all on the tokens and prefixes below. Everything here is a house convention, chosen so that a filename can be read — and parsed by tooling (15.10) — without opening it.

### 15.1 General rules

A filename is a sequence of **tokens**. The two separators have strict, non-overlapping jobs:

- **Underscore (`_`) separates tokens** — and nothing else. Each `_` marks a boundary between, say, the asset name and the block, or the block and the artist.
- **Hyphen (`-`) joins words inside a single token.** A multi-word name, block or descriptor is written with hyphens: `char-robot`, `set-living-room`, `fg-dressing`, `rough-pass`.
- **An underscore never appears inside a token, and a hyphen never separates tokens.** So `char-robot_model` is correct (name token `char-robot`, block token `model`); `char_robot_model` is wrong.

The remaining rules:

- All filenames and folders use **lowercase**
- No spaces
- No special characters
- No words like `final`, `latest`, `new`, `test`, `fix`, or `FINAL` — ever
- No dates in filenames
- No double underscores — if a token is omitted, remove its underscore too
- If a filename cannot be understood without opening it, it is wrong

Allowed characters: `a-z  0-9  _  -  .`

---

### 15.2 Asset prefixes

An asset name is a single token. Its first word is a category prefix:

| Category | Prefix | Examples |
| --- | --- | --- |
| Character | `char-` | `char-robot`, `char-hero`, `char-villain` |
| Prop | `prop-` | `prop-crate`, `prop-table`, `prop-lamp` |
| Environment | `env-` | `env-warehouse`, `env-ground`, `env-cliff` |
| Vehicle | `veh-` | `veh-truck`, `veh-hovercraft` |
| FX element | `fx-` | `fx-smoke`, `fx-sparks` |

The prefix is hyphen-joined to the rest of the name because it is part of one token, not a separate token. `env-` is for standalone environment geometry referenced into a set — terrain, ground planes, architectural shells, large background structures. The distinction from `set-`: an `env-` asset is a single reusable building block (the warehouse shell), while a `set-` is the dressed, assembled space that references environments, props and other assets together (the warehouse floor with crates, lighting and surface wear).

Sets use their own prefix:

| Category | Prefix | Examples |
| --- | --- | --- |
| Set | `set-` | `set-living-room`, `set-warehouse`, `set-forest-clearing` |

---

### 15.3 Sequence and shot codes

**Sequences** use 3–5 lowercase letters: `kilo`, `lima`, `zulu`

Those three are placeholders, and so is every sequence code in this guide's examples — a real project picks its own, usually something that names the location or the beat (`roof`, `chase`, `alley`). Whatever they are, they are decided once at the start of a project and recorded with it, not invented per shot by whoever sets one up first.

**Shots** use 4-digit numbers, incrementing by 10: `0010`, `0020`, `0030`. Incrementing by 10 leaves room to insert shots later without renumbering.

**Shot context** is a single token: the sequence and shot joined by a hyphen — `kilo-0010`, `lima-0020`. (In the folder tree the sequence and shot are separate directories, `kilo/0010/`; in filenames they form one token.)

> Note: Production tracking tools may display sequences as uppercase (KILO, LIMA). Filenames and folders always use lowercase.

---

### 15.4 Block names

A block is one sparse layer owning a single concern (Section 7.1). Its name is the last token in the published filename.

Block names are **free-form**, lowercase, and use **hyphens** for word separation within the block name (never underscores — underscores separate the asset/set/shot name from the block name). There is no closed list of valid block names; create whatever blocks a given asset, set or shot needs.

For consistency, use these conventional names for the common disciplines rather than inventing synonyms:

| Discipline | Conventional block name |
| --- | --- |
| Modelling | `model` |
| Lookdev | `lookdev` |
| Rigging | `rig` |
| Set / shot dressing | `dressing` |
| Layout | `layout` |
| Animation | `anim` |
| FX | `fx` |
| Lighting | `lighting` |

These are recommendations, not an enforced enum. When a block is more specific — a second lighting pass, a foreground dressing block, a per-room lighting block — name it descriptively with hyphens: `fg-dressing`, `room-a-lighting`, `key-light-pass`. The point is that the name communicates the block's single concern at a glance.

**`assembly` is not a block name.** An assembly file holds no scene opinions of its own and so carries no block token — it is named with the clean entity name (15.5). `assembly` is available as a *task* name for a HIP whose job is composing an entity's blocks, but composing an assembly is usually done in the same session as one of the blocks and needs no HIP of its own.

---

### 15.5 Published USD filenames

Assets, sets and shots are all named the same way: **blocks carry a block token, assemblies do not.**

| Tier | Block pattern | Assembly pattern |
| --- | --- | --- |
| Asset | `<asset>_<block>.<ext>` | `<asset>.usda` |
| Set | `set-<name>_<block>.<ext>` | `set-<name>.usda` |
| Shot | `<sequence>-<shot>_<block>.<ext>` | `<sequence>-<shot>.usda` (the shot root) |

Examples:

```
char-robot_model.usdc                 char-robot.usda
char-robot_lookdev.usda               prop-crate.usda
set-living-room_dressing.usda         set-living-room.usda
set-living-room_fg-dressing.usda      set-warehouse.usda
kilo-0010_layout.usda                 kilo-0010.usda
kilo-0010_anim.usdc
kilo-0010_fx-sparks.usdc              ← a second, more specific FX block
```

**Rules — identical for all three tiers:**

- No artist name, no version number, in any published USD filename
- The filename is stable — SVN tracks its history
- The assembly (and shot root) is always `.usda` — pure composition, kept readable and diffable
- Blocks choose their extension by content: `.usda` for composition, overrides and materials; `.usdc` for geometry, animation and caches (Section 4.4)

The assembly is the file downstream work references or subLayers — shots reference asset assemblies, and the shot root subLayers the set assembly (Section 7.4).

---

### 15.6 HIP filenames

One pattern covers every tier:

```
<context>_<task>[_<descriptor>]_<artist>_v###.hip
```

**`<context>` is what the work is about.** Usually an entity, named exactly as its published files are — `char-robot`, `set-living-room`, `kilo-0010`. Where one HIP covers several entities at once, it is instead a descriptive group name under the same token rules: `props-batch-a`.

As everywhere else in the guide, the *token* and the *folder* are spelled differently for sets and shots: the token is `set-living-room` where the folder is `living-room/`, and `kilo-0010` where the folders are `kilo/0010/` (15.2, 15.3). The HIP sits in the work tree folder for that context (Section 8.2); its filename uses the token.

**`<task>` is the work being done, not the block being written.** A session may publish one layer or several, so the task names the job rather than its output: `lighting` for a session that publishes the lighting block *and* the shot root, `model` for one that publishes eight props. Use the conventional discipline names from 15.4 where they fit.

**`<descriptor>` is optional.** When omitted, remove the token and its underscore entirely.

Examples:

```
kilo-0010_layout_ina_v001.hip
kilo-0010_anim_erik_v001.hip
kilo-0010_anim_blocking_erik_v002.hip      ← with descriptor
kilo-0010_lighting_maria_v003.hip          ← publishes the lighting block and the shot root
char-robot_model_alex_v001.hip
char-robot_rig_alex_v002.hip
char-robot_lookdev_maria_v001.hip
prop-lamp_model_ina_v002.hip               ← one HIP builds the whole asset
props-batch-a_model_alex_v002.hip          ← one HIP builds eight props
```

**Rules:**

- Always include the artist name — HIP files are personal working files
- Always include the version number
- Increment the version on meaningful saves, handoffs or significant changes
- The convention applies wherever the file sits — no local renaming schemes

---

### 15.7 Versioning

- Always `v###` — three digits, zero-padded
- Start at `v001`
- Increment meaningfully — not on every minor save, but on any save you might want to return to
- Never: `v1`, `v01`, `final`, `latest`, `v_real_final_2`

---

### 15.8 Good and bad examples

| Bad | Good | Why |
| --- | --- | --- |
| `char_robot_model.usdc` | `char-robot_model.usdc` | Underscore inside a name token — words within a token use hyphens |
| `final_anim_v2.hip` | `kilo-0010_anim_erik_v002.hip` | Missing shot context, no artist |
| `robotStuff.usd` | `char-robot_model.usdc` | Unclear asset, unclear task |
| `lighting_new_v5.hip` | `kilo-0010_lighting_maria_v005.hip` | Missing shot context, no artist |
| `test_render_latest.usd` | `kilo-0010_lighting.usda` | `latest` is not a version |
| `kilo-0010_anim__erik_v001.hip` | `kilo-0010_anim_erik_v001.hip` | Double underscore means empty token |
| `KILO-0010_layout.usda` | `kilo-0010_layout.usda` | Uppercase in filename |
| `char-robot_lookdev_v3_FINAL.usda` | `char-robot_lookdev.usda` | Version and FINAL in published USD |

---

### 15.9 Texture filenames

Pattern:

```
<asset-or-set>[_<descriptor>]_<channel>_<resolution>.<ext>
<asset-or-set>[_<descriptor>]_<channel>_<resolution>.<udim>.<ext>
```

The descriptor is optional. When omitted, remove the token and its underscore entirely. The channel token is a closed enum and acts as the parse anchor, making the descriptor unambiguous to both humans and tooling.

**Channel tokens — closed list, no other values permitted**

| Token | Meaning |
| --- | --- |
| `bc` | Base colour (RGB) |
| `n` | Normal (RGB) |
| `aormt` | AO / Roughness / Metalness (R / G / B in that order) |
| `m` | Mask (Grayscale) |

**Resolution tokens:** `1k`, `2k`, `4k`, `8k`  ·  **File formats:** `.exr`, `.png`, `.tif`  ·  **UDIM tiles** insert between resolution and extension.

```
char-robot_bc_4k.exr
char-robot_body_bc_4k.exr
char-robot_head_n_2k.exr
char-robot_aormt_4k.1001.exr
set-living-room_walls_aormt_4k.exr
```

Rules:

- The channel token list is closed. Do not invent new tokens without a team discussion.
- `aormt` channel order is always AO in R, Roughness in G, Metalness in B — never vary this.
- The channel also fixes the colour space: `bc` is colour-managed, while `n`, `aormt` and `m` are raw/linear data and must not be colour-managed. This is what OCIO's file rules rely on — see Section 17.
- All filenames follow the same general rules as the rest of the guide: lowercase, no spaces, no dates, no version numbers.

---

### 15.10 Regex validation patterns

For tooling and pre-commit checks.

Because `_` is the only token separator and tokens never contain `_`, every filename parses unambiguously: split on `_` and you have the tokens. A published block file is exactly `<name>_<block>` (one underscore); an assembly is `<name>` (no underscore). So the patterns below can validate structure, not just casing — though the authoritative record of which blocks actually exist for a tier is still the assembly's subLayer list (Section 7.1).

Every token has the same shape: `[a-z0-9]+(?:-[a-z0-9]+)*` — lowercase, words joined by hyphens, no underscores. The patterns simply chain tokens with `_`.

**Published asset/set block** (`<name>_<block>`; `.usda` or `.usdc`)

```
^[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*\.(usda|usdc)$
```

**Published asset/set assembly** (clean name, no underscore; `.usda` only)

```
^[a-z0-9]+(?:-[a-z0-9]+)*\.usda$
```

**Published shot block** (`<sequence>-<shot>_<block>`; `.usda` or `.usdc`)

```
^[a-z]{3,5}-[0-9]{4}_[a-z0-9]+(?:-[a-z0-9]+)*\.(usda|usdc)$
```

**Shot root** (`<sequence>-<shot>`; `.usda` only)

```
^[a-z]{3,5}-[0-9]{4}\.usda$
```

**HIP files** (`<context>_<task>[_<descriptor>]_<artist>_v###`)

```
^[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*(?:_[a-z0-9]+(?:-[a-z0-9]+)*)?_[a-z0-9]+(?:-[a-z0-9]+)*_v[0-9]{3}\.hip$
```

**Texture filename (non-UDIM)**

```
^[a-z0-9]+(?:-[a-z0-9]+)*(?:_[a-z0-9]+(?:-[a-z0-9]+)*)?_(bc|n|aormt|m)_(1k|2k|4k|8k)\.(exr|png|tif)$
```

**Texture filename (UDIM)**

```
^[a-z0-9]+(?:-[a-z0-9]+)*(?:_[a-z0-9]+(?:-[a-z0-9]+)*)?_(bc|n|aormt|m)_(1k|2k|4k|8k)\.[0-9]{4}\.(exr|png|tif)$
```

---

## 16. Paths and Environment Variables

Never hardcode absolute local paths. A path like `C:/Users/artist/Desktop/...` breaks the moment anyone else opens the file.

There are two different path problems here, and they have two different answers. Getting them mixed up is the most common way to build a pipeline that works on one machine and nowhere else.

### 16.1 The two kinds of path

**Paths in HIP files → environment variables.** Your USD ROP's output path, your Reference LOP's file path, your texture paths — these are Houdini parameters, and Houdini expands `$ASSETS`, `$SHOTS` and the rest when it evaluates them. Environment variables are exactly right here.

**Paths inside published USD files → relative to the layer.** The asset paths written *inside* a `.usda` — sublayers, references, payloads — are resolved by USD, not by Houdini. USD's default asset resolver **does not expand shell environment variables**. A published file containing `@$ASSETS/char-robot/...@` will resolve inside a Houdini session that happens to have the variable set, and fail everywhere else: in `usdview`, in another DCC, on a farm node with a different environment, for a vendor you send the file to. The alternative failure is just as bad — if Houdini expands the variable at write time instead, you get an absolute path baked into the published file, which is the thing this section opens by forbidding.

So published USD uses **relative paths**, anchored to the file that contains them:

```
# in assets/char-robot/char-robot.usda
@char-robot_model.usdc@

# in shots/kilo/0010/kilo-0010.usda
@kilo-0010_layout.usda@
@../../../sets/living-room/set-living-room.usda@
```

Relative paths need no configuration at all. The project can be moved, copied, checked out to a different drive letter or handed to someone outside the team, and every reference still resolves — because the folder structure travels with the files. They stay short, too, because every entity's layers sit in one folder (Section 8.1).

**Solaris already does this for you.** The USD ROP converts the paths you author into relative paths when it writes the file, by default. You author `$ASSETS/char-robot/...` in your parameters and get a relative path in the published USD without setting anything up — so this is a property of the pipeline to be aware of, not a step you have to perform.

**After every publish, check the paths that were actually written.** Open the file as text (or use `usdview`'s layer stack) and confirm the asset paths are relative and no absolute path was baked in. This belongs in the publish check (Section 18.1), and it is the single most common cause of "works for me, broken for everyone else."

### 16.2 Project variables

A project has **two roots**, because the project tree and the work tree live on different storage systems (Section 8). Everything else derives from one or the other.

| Variable | Points to | Tree |
| --- | --- | --- |
| `$PROJECT` | Project root | Project (SVN) |
| `$ASSETS` | `$PROJECT/assets/` | Project |
| `$SETS` | `$PROJECT/sets/` | Project |
| `$SHOTS` | `$PROJECT/shots/` | Project |
| `$LIBRARY` | `$PROJECT/library/` | Project |
| `$WORK` | Work root | Work (shared drive) |

Examples in use — in HIP parameters:

```
$ASSETS/char-robot/char-robot.usda
$SETS/living-room/set-living-room.usda
$SHOTS/kilo/0010/kilo-0010_anim.usdc
$LIBRARY/materials/metal-bare.usda
$WORK/shots/kilo/0010/lighting/
```

Inside a HIP, `$HIP` resolves to that HIP's owning folder, which is why Houdini's own defaults — `$HIP/geo`, `$HIP/sim`, `$HIP/render` — already point where they should (Section 8.2). Use `$WORK` when you need to reach across to another artist's working files; use `$HIP` for your own.

### 16.3 Distributing the environment: use a package

The variables have to reach every artist's Houdini. The obvious way is `houdini.env` — but `houdini.env` is read from each artist's **user preferences directory** (`$HOUDINI_USER_PREF_DIR`), not from the project. A copy sitting in the repo is not read by anything. It also allows only one project's settings at a time, so switching projects means hand-editing a file in your home directory.

Use a **package** instead. Houdini reads JSON package files from `packages/` directories on its path at startup, so the project can carry its own environment in the repo and artists opt in by pointing Houdini at it.

`$PROJECT/houdini/packages/project.json`:

```json
{
    "env": [
        { "PROJECT": "$PROJECT_ROOT" },
        { "ASSETS":  "$PROJECT_ROOT/assets" },
        { "SETS":    "$PROJECT_ROOT/sets" },
        { "SHOTS":   "$PROJECT_ROOT/shots" },
        { "LIBRARY": "$PROJECT_ROOT/library" },
        { "WORK":    "$PROJECT_WORK_ROOT" },
        { "OCIO":    "$PROJECT_ROOT/houdini/ocio/config.ocio" }
    ],
    "path": [
        "$PROJECT_ROOT/houdini"
    ]
}
```

Each artist sets two things — `PROJECT_ROOT`, wherever the SVN checkout lives on their machine, and `PROJECT_WORK_ROOT`, wherever the work drive is mounted — and everything else derives from those. `HOUDINI_OTLSCAN_PATH` is covered by the `path` entry, which is how project-wide tools in `houdini/otls/` reach everyone's tab menu. Rig HDAs are deliberately not there — they live with their asset and are installed per HIP (Section 12.1).

The advantages over `houdini.env`: the configuration is versioned in the repo with everything else, multiple projects can coexist, and the farm gets the identical environment by pointing at the same file. When the project's environment changes, it changes for everyone on the next SVN update.

If references are broken when you open a HIP, check the environment before anything else — open a Houdini shell and run `echo $ASSETS` and `echo $WORK` to verify both roots are resolving.

---

## 17. Colour Management (OCIO)

Colour is project infrastructure, in the same category as paths and units: decided once, applied everywhere, and painful to change once work exists. Mismatched colour configuration is the most common cause of "looks different on my machine / on the farm / in comp."

**One config, one place.** The `OCIO` environment variable points at a single, version-pinned config, set in the project package (Section 16.3) so that every artist *and the farm* resolve the same one. That is the part that matters — far more than which config you choose.

Houdini ships with a bundled ACES config, and for a small all-Karma team that is a reasonable default. Its exact name and version vary between Houdini builds, so check what you are actually on under **Edit ▸ OCIO Settings** rather than hardcoding a filename; if you want the config pinned against Houdini upgrades, copy it into `$PROJECT/houdini/ocio/` and point `OCIO` there.

**Set the working space once.** In Edit ▸ OCIO Settings, set the Render Working Space to **ACEScg** and the View Transform to an ACES SDR video transform. Houdini's defaults depend on the build and on whether an `OCIO` variable is present, so do not assume — open the settings, look, and set them deliberately at the start of a project. Where a project needs something other than ACEScg (a client delivery spec, a broadcast requirement), that is a project-level decision, written down with the project rather than carried in anyone's head.

**Texture colour spaces follow the channel tokens.** Houdini and Karma convert textures automatically from the OCIO file rules, and the channel tokens from Section 15.9 line up with those rules exactly: `bc` (base colour) is colour-managed (sRGB texture → working space); `n`, `aormt` and `m` are **raw/linear data** and must not be colour-managed. The packed `aormt` map in particular must be read raw, or roughness and metalness come out wrong. Naming a texture correctly is therefore also what gets its colour space right.

**Render output stays linear; the look is applied downstream.** Karma writes scene-linear EXRs. Render in ACEScg — set it on the Karma Render Settings LOP (Image Output ▸ AOVs ▸ Output Colorspace) or include the colour space in the output filename, since an unmarked EXR may be interpreted by a default file rule rather than by what you intended. Do not bake the display/view transform into the EXR you hand to comp; the view transform — and any filmic tone map under Karma Render Settings ▸ Image Output ▸ Filters — is for review and LDR deliverables, applied on top of the linear render, not burned into it.

**Do not let anyone override the config locally.** A per-artist OCIO setting is invisible to everyone else and produces exactly the class of bug this section exists to prevent.

---

## 18. Publishing

A USD file is not published until all of these are true:

- Exports without errors
- Loads correctly in a **fresh** Houdini session — not the one you authored it in
- Contains **only your layer** — no restated upstream data (check the Layer Break, Section 9.1)
- Asset paths written *inside* the file are **relative**, with no absolute path baked in (Section 16.1)
- Stage metrics are set: units, up axis, frame rate — and frame range on shot layers (Section 10.6)
- Default prim is set (for asset files)
- Follows naming conventions
- Committed to SVN
- Downstream artists notified if this affects their work

A file on disk that is not committed to SVN is not published — it exists only on your machine.

### 18.1 How to verify a publish

1. Write USD via the USD ROP.
2. Open the published file as text (or in `usdview`) and read the top of it — are the sublayer and reference paths relative? Is the metadata right?
3. Open a blank Houdini session.
4. Use a Sublayer or Reference LOP to load your file.
5. Check the scene graph tree — does it contain what you intended, and *only* what you intended?
6. Check the Houdini console for warnings.
7. Commit to SVN.

Step 5 cuts both ways, and it is the single most useful diagnostic in the pipeline. A layer with **less** in it than you expected usually means the Layer Break is too late, or a default prim is missing. A layer with **more** in it than you expected — the whole set, the assets — means the Layer Break is too early or missing, and you are about to republish someone else's work on top of them. Figure 7 draws both.

### 18.2 Versioned archives

Published USD filenames are stable. If you need versioned snapshots for rollback, use a `versions/` subfolder:

```
$SHOTS/kilo/0010/kilo-0010_anim.usdc              ← stable, referenced by others
$SHOTS/kilo/0010/versions/kilo-0010_anim_v001.usdc
$SHOTS/kilo/0010/versions/kilo-0010_anim_v002.usdc
```

Nothing in the pipeline references the `versions/` folder.

---

## 19. Source Control (SVN)

**SVN holds the project tree, and only the project tree** (Section 8.1). It is the record of what the production has produced — the published layers, and everything they resolve by path. Working files live on the work drive and are not part of it.

### 19.1 Commit these

- Published USD files
- Textures and material files
- Published caches (19.3)
- Rig HDAs
- Small project tools and scripts, and the project package
- Documentation

### 19.2 Do not commit these

- Working files — HIPs, source geometry, reference, scratch caches (these live in `$WORK`)
- Render outputs
- Houdini backup files (`.hip.bak`)
- Crash files
- Personal scratch files

The test for anything not on either list is the one in 8.3: **does a published layer resolve it by path?** If yes, it is production data and belongs in SVN. If nothing resolves it, it belongs in the work tree.

### 19.3 Caches that published layers depend on

That test matters most for caches, where the distinction is not about size:

- A **working cache** is scratch — an intermediate sim, a test wedge, anything only you will ever read. It lives in your HIP's owning folder, usually under `$HIP/geo` or `$HIP/sim`, and you can delete it freely.
- A **published cache** is any file a published USD layer *references* — the VDBs behind `kilo-0010_fx.usdc`, an Alembic a layer points at. These are production data, and they live in the project tree beside the layer that references them.

**Rule: anything a published layer references must live on shared storage that every artist and the farm can reach, at a path that does not change.** A published layer pointing at a cache in your working folder is a broken publish — it renders correctly for you and fails for everyone else, usually silently and usually at the worst moment.

Very heavy caches may need a separate volume rather than SVN; that is a team decision that depends on size. What is not optional is that the location is shared, stable and reachable from the farm. If a cache moves, treat it exactly like a renamed prim path: a breaking change requiring coordination.

### 19.4 SVN and binary files

`.usdc` files produce meaningless diffs. This is expected — SVN still tracks history correctly. For any layer where readable history is useful, prefer `.usda`.

---

## 20. Debugging Checklist

Work through this in order. Most problems are a file path issue, a prim path issue, a Layer Break issue, or a stale cache.

### File and path

- [ ]  Does the file exist at the referenced path?
- [ ]  Are both project roots resolving? (`echo $ASSETS`, `echo $WORK` — Section 16.3)
- [ ]  Is the HIP parameter using `$ASSETS` / `$SHOTS` — not a local absolute path?
- [ ]  Are the paths written *inside* the published USD relative — not `$VARIABLE`, not absolute? (Section 16.1)
- [ ]  Does SVN have the latest upstream file?

### Prim paths

- [ ]  Does the prim you are referencing exist in the upstream file? (Check in `usdview`)
- [ ]  Did an upstream artist rename a prim path without communicating it?
- [ ]  Is the default prim set on the asset? (Check the USDA header)
- [ ]  Is the asset placed at the correct instance path? (`/World/Characters/Hero`, not `/CharRobot`)

### Layer and composition

- [ ]  Is your Layer Break placed correctly — context before it, your contribution after it? (Section 9.1)
- [ ]  Is your published layer **empty of your own work**? The break is probably too late — your own references or cameras fell before it.
- [ ]  Is your published layer **full of upstream data**? The break is too early, or missing.
- [ ]  Are all expected layers in the shot root? (Open `kilo-0010.usda` in a text editor)
- [ ]  Is layer order in the shot root correct? (Earlier listed = stronger)
- [ ]  Is a stronger layer overriding your value unexpectedly? (Use the composition arc inspector)

### Solaris-specific

- [ ]  Are your edits going into the correct layer? (Check the Active Layer indicator)
- [ ]  Is your USD ROP writing only your layer — not the full flattened stage?
- [ ]  Did you reload references after an upstream change?
- [ ]  Are you looking at a cached version that has not updated?

### Stage metrics and time

- [ ]  Does every layer agree on `metersPerUnit` and `upAxis`? (An asset arriving 100× too large or small is a units mismatch, not a modelling error — Section 10.6)
- [ ]  Does `timeCodesPerSecond` match the Houdini scene FPS everywhere? (Animation at the wrong speed with no error)
- [ ]  Does the shot have `startTimeCode` / `endTimeCode` authored in the layout block? (Wrong farm frame counts)

### Rigging and animation

- [ ]  Did you SVN update to get the current rig HDA? (Section 12.1)
- [ ]  Did the HDA's control interface change — are your keys still on controls that exist?
- [ ]  For a deformed-geometry bake: does point count and order still match the published model? (Section 12.2, Lane 2)
- [ ]  For UsdSkel: does the skeleton in the published rig USD match what the animation bake expects?
- [ ]  If the rig was updated, was animation re-baked from the new rig?

### Common silent failures

- [ ]  Reference LOP with no default prim and no explicit prim path — produces nothing, no error
- [ ]  Material binding pointing to a prim that was renamed in a model update
- [ ]  FX cache with an absolute or local path that resolves on your machine but not others (Section 19.3)
- [ ]  A variant override written with `variants` inside the prim body instead of its metadata — a parse error, easy to misread (Section 13.3)
- [ ]  An override authored on a prim *inside* an instanceable prim — instance proxies are not editable and the edit is silently ignored (Section 14.1)

> 👉 Most problems are path problems, prim path problems, or a missing Layer Break. Start there.

---

## 21. Core Rules

1. One role owns one USD layer at a time.
2. Every HIP has an owning folder holding all its versions and everything it depends on.
3. Never edit a layer you do not currently own.
4. Always publish USD before handing off.
5. Never pass a HIP file as a deliverable.
6. Published USD filenames stay stable — they do not version.
7. Always use environment variables for paths in HIP parameters.
8. Set a default prim on every published asset USD.
9. Place a Layer Break between context and contribution — and verify what actually got published.
10. Environment variables in HIP parameters; relative paths inside published USD.
11. Every published layer states its units, up axis and frame rate.
12. Anything a published layer references must live on shared storage at a stable path.
13. Communicate upstream changes to downstream artists — flag prim path changes, HDA interface changes and topology changes explicitly.
14. Keep HIP files organised and readable.
15. If unsure who owns a layer, ask before editing.

---

## 22. Mental Models

**USD is like Photoshop layers.** Each role adds a layer. No one paints on a layer someone else currently has. The final image is the composite. If you want something changed in a layer you do not own, you talk to the person who does — or, if they have moved on, you take the layer over and carry on.

**Published paths are contracts.** When you publish `kilo-0010_anim.usdc`, that path is a contract with every downstream layer. Renaming or moving the file breaks their work. Honour the contract, or coordinate the change explicitly before making it — and prim paths are contracts on exactly the same footing, because a reference that finds the right file but the wrong prim fails silently.

**Context is not contribution.** What you load to work against and what you publish are two different things. The Layer Break is where you draw the line between them. Nearly every publishing bug in this pipeline is that line drawn in the wrong place.

**Roles are hats, not walls.** On a small team you may wear many hats. The rules still apply — you apply them to yourself. Once you have published a layer and the next stage has built on it, treat it as handed off.

---

**Part IV — Putting It Together**

---

## 23. Worked Example: Full Production Cycle

This is the shot from Section 1, built start to finish. Four people, each covering several roles:

| Artist | Roles |
| --- | --- |
| Alex | Modelling, Rigging, Assembly |
| Maria | Lookdev, Set Lighting, Set Lookdev, Shot Lighting |
| Ina | Set Dressing, Layout |
| Erik | Animation |

---

### Phase 1 — Asset creation

**Alex: Modelling**

Works in `$WORK/assets/char-robot/model/`, saving versions as he goes. Builds geometry in SOPs and establishes the prim hierarchy in Solaris. On a **Configure Layer LOP**, sets the default prim to `CharRobot` and the stage metrics — Y up, `metersPerUnit = 1`, project frame rate (Section 10.6). Publishes `$ASSETS/char-robot/char-robot_model.usdc`, verifies in a fresh session, commits. Notifies Maria: *"Model published. Prim root `/CharRobot`, geometry under `/CharRobot/Geo`. Y up, metres."*

---

**Alex: Rigging** (parallel with Maria)

Works in `$WORK/assets/char-robot/rig/` — a separate task, so a separate owning folder. References the model USD and builds the rig. The robot is mechanical and does not deform, so this is a **Lane 1** asset (Section 12.2): animation will publish transform overrides and no bind-pose skeleton is needed, so the rig publishes no USD at all. What it publishes is the **rig HDA**: `$ASSETS/char-robot/char-robot_rig.hda`. Commits, and notifies Erik: *"Rig published as `char-robot_rig.hda`, in the asset folder — SVN update and install it in your anim scene. Controls are `ctrl_root`, `ctrl_spine`, `ctrl_arm_l/r`. Shout before you key anything if you want names changed; once you have animation on them they are frozen."*

Note what did *not* happen: Erik was not sent a HIP file to copy from. When Alex fixes the rig next week, he republishes the HDA, Erik runs `svn update`, and the definition refreshes inside Erik's existing scene with his animation intact.

---

**Maria: Lookdev** (parallel with rigging)

SVN updates. Works in `$WORK/assets/char-robot/lookdev/`, with her turntable renders landing in `$HIP/render` by default. References the model USD for context, and builds MaterialX materials under `/CharRobot/Mtl`, inline in the lookdev file (Option A — small production).

```
[Reference: char-robot_model.usdc]   ← context: the geometry to shade
[Layer Break]                        ← after this: Maria's contribution
[Material Library: MaterialX networks]
[Assign Material: bindings]
[Configure Layer: metrics]
[USD ROP → char-robot_lookdev.usda]
```

Publishes `$ASSETS/char-robot/char-robot_lookdev.usda`. Opens the published file as text and confirms it contains materials and bindings — not a copy of the geometry. Notifies Alex: *"Lookdev done. Ready for assembly."*

---

**Alex: Assembly**

SVN updates and reopens his model HIP — assembling this asset is four nodes and does not need a session of its own. Sublayer LOPs bring in the lookdev and model blocks (no rig block — Lane 1 asset), a Configure Layer LOP sets `CharRobot` as the default prim, an **Add Variant / Set Variant** LOP sets production defaults for any VariantSets modelling defined, and a second USD ROP writes the assembled file. That HIP now publishes two layers, which is normal (Section 3.1).

```
#usda 1.0
(
    defaultPrim = "CharRobot"
    metersPerUnit = 1
    upAxis = "Y"
    subLayers = [
        @char-robot_lookdev.usda@,
        @char-robot_model.usdc@
    ]
)
```

Alex opens it as text and checks the two things that matter: the sublayer paths are **relative**, and there are no scene opinions in the file — only composition.

Publishes `$ASSETS/char-robot/char-robot.usda`. Notifies Ina and Maria: *"char-robot.usda ready. Set dressing and shot layout can begin."*

---

### Phase 2 — Set creation

Set creation happens in parallel with asset work where possible, but requires the relevant assets to be published first. Ina and Maria build the living room — the persistent shared space every shot in this location will use.

---

**Ina: Set Dressing**

SVN updates. Opens her dressing HIP in `$WORK/sets/living-room/dressing/` and places the prop and furniture assets in the world. This layer establishes the full spatial layout of the room.

```
[Reference: prop-sofa.usda → /World/Props/Sofa]
[Reference: prop-table.usda → /World/Props/CoffeeTable]
[Reference: prop-lamp.usda → /World/Props/FloorLamp]
[Transform edits — position, rotate, scale each prop]
[Configure Layer: metrics]
[USD ROP → set-living-room_dressing.usda]
```

**No Layer Break here.** The stage starts empty and the references *are* Ina's contribution — placing those props is the entire job of set dressing. A Layer Break placed after the references would discard them and publish a file containing transform overrides on prims that do not exist: an empty set, no error (Section 9.1).

Publishes `$SETS/living-room/set-living-room_dressing.usda`. Notifies Maria: *"Set dressing published. Ready for set lighting."*

---

**Maria: Set Lighting** (once dressing is published)

SVN updates. SubLayers the dressing block to see the dressed space, then breaks — the room is context she is lighting against, not something she republishes. Adds the practicals: the floor lamp, ceiling fixtures, anything physically in the room and on regardless of which shot is filmed here.

```
[Sublayer: set-living-room_dressing.usda]   ← context
[Layer Break]                               ← after this: Maria's lights only
[Sphere Light → /World/Lighting/FloorLampPractical]
[Rect Light → /World/Lighting/CeilingFixture]
[Configure Layer: metrics]
[USD ROP → set-living-room_lighting.usda]
```

Publishes `$SETS/living-room/set-living-room_lighting.usda`. Checks the published file: two lights, no furniture.

---

**Maria: Set Lookdev** (optional — as needed)

If the location needs surface overrides that are not part of any individual asset — worn paint on these particular walls, staining on this floor — Maria adds them in `set-living-room_lookdev.usda`, with the same context-before-break structure.

---

**Ina: Set Assembly**

SVN updates and reopens her dressing HIP, adding Sublayer LOPs that stack the set's blocks and a second USD ROP to write the assembled file.

```
#usda 1.0
(
    metersPerUnit = 1
    upAxis = "Y"
    subLayers = [
        @set-living-room_lighting.usda@,
        @set-living-room_lookdev.usda@,
        @set-living-room_dressing.usda@
    ]
)
```

Publishes `$SETS/living-room/set-living-room.usda`. Notifies the team: *"Set published. Shot layout can begin."*

---

### Phase 3 — Shot production

**Ina: Layout**

SVN updates. Her layout HIP, in `$WORK/shots/kilo/0010/layout/`, subLayers the assembled set for context — already dressed and lit with its practicals — then breaks. Her job is the camera, the robot's placement for this shot, and the shot's frame range.

```
[Sublayer: set-living-room.usda]        ← context: the shared space
[Layer Break]                           ← after this: Ina's shot contribution
[Reference: char-robot.usda → /World/Characters/Hero]
[Camera LOP → /World/Cameras/Main]
[Transform edits, shot-specific set overrides if needed]
[Configure Layer: metrics + startTimeCode 1001, endTimeCode 1100]
[USD ROP → kilo-0010_layout.usda]
```

The break placement is the thing to get right, and it is the opposite of what it looks like at first glance. The **set** comes before the break: Ina is not republishing the living room. The **robot reference and the camera** come after it: those are her deliverables, and a break placed after them would silently strip the character and camera out of the published shot. The test is Section 9.1's — *if this vanished from my file, would my work be missing?*

Publishes `$SHOTS/kilo/0010/kilo-0010_layout.usda`. Notifies Erik: *"Layout published. Hero at `/World/Characters/Hero`, camera at `/World/Cameras/Main`. Frames 1001–1100."*

---

**Erik: Animation**

SVN updates — which brings him both the layout block and any rig HDA changes.

His animation HIP, in `$WORK/shots/kilo/0010/anim/`, does two things. For **context**, it subLayers the shot's stack so far, in shot root order: the set, then layout. This is the most common confusion when people first work this way — the layout block on its own is sparse, holding a camera and a reference to the robot and nothing else, so the living room only appears when the set is subLayered beneath it.

For **authoring**, `char-robot_rig.hda` is installed as an asset library, giving Erik live controls. He animates on those, then bakes: this is a Lane 1 asset, so the bake extracts per-part transforms and a SOP Import LOP brings them onto the stage as time-sampled overrides on the prims layout already established.

```
[Sublayer: set-living-room.usda]        ← context (weakest)
[Sublayer: kilo-0010_layout.usda]       ← context
[Layer Break]                           ← after this: Erik's animation only
[SOP Import: baked transforms → /World/Characters/Hero/Geo/...]
[Configure Layer: metrics]
[USD ROP → kilo-0010_anim.usdc]
```

Published as `.usdc` — it is time-sampled cache data, not composition (Section 4.4).

Publishes `$SHOTS/kilo/0010/kilo-0010_anim.usdc`. Notifies Maria: *"Anim published, kilo-0010. Rough pass."*

---

**Maria: Shot Lighting**

SVN updates. Works in `$WORK/shots/kilo/0010/lighting/`. Same pattern: subLayer the stack so far for context — set, layout, anim, in shot root order — then break. The practicals from the set are already present in that context; her job is the hero lighting that shapes this shot.

```
[Sublayer: set-living-room.usda]        ← context (weakest)
[Sublayer: kilo-0010_layout.usda]       ← context
[Sublayer: kilo-0010_anim.usdc]         ← context
[Layer Break]                           ← after this: Maria's lighting only
[Sphere Light → /World/Lighting/KeyLight]
[Sphere Light → /World/Lighting/RimLight]
[Karma Render Settings → /Render]
[Configure Layer: metrics]
[USD ROP → kilo-0010_lighting.usda]
```

As the last artist in the shot chain, Maria also creates the shot root — a second USD ROP in the same HIP, since it is five lines of composition and needs no session of its own. Note that it subLayers the **set** directly as the weakest layer, which does not arrive through any block (Section 7.4):

```
#usda 1.0
(
    metersPerUnit = 1
    upAxis = "Y"
    subLayers = [
        @kilo-0010_lighting.usda@,
        @kilo-0010_anim.usdc@,
        @kilo-0010_layout.usda@,
        @../../../sets/living-room/set-living-room.usda@
    ]
)
```

Five lines, and the whole shot is legible: every ingredient named, strongest first. This is the file Figure 2 resolves, and the file the renderer is handed.

Publishes both `kilo-0010_lighting.usda` and `kilo-0010.usda`, and renders from the shot root — interactively via the USD Render ROP, or on the farm with Husk (Section 9.6).

---

### When something changes upstream

**If the robot model updates.** Alex republishes `char-robot_model.usdc`. Assuming prim paths and topology are stable, the change propagates automatically through the assembly to everything downstream. Maria checks her lookdev bindings, Alex verifies the assembly and republishes the rig HDA if the rig needs adjusting, Ina and Erik reload and verify their layers. If prim paths *did* change, this is a breaking change and must be flagged explicitly (Section 7.5) — every downstream override targets those paths by name, and they will fail silently.

**If the rig updates.** Alex republishes `char-robot_rig.hda`. Erik runs `svn update` and the definition refreshes in his open scene. If only rig internals changed, Erik's animation is untouched and he simply re-bakes. If Alex renamed or removed a control Erik has keys on, that is a breaking change and needed coordinating before it happened (Section 12.1).

**If the set dressing changes.** Ina updates `set-living-room_dressing.usda` and republishes. Because `set-living-room.usda` subLayers it by stable relative path, the assembled set reflects the change automatically. Maria reloads her set lighting HIP to verify the practicals still read against the new arrangement. Every shot that subLayers the set gets the update on next reload — no per-shot work.

**If a shot needs a set override.** The coffee table is pushed aside for a stunt. That override lives in the shot's layout block, not in the set, and because the set is the weakest layer in the shot root, layout's opinion wins automatically. Other shots are unaffected; the coffee table remains where set dressing left it everywhere else.

In all four cases the rule from 7.5 governs: republish only if your own layer has actually changed or broken.

---

## 24. Further Reading

Authoritative references for going deeper. The OpenUSD links cover the standard itself; the SideFX links cover how Houdini implements it.

**OpenUSD (the standard)**

- [Introduction to OpenUSD](https://openusd.org/release/intro.html) — Pixar's overview of what USD is and why it exists.
- [OpenUSD Glossary](https://openusd.org/release/glossary.html) — canonical definitions of stage, layer, prim, composition arc, LIVRPS, instancing, and the rest.
- [Pixar OpenUSD](https://www.pixar.com/openusd) — the project's home page.
- [Alliance for OpenUSD (AOUSD)](https://aousd.org) — the body standardising USD across vendors.

**Houdini: Solaris, Karma, Husk**

- [Solaris / LOPs documentation](https://www.sidefx.com/docs/houdini/solaris/) — the LOPs context this whole guide is built on.
- [LOPs & USD Glossary](https://www.sidefx.com/docs/houdini/solaris/glossary.html) — USD terms mapped to Houdini's wording; useful where the two differ.
- [Karma documentation](https://www.sidefx.com/docs/houdini/karma/) — the renderer, CPU and XPU.
- [husk command-line renderer](https://www.sidefx.com/docs/houdini/ref/utils/husk.html) — the full, version-specific flag reference for farm rendering (Section 9.6).
- [Digital assets (HDAs)](https://www.sidefx.com/docs/houdini/assets/) — how rigs are packaged and published (Section 12.1).
- [USD Render ROP](https://www.sidefx.com/docs/houdini/nodes/out/usdrender.html) — rendering the stage from inside Houdini.
- [Colour management (OCIO) in Houdini](https://www.sidefx.com/docs/houdini/solaris/ocio.html) — the authoritative version of Section 17.

**Shading and colour**

- [MaterialX](https://materialx.org/) — the shading standard used for lookdev (Section 11.3).
- [UsdSkel schema](https://openusd.org/release/api/usd_skel_page_front.html) — the skeletal animation schema, if you reach Lane 3 in Section 12.2.
- [Houdini packages](https://www.sidefx.com/docs/houdini/ref/plugins.html) — how the project environment reaches each artist (Section 16.3).
- [OpenColorIO](https://opencolorio.org/) — the colour-management system behind the OCIO config (Section 17).

---

*End of guide.*
