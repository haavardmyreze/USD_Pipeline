# Houdini Solaris / USD Pipeline Guide

---

### Table of Contents

**Part I — Understanding USD**

1. Introduction
2. What USD Is
3. The Mental Shift
4. The Two Files: HIP and USD
5. USD in Depth

**Part II — How the Pipeline Works**

6. Roles
7. The Daily Loop
8. Naming at a Glance
9. The Pipeline
10. Scene Graph Conventions
11. Materials
12. Rigging
13. Solaris Essentials
14. VariantSets
15. Instancing

**Part III — Reference**

16. Naming Conventions
17. Folder Structure
18. Paths and Environment Variables
19. Colour Management (OCIO)
20. Publishing
21. Source Control (SVN)
22. Debugging Checklist
23. Core Rules
24. Mental Models

**Part IV — Putting It Together**

25. Worked Example: Full Production Cycle
26. Further Reading

---

## 1. Introduction

This is our production guide for building work in Houdini, using Solaris and USD. It covers how we name things, where they live, who owns what, and how work moves between us.

It applies to every project we take on, not to any one of them. That is the point of having a standard: the next project looks like the last one, so what you learn once keeps paying off, and anyone can move onto a job already knowing the ground rules.

It is written for everyone who touches a shot — modelling, lookdev, rigging, layout, animation, FX, lighting. On a small team one person covers several of those. That changes nothing about the rules; it just means one person owns more of the layers.

### 1.1 Why we work this way

Two artists need the same shot on the same afternoon. One is adjusting the camera; the other is animating the character it is pointing at. In a single-file pipeline there are only three ways that ends: one of them waits, one of them loses work, or someone spends the evening merging two files by hand and hoping nothing was missed.

That is the problem this pipeline exists to solve, and most of what follows is a consequence of solving it.

On a traditional production — Maya, Cinema 4D, Blender — a scene lives in one file holding everything: geometry, materials, animation, lighting, cameras, render settings. That is a good format for one person working alone. It stops being one the moment two people need it at once:

- Only one artist can safely have it open
- Files get locked, or silently overwritten
- Merging two artists’ changes is manual, difficult, and easy to get wrong
- It is hard to know what changed, when, or why
- The file grows heavier and more fragile as production continues

Every one of those tools has an answer — references, XRefs, linked files — and those answers genuinely work up to a point. Where they run out is worth naming precisely, because it is exactly what USD fixes. They let you *split* a scene, but they give you no shared rules for how the pieces recombine: every studio invents its own, informally, and the conventions end up living in people’s heads rather than in the format. Changing upstream data from downstream is possible in some of them and fragile in all of them.

**USD is the missing shared system.** It defines a consistent way for many partial files to combine into one coherent scene at runtime. No single file owns the scene. Every artist contributes their own, and the scene is assembled from those contributions automatically — including, and this is the part that changes how a team works, contributions that override what someone upstream authored without touching their file.

Nobody waits. Nobody merges. Nobody loses work.

### 1.2 The pipeline in one page

Before any of the detail, here is the shape of the whole thing. Strip everything else away and it is four ideas.

**Work in HIP, publish USD.** Your Houdini file is your workspace — personal, versioned freely, never handed to anyone as a deliverable. When your part is ready you *publish* a USD layer: a small file containing only your contribution, written to a fixed path that never changes. That published file is what other people build on. (Sections 4, 20)

**Layers stack, and the strongest opinion wins.** Nobody edits anybody else’s file, ever. You author your opinions in your own layer, and USD composes every layer into a single scene at runtime, resolving conflicts by a fixed strength order. This is what lets a lighter nudge a prop the layout artist placed — and keep the nudge when layout republishes. (Sections 5, 9)

**Three tiers, one shape.** **Assets** are built once and reused: characters, props, vehicles. **Sets** assemble assets into spaces that persist across shots. **Shots** add what is unique to one moment — camera, animation, effects, lighting. All three are built identically: a handful of sparse **blocks**, one per concern, plus a small **assembly** file that composes them. Learn the shape once and it applies everywhere. (Section 9)

**SVN carries the work between us.** A file only reaches other people when it is committed. You update at the start of a task, publish and verify at the end, and commit. Upstream changes arrive when *you* choose to update, not the moment someone else republishes — which is deliberate, and means nothing shifts under you mid-task. (Sections 7, 21)

Put together, every working day looks the same:

```
SVN update  →  open your HIP  →  work  →  publish USD  →  verify  →  SVN commit
```

That loop is the pipeline. Everything else in this guide is detail in service of one of those six steps.

### 1.3 What we get out of it

USD was built for productions far larger than ours, and much of what it can do we will never need. These five things are what we actually want from it — and what the overhead in 1.4 is buying:

- **Parallel work on the same shot.** Layout, animation, FX, and lighting proceed at once, without waiting, locking, or merging.
- **Overrides that survive.** A lighter can adjust something layout authored, and when layout republishes, the adjustment still applies.
- **Sets built once, used everywhere.** A room is dressed and lit one time. Every shot in that location inherits it, and fixing the room fixes every shot at once.
- **One file to render, with links that hold.** The farm is handed a single shot file that pulls in everything through composition — no scene assembly step, no exports to keep in sync. And because every link between those files is a relative path to a stable location (Section 18), it resolves the same on a farm node as on the machine it was authored on. Missing textures and broken references on submission — the classic farm failure — largely stop happening, because the links are part of the published data rather than something reconstructed at submission time.
- **A history that means something.** Every change is a commit by a named person with a reason attached, and any state can be recovered.

If a rule in this guide ever seems arbitrary, the right question to ask is which of those five it serves.

### 1.4 What it costs

It would be dishonest to present this as free. There are three real costs, and knowing them in advance makes them much easier to live with.

**More files, and a publishing step.** A shot that used to be one scene file is now a set, an assembly, and four blocks. You cannot simply save and tell someone it is ready — you publish, verify, and commit. Early on this feels like ceremony for its own sake. It is the price of the parallelism, and it stops feeling like overhead at about the point two people first work the same shot on the same afternoon.

**Failures are silent.** This is the important one. A traditional scene file that is broken usually tells you so. USD’s characteristic failure is *nothing happening*: a reference pointing at a prim path that no longer exists produces an empty result and no error at all. Much of this guide — the Layer Break discipline, the default-prim rule, the verify-in-a-fresh-session habit, the whole debugging checklist in Section 22 — exists because of this one property. Build the habit of checking what you published rather than assuming it worked.

**Discipline is load-bearing.** In a single-file pipeline, conventions are tidiness. Here, a filename, a prim path, or a published path is a contract that other people’s files depend on by name. Breaking one quietly breaks someone else’s work, often with no visible error. The naming rules in this guide are not aesthetics.

Below a certain scale — one artist, one shot, one afternoon — this overhead genuinely is not worth it. We are past that scale, which is why we work this way.

### 1.5 What does not change

Most of your work is unaffected. Modelling is still modelling. Lookdev is still building materials and looking at them. Animation is still animation. SOPs are still SOPs, and Houdini is still Houdini.

What changes is the **handoff**: where your work goes when you are finished with it, and how someone else builds on it. That is the entire subject of this guide. If it feels like a lot of rules, notice that nearly all of them are about the boundaries between people’s work rather than the work itself.

### 1.6 What this guide is not

It is not a USD reference and not a Houdini tutorial. Where you want the underlying standard or the Houdini implementation in full, Section 26 points at the authoritative sources.

Which means a fair amount of what follows is **ours, not USD’s** — decided here rather than inherited from the standard. The tier names (asset, set, shot), the **block** and **assembly** vocabulary, the whole naming grammar, the fixed `/World` scene graph, and the ownership rules are all conventions we chose; another studio would choose differently and be equally correct. USD itself only supplies the machinery underneath: stages, layers, prims, opinions, and the composition rules that resolve them. The distinction matters when you go looking for help — searching the OpenUSD docs for “block” or asking about our “assembly file” on a forum will not get you far, because those are house words. Where a convention is ours rather than USD’s, this guide flags it — Section 2 covers the two terms most likely to trip you up, and Sections 9, 10, and 16 mark the areas that are entirely our own.

### 1.7 Where to start

| You are… | Read… |
| --- | --- |
| New to USD | Part I (Sections 1–5) in order, then Part II |
| Starting a task | Section 7 (the daily loop) + Section 8 (naming at a glance) |
| Looking up a filename pattern | Section 16 (naming conventions) |
| Setting up a new project | Section 17 (folder structure) + Section 18 (paths) + Section 19 (colour) |
| Going deeper on USD | Section 5 (USD in Depth) |
| Something is broken | Section 22 (debugging) |
| Onboarding someone | Part I, then walk through Section 25 together |

If you are new to all of this, read Part I in order before you open Houdini. It is short, and everything after it assumes it.

---

## 2. What USD Is

USD — Universal Scene Description — was developed at Pixar and open-sourced in 2016. It is easy to think of it as a file format, but it is really three things stacked together:

- **A set of file formats** — `.usda` (readable text), `.usdc` (compact binary), `.usd` (either of those), and `.usdz` (a packaged archive). These hold the data.
- **A scene-graph data model** — a standard way to describe geometry, materials, cameras, lights, and their hierarchy, so every tool reads the same scene the same way.
- **A composition engine** — the rules for combining many files into one scene.

The composition engine is the part that matters, and it is what makes everything else in this guide possible. It lets many separate files each state *opinions* about the same scene, then resolves them into a single result by strict, predictable rules. No file has to contain the whole scene — each file contributes a part, and USD assembles them.

A few words you will see throughout. These four are USD's own, and mean the same thing everywhere in the industry:

- A **stage** is the fully composed scene — what you actually see in the viewport and render. It lives in no single file; it is the result of combining files.
- A **layer** is a single USD file — one `.usda` or `.usdc` on disk — and everything it contributes to the scene. Layers are the unit of collaboration: each artist authors their own layer, and each published file in this pipeline is one.
- A **prim** (primitive) is a node in the scene hierarchy — a mesh, a light, a camera, a transform, a material.
- An **opinion** is a single statement of a value on a prim — the intensity of a light, the position of an asset, the roughness of a material. Many layers can hold opinions about the same value; composition decides which one wins.

This is what makes the pipeline work: a downstream artist can override a value an upstream artist authored **without modifying the upstream file**. The lighter can move a prop the layout artist placed, and if layout later republishes, the lighter's override still applies on top. Because of that, "the scene" is not a file anyone owns — it is assembled at runtime from everyone's layers.

Two words we use constantly are **not** USD's. Both name a category of layer — in this pipeline every published USD file is either a block or an assembly, and nothing else. A **block** is one artist's sparse contribution: a single concern (a model, an animation, a lighting pass) authored by one person. An **assembly** is a small file that owns no scene data of its own and exists only to compose a set of blocks into one addressable thing. Assets, sets, and shots are all built from blocks gathered under an assembly (Section 9).

Both words are worth flagging now because each collides with something USD already means. USD uses "blocking" for suppressing a value, and Houdini's Layer Break is about blocking layers — so "block" has three unrelated senses in play across this pipeline. And USD has its own `assembly`, a model kind, which is a different idea from our assembly file entirely. Section 9 defines our two properly.

> 👉 If you remember one thing: USD is a composition engine. Files contribute opinions; USD composes them into a stage. Section 5 covers the mechanics — layers, prims, composition arcs, and the strength order that decides which opinion wins.
> 

### A concrete example

Take one shot: a robot walking through a warehouse, and four artists who all need to work on it at once — one placing the robot and camera, one animating the walk, one adding smoke and sparks, one lighting the scene.

The robot is an **asset**, built and textured once. The warehouse is a **set**, dressed and lit once. The shot is everything specific to this moment.

Each of those three is built the same way — a handful of **blocks** (sparse layers, one concern each) gathered under one **assembly** file that composes them. The robot has its own blocks and its own assembly, the warehouse has its own blocks and its own assembly, and the shot has its blocks and its assembly (which we call the **shot root**). The shot root reaches out to the asset and set assemblies — not to their individual blocks — which is exactly what lets the robot be built once and reused everywhere:

```
ASSET                                 SET
char-robot_model.usdc                 set-warehouse_dressing.usda
char-robot_rig.usda                   set-warehouse_lighting.usda
char-robot_lookdev.usda                       ↓ composed by ↓
        ↓ composed by ↓               set-warehouse.usda      ← set assembly
char-robot.usda   ← asset assembly
                          ↘                      ↙
                           referenced / subLayered by the shot
                          ↙                      ↘
SHOT
kilo-0010_layout.usda      ← block: camera, and where the robot stands
kilo-0010_anim.usdc        ← block: how the robot moves
kilo-0010_fx.usda          ← block: smoke and sparks
kilo-0010_lighting.usda    ← block: key light, mood, render settings
        ↓ composed by ↓
kilo-0010.usda             ← shot root (the shot's assembly): subLayers the set and the blocks
```

The four shot artists each own one block and never work in the same file. Each block holds only its author’s opinions — the lighting block does not contain the robot or the warehouse, only the lights, the render settings, and any overrides the lighter needs. When USD opens the shot root, it reads every shot block, follows the arcs out to the asset and set assemblies — which pull in their own blocks in turn — and resolves the whole thing into a single stage.

Here is the part that makes it click. Layout places the robot at the origin. The lighter wants it nudged half a metre for a cleaner silhouette — but never opens layout’s file. They author the nudge in their own block:

```
# kilo-0010_lighting.usda
over "World" {
    over "Characters" {
        over "Hero" {                                  # the robot, as placed by layout
            double3 xformOp:translate = (0.5, 0, 0)    # nudged for framing
        }
    }
}
```

> 👉 **You will almost never write this by hand.** This guide shows USD as text throughout, because it is the clearest way to explain what composition actually does — and because reading a published file is how you check it (Section 20.1). But authoring happens in Solaris. That `over` above is simply what Houdini writes out when the lighter nudges the robot in the viewport with an Edit LOP. Day to day you build LOP networks and press Save to Disk; the `.usda` listings in this guide are there so you can recognise the result, not so you can type it. Being able to read USD is a debugging skill, not a daily one.
> 

Two rules make this work, and they are worth separating because they are different mechanisms:

- **A local opinion beats one that arrived through a reference.** The robot's own position is authored inside the asset and arrives in the shot through a reference; the lighter's `over` is authored locally, on top, so it wins. This is why an override works at all — the edit you layer on top always beats the thing you are editing underneath.
- **Among the blocks, the shot root's order decides who wins.** It lists the lighting block above the layout block, so if layout had also touched that transform, lighting would still take it. Earlier-listed is stronger.

So layout's file stays exactly as it was, and if layout later re-blocks the shot and republishes, the nudge still applies on top. Nobody merged anything, nobody overwrote anyone, and four people worked the same shot in parallel.

That is what USD buys you. The rest of this guide is how to make it work in practice.

## 3. The Mental Shift

There is one conceptual change that makes USD make sense. Until it clicks, everything feels backwards.

> **Traditional thinking:**
*“I am editing the scene.”*
> 

> **USD thinking:**
*“I am contributing my layer to a composed scene.”*
> 

That is the shift the previous section's example demonstrates. In a traditional pipeline you open the scene and work in it. Here the scene does not exist as a single thing you open — it is assembled at runtime from layers, and your job is to author your layer and only your layer.

The practical consequence: **you do not touch a layer you do not currently own.** If you need something changed in a layer someone else owns, you talk to them. And because USD lets you override anything from your own layer, you almost never need to — which is the point. The mechanism that makes the parallel work possible is the same one that makes editing someone else's file unnecessary.

> 👉 **“Own” means assigned to, not belongs to.** Ownership is a production assignment and it moves. If someone is off sick, rolls off the project, or simply hands a task over, their layer and their working files are reassigned and the new owner picks up where they left off — same HIP, same published path, same everything. Nothing here is anyone’s personal property, and no work is stranded because one person is unavailable. The rule is that a layer has **one owner at a time**, so that two people never author it in parallel. It is not that a layer is welded to a person for the life of the project.
> 

Sections 4 and 9.5 cover what this means in practice; Section 25 shows it running end to end.

> 👉 The hardest part of USD is not the technology. It is consistently thinking of yourself as a contributor to a shared composition, not an editor of a shared scene.
>

---

## 4. The Two Files: HIP and USD

Every artist in this pipeline works with two types of files. Understanding the difference is fundamental.

### HIP files — your working environment

A HIP file is your Houdini workspace. It contains your node graph, your experiments, your rig networks, your render setups. It is where you do the work.

HIP files are **yours**. They are versioned and iterative. You save new versions freely. You never pass a HIP file to another artist as a deliverable.

HIP files are **not** the production data. They are the tool you use to produce the production data.

### USD files — the production data

A USD file is what you publish when your work is ready for the next person. It is the output of your HIP. It is what other departments reference. It is the source of truth.

USD files have **stable filenames**. They do not version in their filename. SVN tracks their history. Other departments reference them by path — if the filename changes, their references break.

### The relationship

```
HIP (your workspace)  →  publish  →  USD (the production data)
```

This direction never reverses. You do not edit a USD file directly. You update your HIP and republish.

|  | HIP | USD |
| --- | --- | --- |
| Who owns it | You, individually | Your role, shared with the team |
| How it versions | Filename increments freely: `v001`, `v002`… | Filename stays stable, SVN tracks history |
| What it contains | Everything you needed to produce the output | Only your contribution to the scene |
| What others do with it | Nothing — they do not reference your HIP | They reference it from their own HIP |

---

## 5. USD in Depth

Sections 1–4 covered what USD is, the mindset it asks for, and the two kinds of files you work with. This section goes one level deeper, into the composition machinery the rest of the guide relies on. Read it once now; come back to it whenever something composes in a way you did not expect.

### 5.1 Layers and opinions

A USD layer contains **opinions** — statements about what values prims should have. Every file in the pipeline is a layer containing some opinions.

When multiple layers are composed together, opinions can conflict. USD resolves conflicts using **opinion strength**: stronger opinions win over weaker ones. Two different orderings decide strength, and it is worth keeping them apart because you use one of them constantly and the other almost never.

**Sublayer order — the one you use every day.** When several layers are stacked as sublayers, the one listed earlier is stronger. This is the whole basis of the block stack: in the shot root, lighting is listed above layout, so lighting wins. Nothing more to it.

```
subLayers = [
    @kilo-0010_lighting.usda@,   ← strongest
    @kilo-0010_fx.usdc@,
    @kilo-0010_anim.usdc@,
    @kilo-0010_layout.usda@,
    @set-warehouse.usda@         ← weakest
]
```

**Arc order (LIVRPS) — the one you rarely think about.** A single prim can also receive opinions through different *kinds* of composition arc at once — a local override, a reference, a variant, a payload. When that happens, USD ranks them in a fixed order called **LIVRPS**: **L**ocal > **I**nherits > **V**ariantSets > **R**eferences > **P**ayloads > **S**pecializes.

In practice, only the first letter earns its keep in this pipeline: **a local opinion beats one that came in through a reference** (L beats R). That single rule is what makes every override in this guide work — layout references the robot, authors an `over` on top, and the local `over` wins over the asset's referenced transform. You will lean on this constantly without ever needing the acronym.

The other four letters only come into play when several *different* arc types collide on one prim at once — a referenced asset that also carries a variant selection and inherits from a class, all touching the same attribute. Our sparse block-and-assembly design mostly avoids that situation by construction, so you are unlikely to meet it. If the pipeline later adopts class-based inheritance or nested variant sets in a serious way, the I and V start to matter and this is the ordering that governs them — but that is a scaling concern, not a day-one one. Know LIVRPS exists and where to look it up (Section 26); do not memorise it.

### 5.2 Prims

Everything in a USD scene is a **prim** (primitive): meshes, lights, cameras, materials, transforms (Xforms), and organisational groups (Scopes).

Prims live at **prim paths**:

```
/World/Characters/Hero
/World/Lighting/KeyLight
/World/Props/CrateA
```

Prim paths are as important as file paths. A reference that finds the right file but the wrong prim path is a **silent failure** — it produces nothing and shows no error. This is one of the most common causes of mysterious empty stages.

### 5.3 Composition arcs

Layers connect through **composition arcs**. The ones you will use most:

| Arc | What it does | When to use it |
| --- | --- | --- |
| **SubLayer** | Stacks one complete layer onto another, at the root level | Shot root composition, asset assembly |
| **Reference** | Embeds another file at a specific prim path in your scene | Placing assets into a shot |
| **Payload** | Like Reference, but loads on demand | Large or heavy assets |
| **VariantSet** | Named switchable alternatives on a prim | LODs, damage states, seasonal looks |

The distinction between SubLayer and Reference matters:

- **SubLayer** is for merging layers at the same level — the two layers contribute to the same part of the scene graph. Used in asset assembly (combining model + rig + lookdev) and shot roots (combining blocks).
- **Reference** is for placing one scene inside another at a specific location. Used when layout places `char-robot.usda` at `/World/Characters/Hero`.

Using the wrong one produces a scene that looks approximately right but has the wrong composition structure, which causes override problems downstream.

### 5.4 File formats

The first thing to understand is what the extension does **not** mean. A USD layer's extension chooses its *encoding*, not its capabilities. The data model is identical either way: anything you can express in one format you can express in the other, and composition treats them the same. A `.usda` can hold heavy geometry; a `.usdc` can hold nothing but subLayers. Nothing in this guide's structure — blocks, assemblies, tiers — depends on the format.

| Format | Extension | What it is |
| --- | --- | --- |
| ASCII text | `.usda` | Human-readable text. Open it in any editor, read it, diff it. Slower to write, and much larger on disk once there is real data in it. |
| Binary crate | `.usdc` | Pixar's binary format. Compact, fast to open, and read lazily — USD pulls values off disk only when something asks for them. Not readable in an editor. |
| Either | `.usd` | Format is determined by the file's header, not its name. Both encodings are legal under this extension. |
| Package | `.usdz` | A zipped archive holding a stage and its textures together. An interchange and delivery format — you do not author into it. |

So the choice is a tradeoff between readability and speed, and it is made per file.

**How we choose: the extension follows the content, not the tier.**

- **`.usda` for composition and sparse opinions.** Every assembly and shot root, plus layout, lighting, and material layers. These files are small, they are the ones you want to read when something is wrong, and they are the ones where an SVN diff tells you something useful (Section 21.4). The cost of text is negligible when the file is fifty lines of subLayers.
- **`.usdc` for bulk data.** Published geometry, baked animation, FX caches. A deforming character bake written as text is tens or hundreds of megabytes, slow to write and slow to load; as crate it is a fraction of that and opens lazily. The cost of binary — you cannot read it — barely matters, because a table of a million point positions was never going to be readable anyway.

The rule of thumb: **if you would ever want to read it, `.usda`; if it is mostly numbers, `.usdc`.**

We spell the extension out rather than using bare `.usd`, so that a filename says what you can do with the file without opening it (Section 16).

**Setting it in Solaris.** There is no format parameter. The extension you type into the USD ROP's **Output File** decides it — end the path in `.usda` and Houdini writes text, end it in `.usdc` and it writes crate.

**Changing a published file's format is a breaking change.** The extension is part of the filename, and downstream layers reference that filename by path. Switching a block from `.usda` to `.usdc` breaks every layer pointing at it, silently, exactly as a rename would — coordinate it like any other path change (Section 9.6).

**Reading a `.usdc`.** You cannot open one in an editor, so use `usdview`, the Houdini scene graph tree, or convert it — `usdcat char-robot_model.usdc` prints the same layer as text, which is often the quickest way to check what actually got published. Never guess at binary contents.

---

**Part II — How the Pipeline Works**

---

## 6. Roles

This guide uses role names to describe responsibilities, not job titles. On a small team, one person will cover multiple roles. That is expected and normal. The rules do not change based on team size — one person simply owns more layers.

| Role | Responsible for |
| --- | --- |
| **Modeling** | Geometry, prim hierarchy, VariantSet definitions |
| **Lookdev** | Materials, shading, material assignments on assets |
| **Rigging** | Rig setup in HIP, published as an HDA for animation (Section 12) |
| **Assembly** | Final asset package, combining model, rig, and lookdev |
| **Set Dressing** | Prop placement and furniture arrangement within a set |
| **Set Lighting** | Practical lights and persistent environment lighting within a set |
| **Set Lookdev** | Location-specific surface overrides within a set |
| **Layout** | Camera placement, character blocking, shot-specific overrides to the set |
| **Animation** | Character and object motion, baked animation output |
| **FX** | Simulations, FX caches, FX USD layers |
| **Lighting** | Shot hero lights, mood, atmosphere, render settings |

**On a flat team, who creates the shot root?**

The shot root file assembles all of the shot's blocks into the final shot (explained in Section 9). On a larger production this is often a dedicated TD’s job. On a small flat team, it falls to whoever is acting as project lead for that shot — typically the lighting artist, since they are last in the chain. It is a simple file to create (see Section 9.4) and does not require a specialist.

---

## 7. The Daily Loop

Section 1.2 introduced the loop. This is it in full — what every artist does every working day, in order:

```
1. SVN Update
2. Open your HIP
3. Do your work
4. Publish USD
5. Verify the published USD loads correctly
6. SVN Commit
```

Step 5 is the one people skip, and it is the one that catches silent failures before they reach anyone else.

**A few things that never change:**

- Always SVN update before you start. You need the latest version of everything upstream.
- Always publish USD before you hand off. A HIP file is not a handoff.
- Always verify your publish in a clean Houdini session — not the one you authored it in.
- Always commit with a message that describes what changed and why.

**Why the update step matters more than it looks.** In a live-linked pipeline, an upstream republish reaches you the instant it happens — often mid-task, often unannounced. Here it does not. Nothing upstream changes under you until *you* run `svn update`. That is a deliberate design property, not an accident of using SVN: the update step is the buffer that lets you finish what you are doing on a known-stable set of inputs, and take upstream changes at a moment you choose. The cost is that you must actually update — daily, at the start of work — or you drift. Update at the start of a task, not in the middle of one.

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

## 8. Naming at a Glance

The full naming reference — every pattern, the regex, texture channels — is **Section 16**. This is the minimum you need to follow the rest of Part II.

One rule governs every filename: **underscores separate tokens; hyphens join words inside a token.** An underscore never appears inside a token.

- A **name** is one token, hyphenated: `char-robot`, `set-living-room`, `kilo-0010`.
- A **published block** is `<name>_<block>`: `char-robot_model.usdc`, `kilo-0010_lighting.usda`.
- An **assembly** is just the clean name: `char-robot.usda`, `set-living-room.usda`, and `kilo-0010.usda` (the shot root).
- A **HIP** adds artist and version: `kilo-0010_anim_erik_v003.hip`.

Published USD filenames are stable — they never carry a version or an artist. HIP files always do.

The extension follows the content, not the tier: `.usda` for composition and overrides, `.usdc` for geometry and animation caches (Section 5.4).

---

## 9. The Pipeline

Everything this pipeline produces falls into one of three tiers:

| Tier | What it is | Scope |
| --- | --- | --- |
| **Asset** | A reusable component — a character, a prop, a vehicle | Built once, used anywhere |
| **Set** | A dressed, populated space that assembles assets | Shared by every shot in that location |
| **Shot** | One moment — camera, animation, effects, lighting | This shot only |

**All three are built identically.** There is no structural difference between an asset, a set, and a shot — only a difference in what they contain and who works on them. 9.1 defines the structure once. 9.2, 9.3, and 9.4 then cover only what is genuinely specific to each tier, which is why they are short.

This three-tier structure also shapes the folder layout (Section 17), the naming conventions (Section 16), and the ownership rules (9.5).

### 9.1 Blocks and assemblies

Every tier is built from **blocks** plus one **assembly** file.

A **block** is a sparse layer owning a single concern — a model, a lighting pass, a set's dressing. One block, one author, one job. Blocks are the unit of parallel work: because each artist authors only their own block, several people can work on the same asset, set, or shot at once.

An **assembly** is a single file that subLayers every block belonging to one asset, set, or shot. It holds **no scene opinions of its own** — only subLayers, the stage metrics, a `defaultPrim` where relevant, and any production-default variant selections. It is the file downstream work points at.

```
<name>_<block-a>            ← block: one concern, one author
<name>_<block-b>            ← block: one concern, one author
<name>_<block-c>            ← block: one concern, one author
        ↓
<name>.usda                 ← assembly: subLayers the blocks
```

Both words are ours. USD gives us layers and the arcs that compose them, but it has no opinion about how a production divides work between files, so "block" and "assembly" are the names we use for a structure the standard does not name. Expect blank looks if you use them outside the team (Section 2).

**These rules apply to all three tiers without exception:**

- **Block names are free-form** — lowercase, hyphens for word separation, never underscores. There is no closed list; create whatever blocks the asset, set, or shot needs. Use the conventional names in Section 16.4 for the common disciplines rather than inventing synonyms.
- **A block owns one concern.** Two blocks should not author opinions on the same prims unless that overlap is intentional and coordinated.
- **The assembly is always `.usda`** — pure composition, kept readable and diffable. Blocks choose their extension by content (Section 5.4).
- **Assembly sublayer order is opinion strength** — earlier listed is stronger (Section 5.1). Whoever owns the assembly owns that ordering.
- **Downstream work points at the assembly, never at individual blocks.** That indirection is what lets blocks be added, split, or renamed without breaking anything downstream.
- **Paths inside the assembly are relative to the assembly file** (Section 18.1).

An asset assembly, for example:

```
#usda 1.0
(
    defaultPrim = "CharRobot"
    subLayers = [
        @../../blocks/lookdev/usd/char-robot_lookdev.usda@,
        @../../blocks/rig/usd/char-robot_rig.usda@,
        @../../blocks/model/usd/char-robot_model.usdc@
    ]
)
```

A set assembly and a shot root look the same, with different filenames in the list.

**Assembly files are not hand-edited for daily work.** An assembly is created when its asset, set, or shot is set up, and touched again only when a block is added or removed. Daily work belongs in the blocks.

#### When one block is enough

The split into separate blocks earns its keep when different people own different concerns, or when the asset or set is complex enough that separating concerns has clear organisational value.

When one artist builds an asset end to end — a smaller prop, a tightly integrated hero asset where shading decisions are made alongside geometry decisions — there is no requirement to split it. The asset can be a single block, or a single self-contained layer published directly as the assembly. In that case the assembly file *is* the asset file.

```
char-robot.usda     ← geometry, materials, rig, everything — authored in one HIP
```

The rule is not *always split*. The rule is that whatever gets published as the assembly must be a stable, correctly structured USD file with a default prim set, at a stable path, that downstream stages can reference reliably. How many blocks or intermediate HIPs produced it is an internal decision for whoever owns that asset.

Blocks exist to serve parallel work and clear ownership boundaries. If neither is a concern, splitting adds overhead without adding value.

### 9.2 Assets — what is specific

An asset is a reusable component of the production — a character, a prop, a vehicle, a single piece of furniture. It is built once and reused wherever it is needed, and it is not specific to any location or moment in the film.

**Common blocks:** `model`, `rig`, `lookdev`.

They have a natural workflow dependency:

```
model → (rig ∥ lookdev) → assembly → published asset
```

Modeling publishes first. Rig and lookdev can then run in parallel. Assembly waits for both.

```
char-robot_model.usdc       ← block: geometry and prim hierarchy
char-robot_rig.usda         ← block: bind-pose skeleton — only for UsdSkel assets (Section 12)
char-robot_lookdev.usda     ← block: materials and bindings
        ↓
char-robot.usda             ← assembly: what sets and shots reference
```

**Only assets require a default prim.** The asset assembly is pulled in at a prim path by sets and shots, so it has to declare which prim to pull. A missing default prim is a silent failure — nothing appears, nothing errors (Section 13.4).

**How it is consumed:** sets and shots **reference** the asset assembly at a prim path — `/World/Characters/Hero`, `/World/Props/CrateA` — because they are placing one scene inside another (Section 5.3).

### 9.3 Sets — what is specific

A set is a dressed, populated space — a living room, a warehouse floor, a forest clearing. It assembles assets into a persistent shared environment that multiple shots inhabit.

Where the sofa sits in the living room is a set-level truth: re-dress it against the far wall and it is against the far wall in every shot filmed in that room. Whether the sofa gets shoved aside during one particular shot is a shot-level truth — and this is where USD's override model earns its place. Nobody opens the set to make that happen. The shot's layout block simply authors a stronger opinion about the sofa's position (9.4), and because the set sits at the bottom of the shot root's subLayer stack, layout's opinion wins in that shot and nowhere else. The set file is untouched, every other shot still finds the sofa where set dressing left it, and if set dressing later re-dresses the room, this shot keeps its shoved sofa.

**Common blocks:** `dressing`, `lighting`, `lookdev`, and sometimes `fx`. More specific block names are more common here than anywhere else — `fg-dressing`, `room-a-lighting`.

```
set-landscape_fg-dressing.usda      ← block: foreground dressing
set-landscape_room-a-lighting.usda  ← block: room A lighting
        ↓
set-landscape.usda                  ← assembly: what shots subLayer
```

**The set owns everything about the space that persists across shots, and nothing that does not.**

**How it is consumed:** the shot root **subLayers** the set assembly rather than referencing it, because the set already defines the full scene graph structure — `/World/Props/Sofa`, `/World/Environment/Walls`. The shot adds new prims on top of that structure rather than placing the set somewhere inside it (Section 5.3).

**Set dressing usually needs no Layer Break.** A set dressing HIP starts from an empty stage, and the references it authors *are* its contribution — there is no upstream context to discard (Section 13.1).

### 9.4 Shots — what is specific

A shot is a specific moment — a particular range of frames with a specific camera, specific character positions, specific lighting. It takes a set and adds everything unique to that moment.

**Common blocks:** `layout`, `anim`, `fx`, `lighting`. The assembly is called the **shot root**.

**Build order — who works when:**

```
Set → Layout → Animation → FX → Lighting → Shot Root
```

**Composition order is the reverse of the build order.** Earlier-listed sublayers are stronger (Section 5.1), so the shot root lists lighting — the last department to touch the shot — at the top, and the set at the bottom:

```
#usda 1.0
(
    subLayers = [
        @../../blocks/lighting/usd/kilo-0010_lighting.usda@,
        @../../blocks/fx/usd/kilo-0010_fx.usdc@,
        @../../blocks/anim/usd/kilo-0010_anim.usdc@,
        @../../blocks/layout/usd/kilo-0010_layout.usda@,
        @../../../../../sets/living-room/assembly/usd/set-living-room.usda@
    ]
)
```

Five lines, and every ingredient of the shot is named — strongest first, with the set as the weakest layer, so everything the shot authors sits above it and can override it.

**The set is subLayered by the shot root, not by the layout block.** Layout *loads* the set for context while working, but what layout *publishes* is only its own sparse contribution — camera, character placement, and overrides. If the set arrived through the layout block instead, the shot root would not name it, and whether the set appeared in the shot at all would depend on how one artist happened to configure one Layer Break (Section 13.1). Naming the set in the shot root makes the shot self-describing.

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

**Layout owns the shot's frame range** — `startTimeCode` and `endTimeCode`, because layout is where a shot's timing is first established (Section 10.6).

**Who creates the shot root:** whoever is acting as project lead for the shot — on a small flat team, typically the lighting artist, since they are last in the chain.

### 9.5 Ownership

Every USD layer has one responsible role at a time, and one person filling that role at a time. "At a time" is the load-bearing phrase: ownership is an assignment, reassigned freely when people change tasks, hand over, or leave a project (Section 3). What must never happen is two people authoring the same layer at once.

| Role | Owns | Does NOT own |
| --- | --- | --- |
| Modeling | Geometry, prim hierarchy, VariantSet definitions | Materials, shot data |
| Lookdev | Materials, shading, material bindings on assets | Shot lighting, set surfaces |
| Rigging | The rig HDA and its control interface, rig HIP | Geometry, materials, animation |
| Assembly | Final asset package | Sets, shots |
| Set Dressing | Prop placement and furniture in the set | Set lighting, set surface overrides |
| Set Lighting | Practical lights and environment lighting in the set | Shot lighting, hero lights |
| Set Lookdev | Location-specific surface overrides in the set | Asset materials, shot lighting |
| Layout | Camera, character blocking, shot-specific set overrides | Permanent set dressing, asset geometry |
| Animation | Motion data, baked skeletal animation | Layout, asset look |
| FX | Simulations, FX USD layers | Animation timing (unless agreed) |
| Lighting | Shot hero lights, mood, render settings | Permanent set lighting |

**The boundary between Lookdev and Lighting:**
Lookdev owns what an asset looks like as an asset. Lighting owns what a shot looks like as a shot. A lighter can override a material parameter in the shot’s lighting layer for a creative reason — but that override lives in the lighting layer, not in the asset file. If the override reveals a problem with the base material, the fix goes back to Lookdev.

### 9.6 Dependency and change communication

USD is a dependency chain. When something upstream changes, everything downstream may be affected.

**When you change something upstream:**
1. Commit with a clear message describing what changed
2. Notify downstream artists directly — do not rely on them noticing an SVN update
3. Flag explicitly if **prim paths have changed** — this is a breaking change

**Renaming a prim path in a published layer is a breaking change.** Every reference downstream that points to the old path will silently fail. Never rename a published prim path without coordinating first.

**When you receive an upstream change:**
1. SVN update
2. In Solaris: Scene Graph Tree → right click → Reload Layer
3. Check your layer visually — do not assume it still works
4. Republish if affected, and notify your own downstream

---

## 10. Scene Graph Conventions

USD does not require any particular scene graph shape. It has no `/World`, no reserved names, no rule that geometry sits under `/Geo`. Everything in this section is a convention we adopted — some of it common across the industry, none of it enforced by the standard.

It matters anyway, and arguably more than the parts USD does enforce: every override, every material binding, and every reference in this pipeline targets a prim **by path**. A path that does not match is a silent failure, not an error (5.2). Consistency here is what makes overrides possible at all, which is why these paths are fixed rather than per-artist preference.

The one exception is 10.6, stage metrics — those are real USD metadata with real defaults, and are called out as such.

### 10.1 Shot scene graph structure

Every shot uses this fixed root structure:

```
/World                   (Xform)
  /Characters            (Scope)
  /Props                 (Scope)
  /Environment           (Scope)
  /FX                    (Scope)
  /Cameras               (Scope)
  /Lighting              (Scope)
```

`/World` is the root transform. All scene content lives under it. Do not add new top-level scopes without a team discussion.

Scopes are organisational — they have no transform. Use Xforms when you need a transform.

### 10.2 Asset instances in shots

Assets placed into a shot live under the appropriate scope with a unique PascalCase instance name:

```
/World/Characters/Hero        ← char-hero.usda
/World/Props/CrateA           ← prop-crate.usda, first instance
/World/Props/CrateB           ← prop-crate.usda, second instance
/World/Environment/Ground     ← env-ground.usda
```

### 10.3 Asset internal structure

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

### 10.4 Cameras and lights

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

### 10.5 Prim naming conventions

Prim names follow **PascalCase** — capitalised words, no underscores, no spaces. This distinguishes them visually from filenames (which are lowercase, hyphen-and-underscore) and makes the scene graph easier to read.

| Context | Convention | Examples |
| --- | --- | --- |
| Asset root prim | PascalCase, no underscores | `CharRobot`, `PropCrate`, `EnvWarehouse` |
| Asset instance in shot | PascalCase, unique within its scope | `Hero`, `CrateA`, `CrateB` |
| Lights | PascalCase, descriptive | `KeyLight`, `FillLight`, `SkyDome` |
| Cameras | PascalCase | `Main`, `Witness` |
| Internal asset structure | PascalCase | `Geo`, `Mtl`, `Rig`, `Body`, `Head` |

Multiple instances of the same asset get a letter suffix: `CrateA`, `CrateB`, `CrateC`. Never `Crate1`, `Crate2` — letters sort more predictably and avoid confusion with shot numbering.

The asset root prim name is derived directly from the asset name token, with hyphens removed and each word capitalised: `char-robot` → `CharRobot`, `prop-crate` → `PropCrate`. This makes the relationship between filename and prim path unambiguous.

### 10.6 Stage metrics and time

Scene graph structure is only half of what has to agree between layers. The other half is the **stage metrics** — the units, the up axis, and the timing. These are layer metadata, not prims, and they are silent when they disagree: an asset authored in centimetres composed into a set authored in metres does not error, it just arrives a hundred times too big or too small.

Set these once, project-wide, and treat them as fixed:

| Metadata | Project value | Notes |
| --- | --- | --- |
| `upAxis` | `Y` | USD's default and Houdini's default. Do not vary it per asset. |
| `metersPerUnit` | `1` | One Houdini unit is one metre. USD's own default is `0.01` (centimetres), so this is a deliberate choice that must be authored, not assumed. |
| `timeCodesPerSecond` | project frame rate | Must match the Houdini scene FPS. Mismatches show up as animation playing at the wrong speed, not as an error. |
| `startTimeCode` / `endTimeCode` | the shot's frame range | Per shot, not project-wide. |

**Who authors what.** Units and up axis belong on every published layer that contains geometry — set them in the **Configure Layer LOP** before your USD ROP, the same node that sets the default prim (Section 13.4). The frame rate is also per-layer metadata and should match everywhere.

**The shot frame range is owned by layout.** Layout is where a shot's identity is first established — the camera, the blocking, and therefore the timing. The layout block authors `startTimeCode` and `endTimeCode`; every downstream block inherits the shot's range from the composed stage rather than each artist deciding independently. This matters practically as well as conceptually: recent Houdini builds initialise the frame range for command-line rendering from the stage's `startTimeCode` and `endTimeCode` (Section 13.6), so if those are wrong or missing, farm renders come out with the wrong frame count.

Add these to the publish check: **every published layer states its units, up axis, and frame rate, and shot layers state the shot's frame range.** They cost one node to author and are close to impossible to debug after the fact.

---

## 11. Materials

Lookdev and final render are always Houdini/Karma, so shading is authored in **MaterialX** and rendered by **Karma**. This section covers where material files live and how they are shaded. Colour management is project-wide infrastructure rather than a materials topic, and has its own section — see Section 19.

### 11.1 Where materials can live

**Option A — Inline in the lookdev file**

Material definitions sit directly inside `char-robot_lookdev.usda`. The same file contains both the material networks and the bindings.

This is the right choice for small productions where:
- Materials are specific to one asset
- You do not expect to share them elsewhere
- The overhead of separate files is not justified

**Option B — Separate material definition files**

Material definitions live in their own files. The lookdev assignment layer references them.

```
lookdev/
    materials/
        char-robot_paint.usda
        char-robot_metal.usda
    usd/
        char-robot_lookdev.usda    ← references the above, adds bindings
```

This is the right choice when:
- Materials are shared or reused across multiple assets
- You want material definitions to be individually addressable for overrides

**Be consistent within a project. Do not mix both approaches for the same asset.**

### 11.2 Library materials

Generic reusable materials — not specific to one asset — live in the library:

```
$LIBRARY/materials/metal-bare.usda
$LIBRARY/materials/plastic.usda
$LIBRARY/materials/glass.usda
```

Asset materials can reference library materials as a starting point. Changes to library materials affect every asset that references them — communicate before changing.

### 11.3 Shading: MaterialX and Karma

Author all shading in **MaterialX**. It is the USD-native shading standard, it is what Karma renders directly, and — unlike a renderer-specific VOP network — it survives the two things this pipeline depends on: USD interchange and the layering/override model. A MaterialX network travels with the asset and reads the same wherever the asset is referenced.

Use `mtlxstandard_surface` as the default surface. Build the network inside a **Material Library LOP** (a MaterialX subnet); Karma CPU and XPU both render it natively.

Materials live under the asset's `/Mtl` scope (Section 10.3) and are attached with a `material:binding`. Keeping every asset's materials under `/Mtl` is what lets lookdev publish a consistent, predictable structure that downstream layers can find.

**`UsdPreviewSurface` is optional here.** Because lookdev and final render are always Karma, you do not need a separate preview surface for rendering. Author one only if you want assets to preview correctly in `usdview`, the Storm/GL viewport, or another DCC — it is a lightweight, portable fallback, not part of the Karma path.

**Binding strength is the technical basis for the lookdev/lighting boundary.** A material binding carries a strength (`bindMaterialAs`): the default `weakerThanDescendants` lets a more specific binding deeper in the hierarchy win, while `strongerThanDescendants` forces a binding to override descendants. This is the exact mechanism behind the boundary in Section 9.5 — a lighter can rebind or tweak a material in the shot's lighting block and have it win over the asset's own binding, without editing the asset. The override lives in the lighting layer; the asset is untouched. When an override reveals a real problem with the base material, the fix goes back to lookdev.

**Texture colour space is set by the channel token.** `bc` is colour-managed; `n`, `aormt`, and `m` are raw data and must not be. Naming a texture correctly (Section 16.9) is what gets its colour space right — see Section 19.

## 12. Rigging

Rigging is the one place where the pipeline's normal shape does not quite fit, because **USD has no concept of a live rig**. Constraints, IK handles, control objects, and muscle systems do not exist in USD and cannot be published as a USD layer. They live in Houdini.

The way through is to stop treating "rigging" as one handoff and split it into two independent contracts:

1. **How the rig reaches the animator** — a Houdini-side problem, solved with an HDA. USD is not involved.
2. **What animation publishes downstream** — a USD problem, solved with baked data. The rig is not involved.

Solve them separately and rigging stops being an exception. Each half becomes an ordinary instance of the rules the rest of this guide already uses.

### 12.1 The rig is published as an HDA

Do **not** hand the rig HIP to the animator to copy from. A copied rig network is a one-time snapshot: every later rig fix has to be manually re-merged into the animator's scene, and nothing tracks whether what the animator has is current. That is the same failure this pipeline exists to prevent, just in HIP-land instead of USD-land.

Package the rig as a **digital asset (HDA)** instead, saved to `$PROJECT/houdini/otls/`. That directory is already on `HOUDINI_OTLSCAN_PATH` (Section 18), so the rig simply appears in every artist's tab menu after an SVN update. The animator drops one node and has controls.

The structure mirrors the HIP/USD split exactly:

| | Rig HIP | Rig HDA |
| --- | --- | --- |
| Example | `char-robot_rig_alex_v003.hip` | `char-robot_rig.hda` |
| Who owns it | The rigger, individually | The Rigging role, shared with the team |
| Versioning | Filename increments freely | Filename stable — SVN tracks history |
| Is it a deliverable? | No — never handed over | Yes — this is the handoff |

When the rig changes, the rigger republishes the HDA and commits. The animator runs `svn update`, and the definition refreshes in place inside their existing scene — animation authored on the rig's parameters survives. No merging, no re-copying.

**The HDA's interface is a contract.** Control names and parameter names are to rigging what prim paths are to everything else: rename or remove a control the animator has already animated on and their work breaks. Treat an interface change as a breaking change — coordinate before making it, exactly as Section 9.6 requires for prim paths.

**The HDA references the published model USD internally**, so the geometry it deforms is always the current published asset. That is plumbing inside the HDA; the animator never sees it.

> 👉 The HDA is the only published deliverable in this pipeline that is not a USD layer. It follows every publishing rule — stable filename, SVN history, notify downstream, interface-is-a-contract — but it is a tool handed to another artist, not a contribution to the composed scene. Nobody downstream of animation ever loads it. They see only the referenced asset and the animation overrides on top of it.

### 12.2 What animation publishes

There is no single right answer here, and picking one globally is a mistake. Choose per asset, from three lanes, in ascending order of machinery. Prefer the simplest lane the asset allows.

**Lane 1 — Transform bake (the default for rigid and mechanical assets).**
If the asset does not deform — a robot, a vehicle, a mechanism, most props — animation publishes time-sampled `xformOp` overrides on the prims that already exist under the instance path:

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

This is the ideal citizen of this pipeline: genuinely sparse, small on disk, and readable. Use it wherever it is possible.

**Lane 2 — Deformed geometry bake (the default for deforming characters).**
Publish time-sampled point positions as overrides on the model's existing meshes: SOP Import the deformed character and write it out. Files are heavier — publish as `.usdc` (Section 5.4) — but the renderer sees exactly what the animator saw, nothing is re-evaluated downstream, and material bindings hold because the prim hierarchy is untouched.

The contract this creates is **topology**: point count and point order must match the published model. A model topology change is therefore a breaking change for animation, on the same footing as a prim path rename — flag it under Section 9.6 and re-bake.

**Lane 3 — UsdSkel (escalation only).**
Publish the bind-pose skeleton (`char-robot_rig.usda`) with the asset and joint animation from the shot, and let the renderer skin at render time. This earns its complexity when you have crowds, memory pressure from many animated characters, or retargeting needs. It is also the most fragile corner of USD in practice — skinning is re-evaluated by Hydra, and it has more silent-failure modes than either lane above. For a small team's hero shots, you will probably never need it.

**Consequence:** the `_rig` USD block is only required in Lane 3. In Lanes 1 and 2 the asset assembly does not need a skeleton at all, and the block should simply be omitted.

### 12.3 The update loop

Rigging and animation now run on the standard daily loop, with no special cases:

```
Model republished
   → Rigger updates the rig against the new model, republishes char-robot_rig.hda, commits, notifies
   → Animator SVN updates; the HDA definition refreshes in their open scene
   → Animator verifies the animation still reads, re-bakes, republishes kilo-0010_anim.usdc, notifies lighting
```

Because both bake lanes publish *time-sampled* data, the stage timing conventions in Section 10.6 are a prerequisite, not a nicety: if `timeCodesPerSecond` disagrees between layers, animation plays at the wrong speed with no error anywhere.

### 12.4 A note on KineFX and APEX

This guide does not mandate a rigging technology. KineFX is the established path and is the safer floor for a team new to Houdini. APEX is SideFX's forward direction for character animation and is worth evaluating before you commit, particularly if character work will grow.

The choice can wait, and it can differ per asset. Because the USD contract in 12.2 is technology-agnostic — downstream sees only transforms, deformed points, or UsdSkel data, never a rig — the KineFX/APEX decision lives entirely inside HIP-land and can be changed later without touching the pipeline. Rig one test character each way if it helps, let whoever does the most animation choose, and do not let the decision block anything else.

---

## 13. Solaris Essentials

### 13.1 The Layer Break LOP

First, what a Layer Break does **not** do: nothing you do in a LOP network ever modifies an upstream file on disk. Composition is read-only in that direction, always.

The real problem it solves is what your *published file* contains. A LOP network's stage includes everything you loaded for context. Without a Layer Break, the USD ROP writes all of it — so your sparse block would come out containing a full restatement of the set, the assets, and every upstream block. You would be re-publishing data you do not own, in a stronger layer than the artist who does own it, and their future changes would stop reaching the shot.

A Layer Break discards everything below it from what gets written and starts a fresh layer above. Everything authored above the break — and only that — ends up in your published file.

```
[Sublayer LOP]       ← upstream context you are loading to work against
[Layer Break]        ← everything below this is context, not your output
[Edit/Override LOPs] ← your opinions
[USD ROP]            ← writes only your layer
```

**Where the break goes: after context, before contribution.** The rule is not "after all references" — it is that the break separates what you *loaded to look at* from what you are *publishing*. Those are different things, and confusing them is the most common way to publish an empty layer.

- A **Sublayer LOP bringing in upstream published work** for context goes *below* the break. You are not republishing the set.
- A **Reference LOP placing an asset that is your own deliverable** goes *above* the break. When layout places the hero character, or the set dresser places a sofa, that reference **is** the contribution — put it below the break and it vanishes from the published file.
- Anything that authors new prims you own — cameras, lights, imported caches — goes *above* the break.

The test to apply: *if this disappeared from my published file, would my work be missing?* If yes, it belongs above the break.

A network whose stage starts empty — a set dressing HIP that references props into a blank stage — needs no Layer Break at all. There is no upstream context to discard. (References to files on disk remain composition arcs in the written file; they are not flattened into it.)

**Node colours confirm this is working.** Houdini assigns each layer a colour — not meaningful in itself, but the colour is consistent across all nodes writing to the same layer. When the colour changes at your Layer Break, that visually confirms your edits are isolated in a separate layer. If everything in your network is one colour and you expected a break, the Layer Break is missing or in the wrong position.

### 13.2 The USD ROP

Key settings:

- **Save Path** — use environment variables here (Section 18). Never a local absolute path
- **Output Primitive** — for asset publishing, set this to write only the subtree from a specific prim, not the entire stage
- **Save Style** — this is the setting that controls flattening, and it is the one to get right. Choose the option that writes **only your layer**, not a flattened composed stage. A flattened publish loses composition structure and destroys downstream override capability
- Verify the paths written *inside* the file are relative (Section 18), not absolute paths baked in at write time

After publishing: open the USD file in `usdview` or as text and verify it contains only what you intended.

### 13.3 The Reference LOP

- **File Path** — use environment variables
- **Primitive Path** — where in your stage the asset is placed: `/World/Characters/Hero`
- **Reference Primitive** — which prim inside the file to pull from: `/CharRobot`. If blank, uses the default prim. Always set the default prim on published assets.

### 13.4 Setting a Default Prim

Every published asset USD must define a default prim. Without it, a reference with no explicit prim path produces nothing and shows no error — a silent failure.

In USDA:

```
#usda 1.0
(
    defaultPrim = "CharRobot"
)
```

In Solaris: set it on the **Configure Layer LOP** before your USD ROP — the same node that carries the stage metrics from Section 10.6. Treat a missing default prim as a publish error.

### 13.5 Network organisation

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

### 13.6 Rendering: Karma and Husk

What you render is the **shot root** — the fully composed `kilo-0010.usda`. Because it pulls in the set, the assets, and every block through composition, the renderer sees the whole assembled scene from that one file.

There are two ways to render the same stage:

- **Interactively, in Houdini.** The lighting block's Karma Render Settings LOP defines the camera, resolution, samples, AOVs, and output paths; a USD Render ROP renders from the GUI. This is where look and settings are dialled in.
- **On the farm, with Husk.** `husk` is the standalone command-line USD renderer that ships with Houdini. It loads a composed USD stage, picks a Hydra render delegate (Karma by default), and renders with no interactive session — exactly what a farm needs. Each node runs the same stage for a different frame range.

A representative invocation:

```
husk --renderer Karma \
     --frame 1001 --frame-count 100 --make-output-path \
     --output "$SHOTS/kilo/0010/render/beauty.$F4.exr" \
     $SHOTS/kilo/0010/assembly/usd/kilo-0010.usda
```

`--frame` is the start frame and `--frame-count` the number of frames. `--renderer` selects the Hydra render delegate.

**Choosing CPU vs XPU is not a command-line flag.** It is part of the render delegate selection and is authored in the stage on the Karma Render Settings LOP, alongside everything else about the render. Set it in the lighting block, not on the farm submission.

**Recent Houdini builds initialise the frame range from the stage.** `--frame` and `--frame-count` default to the stage's `startTimeCode` and `endTimeCode` metadata, which is exactly why Section 10.6 makes layout responsible for authoring them. On the farm you still pass the range explicitly, because each node renders a different slice of it.

Flags change between Houdini builds — check `husk --help` for the version you are on.

**Render settings live in the stage, not on the command line.** Camera, resolution, samples, and AOVs are authored as RenderSettings and Render Var prims (from the Karma Render Settings and Render Var LOPs) in the lighting block, so Husk reads them straight from the USD — you do not re-specify them as flags. Husk looks for RenderSettings under `/Render`.

**Karma CPU vs XPU.** XPU is the hybrid CPU+GPU path — faster, shading with the same MaterialX, and a sensible default for look-dev and most shots. CPU is the full reference feature set and the ground truth. The production habit: when an XPU frame looks off, confirm it on CPU before committing a sequence.

**Output.** Karma writes scene-linear ACEScg EXRs (Section 19), one per frame, into a per-shot `render/` folder that is **not** committed to SVN (Section 21). The view transform is applied in comp, never baked into the EXR.

---

## 14. VariantSets

VariantSets allow a single asset to carry named switchable alternatives that can be toggled without creating separate files.

### 14.1 When to use VariantSets vs separate files

| Situation | Use |
| --- | --- |
| Same asset, different LOD levels | VariantSet |
| Same asset, different damage states | VariantSet |
| Same asset, different seasonal look | VariantSet |
| Two genuinely different assets | Separate files |

### 14.2 Standard VariantSet names

| VariantSet | Variants | Notes |
| --- | --- | --- |
| `lodVariant` | `LOD0`, `LOD1`, `LOD2`… | Add as many levels as needed. LOD0 is highest detail. Matches Unreal Engine convention. |
| `damageVariant` | `pristine`, `damaged`, `destroyed` |  |

Do not invent alternate names without a team discussion. Consistent names allow programmatic access.

### 14.3 Who defines and who overrides

**Modeling** defines the VariantSet structure. **Assembly** sets the production default. **Layout and Lighting** can override the active variant in their own layers without touching the asset:

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

## 15. Instancing

When the same asset appears many times in a scene — rocks, trees, crowd characters, debris — placing each one as a separate Reference would create a scene graph with thousands of individually composed prims. This is slow to load and slow to render.

USD provides two mechanisms for this: **scene-level instancing** for a moderate number of repeated assets, and **PointInstancer** for very large numbers.

### 15.1 Scene-level instancing

When a prim is marked `instanceable = true`, USD recognises that all prims sharing the same composition structure can share a single composed prototype in memory. The scene graph shows each instance individually, but the underlying data is shared.

**The flag is authored where the asset is placed, not inside the asset.** `instanceable` goes on the prim that carries the reference — so it is set by whoever does the placing: the set dresser, or layout. The asset's own assembly file knows nothing about it, which is correct, since the same asset may be instanced in one context and not in another.

```
def Xform "CrateA" (
    instanceable = true
    references = @../../../../assets/prop-crate/assembly/usd/prop-crate.usda@
)
{
    double3 xformOp:translate = (4, 0, 2)
    uniform token[] xformOpOrder = ["xformOp:translate"]
}
```

**What you can and cannot override per instance.** This is the part that trips people up, and the boundary is not where most people guess. It is not about transforms versus materials — it is about the **instance root prim** versus everything **inside** the instance:

- **On the instance root prim — allowed, and does not fork the prototype:** the transform, visibility, and even the material binding. These properties live on the instance prim itself, above the shared prototype, so varying them costs nothing. Scatter a hundred crates at different positions, hide a few, bind three of them to a different material — still one prototype.
- **Inside the instance — not possible at all.** You cannot author an override on a prim beneath an instance. Descendants of an instance are *instance proxies*, and they are not editable. If you need to move the lid of one crate specifically, that crate cannot be an instance.
- **Forks the prototype:** a difference in the instance's **composition** — in practice, a different variant selection. Each distinct variant selection produces its own prototype. A handful of distinct variants is fine; a unique variant per instance defeats the purpose, and you are back to one prototype per instance with extra steps.

So: vary transforms, visibility, and root-level bindings freely. If instances need different *variants* and there are many of them, group them so each distinct look is one shared prototype, or use a PointInstancer (15.2) with the variation baked into the prototypes. If any instance needs edits *inside* it, do not instance that one.

Use scene-level instancing when:
- You have up to a few hundred repeated instances
- No instance needs internal edits, and there are at most a handful of distinct variant selections
- The asset is complex enough that memory sharing matters

### 15.2 PointInstancer

`UsdGeomPointInstancer` is the right tool for very large numbers of instances — foliage, rocks, crowd simulations, particle-driven props. It stores instances as a list of point positions, orientations, and scales referencing a set of prototype prims, rather than as individual scene graph entries.

A PointInstancer can represent millions of instances with minimal scene graph cost. The tradeoff is that individual instances cannot easily carry overrides — they are all driven by the point data.

In Houdini, PointInstancers are most naturally generated from SOP networks using the **Copy to Points** pattern, then brought into Solaris via a SOP Import LOP. The resulting USD is compact and renderer-friendly.

Use this when:
- You have hundreds to millions of instances
- Instances do not need individual overrides
- The content is driven procedurally (scatter, simulation, crowd)

### 15.3 Which to use

| Situation | Use |
| --- | --- |
| 5–200 repeated props varying by transform, visibility, or root-level binding | Scene-level instancing |
| Forests, rocks, ground cover, crowds | PointInstancer |
| A handful of manually placed assets | Plain references, no instancing needed |

---

**Part III — Reference**

---

## 16. Naming Conventions

This section is the single reference for how all files, folders, and prims are named. It applies to every project. When in doubt about a name, come here first.

**All of it is ours.** USD places almost no constraints on filenames, and none at all on the tokens and prefixes below. Everything in this section is a house convention, chosen so that a filename can be read — and parsed by tooling (16.10) — without opening it.

### 16.1 General rules

A filename is a sequence of **tokens**. The two separators have strict, non-overlapping jobs:

- **Underscore (`_`) separates tokens** — and nothing else. Each `_` marks a boundary between, say, the asset name and the block, or the block and the artist.
- **Hyphen (`-`) joins words inside a single token.** A multi-word name, block, or descriptor is written with hyphens: `char-robot`, `set-living-room`, `fg-dressing`, `rough-pass`.
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

### 16.2 Asset prefixes

An asset name is a single token. Its first word is a category prefix:

| Category | Prefix | Examples |
| --- | --- | --- |
| Character | `char-` | `char-robot`, `char-hero`, `char-villain` |
| Prop | `prop-` | `prop-crate`, `prop-table`, `prop-lamp` |
| Environment | `env-` | `env-warehouse`, `env-ground`, `env-cliff` |
| Vehicle | `veh-` | `veh-truck`, `veh-hovercraft` |
| FX element | `fx-` | `fx-smoke`, `fx-sparks` |

The prefix is hyphen-joined to the rest of the name because it is part of one token, not a separate token. `env-` is for standalone environment geometry that is referenced into a set — terrain, ground planes, architectural shells, large background structures. The distinction from `set-`: an `env-` asset is a single reusable building block (the warehouse shell), while a `set-` is the dressed, assembled space that references environments, props, and other assets together (the warehouse floor with crates, lighting, and surface wear).

Sets use their own prefix:

| Category | Prefix | Examples |
| --- | --- | --- |
| Set | `set-` | `set-living-room`, `set-warehouse`, `set-forest-clearing` |

---

### 16.3 Sequence and shot codes

**Sequences** use 3–5 lowercase letters: `kilo`, `lima`, `zulu`

Those three are placeholders, and so is every sequence code in this guide's examples — a real project picks its own, usually something that names the location or the beat (`roof`, `chase`, `alley`). Whatever they are, they are decided once at the start of a project and recorded with it, not invented per shot by whoever sets one up first.

**Shots** use 4-digit numbers, incrementing by 10: `0010`, `0020`, `0030`

Incrementing by 10 leaves room to insert shots later without renumbering.

**Shot context** is a single token: the sequence and shot joined by a hyphen — `kilo-0010`, `lima-0020`. (In the folder tree the sequence and shot are separate directories, `kilo/0010/`; in filenames they form one token.)

> Note: Production tracking tools may display sequences as uppercase (KILO, LIMA). Filenames and folders always use lowercase.
> 

---

### 16.4 Block names

Assets, sets, and shots are all built the same way: from any number of named **blocks** plus one **assembly** file that composes them (see Section 9). A block is one sparse layer owning a single concern. Its name is the last token in the published filename.

Block names are **free-form**, lowercase, and use **hyphens** for word separation within the block name (never underscores — underscores separate the asset/set/shot name from the block name). There is no closed list of valid block names; you can create whatever blocks a given asset, set, or shot needs.

For consistency, use these conventional names for the common disciplines rather than inventing synonyms:

| Discipline | Conventional block name |
| --- | --- |
| Modeling | `model` |
| Lookdev | `lookdev` |
| Rigging | `rig` |
| Set / shot dressing | `dressing` |
| Layout | `layout` |
| Animation | `anim` |
| FX | `fx` |
| Lighting | `lighting` |

These are recommendations, not an enforced enum. When a block is more specific — a second lighting pass, a foreground dressing block, a per-room lighting block — name it descriptively with hyphens: `fg-dressing`, `room-a-lighting`, `key-light-pass`. The point is that the name communicates the block's single concern at a glance.

`assembly` is reserved: it names the working HIP that composes a tier's blocks into its assembly file. It is not itself a block name (the assembly file holds no scene opinions of its own — see Section 9).

---

### 16.5 Published USD filenames

Assets, sets, and shots are all named the same way: **blocks carry a block token, assemblies do not.** Section 9 covers what blocks and assemblies *are*; this is only the naming.

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
- Blocks choose their extension by content: `.usda` for composition, overrides, and materials; `.usdc` for geometry, animation, and caches (Section 5.4)

The assembly is the file downstream work references or subLayers — shots reference asset assemblies, and the shot root subLayers the set assembly (Section 9.4).

---

### 16.6 HIP filenames

Shot HIP pattern:

```
<sequence>-<shot>_<block>[_<descriptor>]_<artist>_v###.hip
```

Asset HIP pattern:

```
<asset>_<block>[_<descriptor>]_<artist>_v###.hip
```

Here `<block>` is the block being authored, or `assembly` for the HIP that composes a tier's blocks. The `<descriptor>` is optional. When omitted, remove the token and its underscore entirely.

Examples:

```
kilo-0010_anim_erik_v001.hip
kilo-0010_anim_blocking_erik_v002.hip      ← with descriptor
kilo-0010_layout_ina_v001.hip
kilo-0010_lighting_maria_v003.hip
kilo-0010_assembly_maria_v001.hip          ← the shot root's working HIP
char-robot_model_alex_v001.hip
char-robot_rig_alex_v002.hip
char-robot_lookdev_maria_v001.hip
char-robot_assembly_alex_v001.hip          ← the asset assembly's working HIP
```

**Rules:**
- Always include the artist name — HIP files are personal working files
- Always include the version number
- Increment the version on meaningful saves, handoffs, or significant changes

---

### 16.7 Versioning

- Always `v###` — three digits, zero-padded
- Start at `v001`
- Increment meaningfully — not on every minor save, but on any save you might want to return to
- Never: `v1`, `v01`, `final`, `latest`, `v_real_final_2`

---

### 16.8 Good and bad examples

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

### 16.9 Texture filenames

Pattern:

```
<asset-or-set>[_<descriptor>]_<channel>_<resolution>.<ext>
<asset-or-set>[_<descriptor>]_<channel>_<resolution>.<udim>.<ext>
```

The descriptor is optional. When omitted, remove the token and its underscore entirely — matching the same rule as HIP file descriptors. The channel token is a closed enum and acts as the parse anchor, making the descriptor unambiguous to both humans and tooling.

**Channel tokens — closed list, no other values permitted**

| Token | Meaning |
| --- | --- |
| `bc` | Base colour (RGB) |
| `n` | Normal (RGB) |
| `aormt` | AO / Roughness / Metalness (R / G / B in that order) |
| `m` | Mask (Grayscale) |

**Resolution tokens:** `1k`, `2k`, `4k`, `8k`

**File formats:** `.exr`, `.png`, `.tif`

**UDIM tiles** insert between resolution and extension.

Examples:

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
- The channel also fixes the colour space: `bc` is colour-managed, while `n`, `aormt`, and `m` are raw/linear data and must not be colour-managed. This is what OCIO's file rules rely on — see Section 19.
- All filenames follow the same general rules as the rest of the guide: lowercase, no spaces, no dates, no version numbers.

---

### 16.10 Regex validation patterns

For tooling and pre-commit checks.

Because `_` is the only token separator and tokens never contain `_`, every filename parses unambiguously: split on `_` and you have the tokens. A published block file is exactly `<name>_<block>` (one underscore); an assembly is `<name>` (no underscore). So the patterns below can validate structure, not just casing — though the authoritative record of which blocks actually exist for a tier is still the assembly's subLayer list (Section 9).

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

**HIP files** (`<name>_<block>[_<descriptor>]_<artist>_v###`)

```
^[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*(?:_[a-z0-9]+(?:-[a-z0-9]+)*)?_[a-z0-9]+(?:-[a-z0-9]+)*_v[0-9]{3}\.hip$
```

**Texture filename (non-UDIM)** (`<asset-or-set>[_<descriptor>]_<channel>_<resolution>`)

```
^[a-z0-9]+(?:-[a-z0-9]+)*(?:_[a-z0-9]+(?:-[a-z0-9]+)*)?_(bc|n|aormt|m)_(1k|2k|4k|8k)\.(exr|png|tif)$
```

**Texture filename (UDIM)**

```
^[a-z0-9]+(?:-[a-z0-9]+)*(?:_[a-z0-9]+(?:-[a-z0-9]+)*)?_(bc|n|aormt|m)_(1k|2k|4k|8k)\.[0-9]{4}\.(exr|png|tif)$
```

---

## 17. Folder Structure

Every asset, set, and shot has the same internal shape — a `blocks/` folder holding one folder per block, and an `assembly/` folder holding the working HIP and the published assembly (for a shot, that assembly is its shot root):

```
<name>/
├── blocks/
│   └── <block>/
│       ├── hip/          ← working files, versioned per artist
│       └── usd/          ← the published block
└── assembly/
    ├── hip/              ← the HIP that composes the blocks
    └── usd/              ← the published assembly
```

Some blocks carry extra folders alongside `hip/` and `usd/` — `tex/` for textures, `materials/` for separate material files, `cache/` for simulation data. The full tree is that shape repeated:

```
project_root/
├── assets/                                       ← individual reusable assets
│   └── char-robot/
│       ├── blocks/
│       │   ├── model/
│       │   │   ├── hip/
│       │   │   │   └── char-robot_model_alex_v001.hip
│       │   │   └── usd/
│       │   │       └── char-robot_model.usdc
│       │   ├── rig/
│       │   │   ├── hip/
│       │   │   │   └── char-robot_rig_alex_v001.hip
│       │   │   └── usd/
│       │   │       └── char-robot_rig.usda       ← bind-pose skeleton, UsdSkel only (12.2)
│       │   └── lookdev/
│       │       ├── hip/
│       │       │   └── char-robot_lookdev_maria_v001.hip
│       │       ├── tex/
│       │       │   ├── char-robot_bc_4k.exr
│       │       │   ├── char-robot_n_2k.exr
│       │       │   └── char-robot_aormt_4k.exr
│       │       ├── materials/                    ← only if using separate material files
│       │       │   ├── char-robot_paint.usda
│       │       │   └── char-robot_metal.usda
│       │       └── usd/
│       │           └── char-robot_lookdev.usda
│       └── assembly/
│           ├── hip/
│           │   └── char-robot_assembly_alex_v001.hip
│           └── usd/
│               └── char-robot.usda               ← sets and shots reference this
│
├── sets/                                         ← dressed spaces shared across shots
│   └── living-room/
│       ├── blocks/
│       │   ├── dressing/
│       │   │   ├── hip/
│       │   │   │   └── set-living-room_dressing_ina_v001.hip
│       │   │   └── usd/
│       │   │       └── set-living-room_dressing.usda    ← prop placement, furniture
│       │   ├── lighting/
│       │   │   ├── hip/
│       │   │   │   └── set-living-room_lighting_maria_v001.hip
│       │   │   └── usd/
│       │   │       └── set-living-room_lighting.usda    ← practicals, env lights
│       │   ├── lookdev/
│       │   │   ├── hip/
│       │   │   │   └── set-living-room_lookdev_maria_v001.hip
│       │   │   ├── tex/
│       │   │   │   ├── set-living-room_walls_bc_4k.exr
│       │   │   │   └── set-living-room_walls_aormt_4k.exr
│       │   │   └── usd/
│       │   │       └── set-living-room_lookdev.usda     ← surface overrides
│       │   └── fx/                               ← optional: persistent effects
│       │       ├── hip/
│       │       │   └── set-living-room_fx_nora_v001.hip
│       │       └── usd/
│       │           └── set-living-room_fx.usda
│       └── assembly/
│           ├── hip/
│           │   └── set-living-room_assembly_ina_v001.hip
│           └── usd/
│               └── set-living-room.usda          ← shot roots subLayer this
│
├── shots/                                        ← shot-specific work only
│   └── kilo/
│       └── 0010/
│           ├── blocks/
│           │   ├── layout/
│           │   │   ├── hip/
│           │   │   │   └── kilo-0010_layout_ina_v001.hip
│           │   │   └── usd/
│           │   │       └── kilo-0010_layout.usda
│           │   ├── anim/
│           │   │   ├── hip/
│           │   │   │   └── kilo-0010_anim_erik_v001.hip
│           │   │   └── usd/
│           │   │       └── kilo-0010_anim.usdc   ← baked animation (12.2)
│           │   ├── fx/
│           │   │   ├── hip/
│           │   │   │   └── kilo-0010_fx_nora_v001.hip
│           │   │   ├── cache/
│           │   │   │   └── sim.####.vdb
│           │   │   └── usd/
│           │   │       └── kilo-0010_fx.usdc
│           │   └── lighting/
│           │       ├── hip/
│           │       │   └── kilo-0010_lighting_maria_v001.hip
│           │       └── usd/
│           │           └── kilo-0010_lighting.usda
│           └── assembly/
│               ├── hip/
│               │   └── kilo-0010_assembly_maria_v001.hip
│               └── usd/
│                   └── kilo-0010.usda            ← shot root (the shot's assembly)
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
│   │   └── char-robot_rig.hda                    ← published rig HDAs (12.1)
│   ├── ocio/
│   │   └── config.ocio                           ← pinned colour config (Section 19)
│   └── packages/
│       └── project.json                          ← project environment (18.3)
│
└── docs/
    └── pipeline-guide.md
```

*For texture naming conventions and validation patterns, see Section 16.9.*

---

## 18. Paths and Environment Variables

Never hardcode absolute local paths. A path like `C:/Users/artist/Desktop/...` breaks the moment anyone else opens the file.

There are two different path problems here, and they have two different answers. Getting them mixed up is the most common way to build a pipeline that works on one machine and nowhere else.

### 18.1 The two kinds of path

**Paths in HIP files → environment variables.**
Your USD ROP's output path, your Reference LOP's file path, your texture paths — these are Houdini parameters, and Houdini expands `$ASSETS`, `$SHOTS`, and the rest when it evaluates them. Environment variables are exactly right here.

**Paths inside published USD files → relative to the layer.**
The asset paths written *inside* a `.usda` — sublayers, references, payloads — are resolved by USD, not by Houdini. USD's default asset resolver **does not expand shell environment variables**. A published file containing `@$ASSETS/char-robot/...@` will resolve inside a Houdini session that happens to have the variable set, and fail everywhere else: in `usdview`, in another DCC, on a farm node with a different environment, for a vendor you send the file to.

The alternative failure is just as bad. If Houdini expands the variable at write time instead, you get an absolute path baked into the published file — which is the thing this section opens by forbidding.

So published USD uses **relative paths**, anchored to the file that contains them:

```
# in assets/char-robot/assembly/usd/char-robot.usda
@../../blocks/model/usd/char-robot_model.usdc@

# in shots/kilo/0010/assembly/usd/kilo-0010.usda
@../../blocks/layout/usd/kilo-0010_layout.usda@
@../../../../../sets/living-room/assembly/usd/set-living-room.usda@
```

Relative paths need no configuration at all. The project can be moved, copied, checked out to a different drive letter, or handed to someone outside the team, and every reference still resolves — because the folder structure travels with the files.

**Solaris already does this for you.** The USD ROP converts the paths you author into relative paths when it writes the file, by default. You author `$ASSETS/char-robot/...` in your parameters and get a relative path in the published USD without setting anything up — so this is a property of the pipeline to be aware of, not a step you have to perform.

**After every publish, check the paths that were actually written.** Open the file as text (or use `usdview`'s layer stack) and confirm the asset paths are relative and no absolute path was baked in. This belongs in the publish check (Section 20), and it is the single most common cause of "works for me, broken for everyone else."

### 18.2 Project variables

| Variable | Points to |
| --- | --- |
| `$PROJECT` | Project root |
| `$ASSETS` | `$PROJECT/assets/` |
| `$SETS` | `$PROJECT/sets/` |
| `$SHOTS` | `$PROJECT/shots/` |
| `$LIBRARY` | `$PROJECT/library/` |

Examples in use — in HIP parameters:

```
$ASSETS/char-robot/assembly/usd/char-robot.usda
$SETS/living-room/assembly/usd/set-living-room.usda
$SHOTS/kilo/0010/blocks/anim/usd/kilo-0010_anim.usdc
$LIBRARY/materials/metal-bare.usda
```

### 18.3 Distributing the environment: use a package

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
        { "OCIO":    "$PROJECT_ROOT/houdini/ocio/config.ocio" }
    ],
    "path": [
        "$PROJECT_ROOT/houdini"
    ]
}
```

Each artist sets one thing — `PROJECT_ROOT`, wherever the project lives on their machine or mount — and everything else derives from it. `HOUDINI_OTLSCAN_PATH` is covered by the `path` entry, which is how the rig HDAs in `houdini/otls/` (Section 12.1) reach everyone.

The advantages over `houdini.env`: the configuration is versioned in the repo with everything else, multiple projects can coexist, and the farm gets the identical environment by pointing at the same file. When the project's environment changes, it changes for everyone on the next SVN update instead of requiring an email telling four people to edit a file in their home directory.

If references are broken when you open a HIP, check the environment before anything else — open a Houdini shell and run `echo $ASSETS` to verify the variable is resolving.

---

## 19. Colour Management (OCIO)

Colour is project infrastructure, in the same category as paths and units: decided once, applied everywhere, and painful to change once work exists. Mismatched colour configuration is the most common cause of "looks different on my machine / on the farm / in comp."

**One config, one place.** The `OCIO` environment variable points at a single, version-pinned config, set in the project package (Section 18.3) so that every artist *and the farm* resolve the same one. That is the part that matters — far more than which config you choose.

Houdini ships with a bundled ACES config, and for a small all-Karma team that is a reasonable default. Its exact name and version vary between Houdini builds, so check what you are actually on under **Edit ▸ OCIO Settings** rather than hardcoding a filename; if you want the config pinned against Houdini upgrades, copy it into `$PROJECT/houdini/ocio/` and point `OCIO` there.

**Set the working space once.** In Edit ▸ OCIO Settings, set the Render Working Space to **ACEScg** and the View Transform to an ACES SDR video transform. Houdini's out-of-the-box defaults depend on the build and on whether an `OCIO` variable is present, so do not assume — open the settings, look, and set them deliberately at the start of a project. ACEScg is the house default; where a project needs something else (a client delivery spec, a broadcast requirement), that is a project-level decision and it should be written down with the project, not carried in anyone's head.

**Texture colour spaces follow the channel tokens.** Houdini and Karma convert textures automatically from the OCIO file rules, and the channel tokens from Section 16.9 line up with those rules exactly: `bc` (base colour) is colour-managed (sRGB texture → working space); `n`, `aormt`, and `m` are **raw/linear data** and must not be colour-managed. The packed `aormt` map in particular must be read raw, or roughness and metalness come out wrong. Naming a texture correctly is therefore also what gets its colour space right.

**Render output stays linear; the look is applied downstream.** Karma writes scene-linear EXRs. Render in ACEScg — set it on the Karma Render Settings LOP (Image Output ▸ AOVs ▸ Output Colorspace) or include the colour space in the output filename, since an unmarked EXR may be interpreted by a default file rule rather than by what you intended. Do not bake the display/view transform into the EXR you hand to comp; the view transform — and any filmic tone map under Karma Render Settings ▸ Image Output ▸ Filters — is for review and LDR deliverables, applied on top of the linear render, not burned into it.

**Do not let anyone override the config locally.** A per-artist OCIO setting is invisible to everyone else and produces exactly the class of bug this section exists to prevent.

---

## 20. Publishing

A USD file is not published until all of these are true:

- Exports without errors
- Loads correctly in a **fresh** Houdini session — not the one you authored it in
- Contains **only your layer** — no restated upstream data (check the Layer Break, Section 13.1)
- Asset paths written *inside* the file are **relative**, with no absolute path baked in (Section 18.1)
- Stage metrics are set: units, up axis, frame rate — and frame range on shot layers (Section 10.6)
- Default prim is set (for asset files)
- Follows naming conventions
- Committed to SVN
- Downstream artists notified if this affects their work

A file on disk that is not committed to SVN is not published — it exists only on your machine.

### 20.1 How to verify a publish

1. Write USD via the USD ROP
2. Open the published file as text (or in `usdview`) and read the top of it — are the sublayer/reference paths relative? Is the metadata right?
3. Open a blank Houdini session
4. Use a Sublayer or Reference LOP to load your file
5. Check the scene graph tree — does it contain what you intended, and *only* what you intended?
6. Check the Houdini console for warnings
7. Commit to SVN

Step 5 cuts both ways. A layer with less in it than you expected usually means the Layer Break is too low or a default prim is missing. A layer with *more* in it than you expected — the whole set, the assets — means the Layer Break is too high or missing, and you are about to republish someone else's work on top of them.

### 20.2 Versioned archives

Published USD filenames are stable. If you need versioned snapshots for rollback, use a `versions/` subfolder:

```
$SHOTS/kilo/0010/blocks/anim/usd/kilo-0010_anim.usdc              ← stable, referenced by others
$SHOTS/kilo/0010/blocks/anim/usd/versions/kilo-0010_anim_v001.usdc
$SHOTS/kilo/0010/blocks/anim/usd/versions/kilo-0010_anim_v002.usdc
```

Nothing in the pipeline references the `versions/` folder.

---

## 21. Source Control (SVN)

### 21.1 Commit these

- HIP files
- Published USD files
- Textures and material files
- Small project tools and scripts
- Documentation

### 21.2 Do not commit these

- Render outputs
- Houdini backup files (`.hip.bak`)
- Crash files
- Temporary caches
- Personal scratch files

Heavy simulation caches should be discussed with the team before committing — they may need external storage.

### 21.3 Caches that published layers depend on

There is an important distinction inside "caches", and it is not about size:

- A **working cache** is scratch — an intermediate sim, a test wedge, anything only you will ever read. Keep it local, do not commit it, delete it freely.
- A **published cache** is any file a published USD layer *references* — the VDBs behind `kilo-0010_fx.usdc`, an Alembic a layer points at. These are production data, whether or not they live in SVN.

**Rule: anything a published layer references must live on shared storage that every artist and the farm can reach, at a path that does not change.** A published layer pointing at a cache on your workstation is a broken publish — it renders correctly for you and fails for everyone else, usually silently and usually at the worst moment.

Where that shared storage *is* — in SVN, or on a separate cache volume — is a team decision that depends on size. What is not optional is that it is shared, stable, and reachable from the farm. If a cache moves, treat it exactly like a renamed prim path: a breaking change requiring coordination.

The same test as everywhere else applies: publish it, then open it in a **fresh** session on **another machine**. Local absolute cache paths are one of the listed silent failures in Section 22 for good reason.

### 21.4 SVN and binary files

`.usdc` files produce meaningless diffs. This is expected — SVN still tracks history correctly. For any layer where readable history is useful, prefer `.usda`.

---

## 22. Debugging Checklist

Work through this in order. Most problems are a file path issue, a prim path issue, a Layer Break issue, or a stale cache.

### File and path

- [ ]  Does the file exist at the referenced path?
- [ ]  Are environment variables set correctly for this project?
- [ ]  Is the HIP parameter using `$ASSETS` / `$SHOTS` — not a local absolute path?
- [ ]  Are the paths written *inside* the published USD relative — not `$VARIABLE`, not absolute? (Section 18.1)
- [ ]  Does SVN have the latest upstream file?

### Prim paths

- [ ]  Does the prim you are referencing exist in the upstream file? (Check in `usdview`)
- [ ]  Did an upstream artist rename a prim path without communicating it?
- [ ]  Is the default prim set on the asset? (Check the USDA header)
- [ ]  Is the asset placed at the correct instance path? (`/World/Characters/Hero`, not `/CharRobot`)

### Layer and composition

- [ ]  Is your Layer Break placed correctly — context below it, your contribution above it? (Section 13.1)
- [ ]  Is your published layer **empty of your own work**? The break is probably too low — your own references or cameras fell below it.
- [ ]  Is your published layer **full of upstream data**? The break is too high, or missing.
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
- [ ]  FX cache with an absolute or local path that resolves on your machine but not others (Section 21.3)
- [ ]  A variant override written with `variants` inside the prim body instead of its metadata — a parse error, easy to misread (Section 14.3)
- [ ]  An override authored on a prim *inside* an instanceable prim — instance proxies are not editable and the edit is silently ignored (Section 15.1)

> 👉 Most problems are path problems, prim path problems, or a missing Layer Break. Start there.
>

---

## 23. Core Rules

1. One role owns one USD layer at a time.
2. One task lives in one HIP file.
3. Never edit a layer you do not currently own.
4. Always publish USD before handing off.
5. Never pass a HIP file as a deliverable.
6. Published USD filenames stay stable — they do not version.
7. Always use environment variables for paths.
8. Set a default prim on every published asset USD.
9. Place a Layer Break between context and contribution — and verify what actually got published.
10. Environment variables in HIP parameters; relative paths inside published USD.
11. Every published layer states its units, up axis, and frame rate.
12. Anything a published layer references must live on shared storage at a stable path.
13. Communicate upstream changes to downstream artists — flag prim path changes, HDA interface changes, and topology changes explicitly.
14. Keep HIP files organised and readable.
15. If unsure who owns a layer, ask before editing.

---

## 24. Mental Models

**USD is like Photoshop layers.**
Each role adds a layer. No one paints on a layer someone else currently has. The final image is the composite. If you want something changed in a layer you do not own, you talk to the person who does — or, if they have moved on, you take the layer over and carry on.

**HIP is your working environment. USD is the result you hand to others.**
Your HIP is where you work — iterate, refine, experiment. Your published USD is what others build on. Keep both in good order. A well-organised HIP makes handoffs faster and debugging easier.

**Published paths are contracts.**
When you publish `kilo-0010_anim.usdc`, that path is a contract with every downstream layer. Renaming or moving the file breaks their work. Honour the contract, or coordinate the change explicitly before making it.

**Prim paths are as important as file paths.**
A reference that finds the right file but the wrong prim is a silent failure. Treat prim path renames as breaking changes.

**Context is not contribution.**
What you load to work against and what you publish are two different things. The Layer Break is where you draw the line between them. Nearly every publishing bug in this pipeline is that line drawn in the wrong place.

**Roles are hats, not walls.**
On a small team you may wear many hats. The rules still apply — you apply them to yourself. Once you have published a layer and the next stage has built on it, treat it as handed off.

---

**Part IV — Putting It Together**

---

## 25. Worked Example: Full Production Cycle

This traces a complete production cycle for one shot on a four-person flat team. Each person covers multiple roles.

| Artist | Roles |
| --- | --- |
| Alex | Modeling, Rigging, Assembly |
| Maria | Lookdev, Set Lighting, Set Lookdev, Shot Lighting |
| Ina | Set Dressing, Layout |
| Erik | Animation |

---

### Phase 1 — Asset creation

**Alex: Modeling**

Builds geometry in SOPs. Establishes the prim hierarchy in Solaris. On a **Configure Layer LOP**, sets the default prim to `CharRobot` and the stage metrics — Y up, `metersPerUnit = 1`, project frame rate (Section 10.6).

Publishes:

```
$ASSETS/char-robot/blocks/model/usd/char-robot_model.usdc
```

Verifies in a fresh session, commits. Notifies Maria and himself: *“Model published. Prim root `/CharRobot`, geometry under `/CharRobot/Geo`. Y up, metres.”*

---

**Alex: Rigging** (parallel with Maria)

References the model USD. Builds the rig. The robot is mechanical — no deformation — so this is a **Lane 1** asset (Section 12.2): animation will publish transform overrides, and no bind-pose skeleton USD is needed. The `rig` block therefore publishes no USD at all.

What it publishes is the **rig HDA**:

```
$PROJECT/houdini/otls/char-robot_rig.hda
```

Commits. Notifies Erik: *“Rig published as `char-robot_rig` — SVN update and it will be in your tab menu. Controls are `ctrl_root`, `ctrl_spine`, `ctrl_arm_l/r`. Shout before you key anything if you want names changed; once you have animation on them they are frozen.”*

Note what did *not* happen: Erik was not sent a HIP file to copy from. When Alex fixes the rig next week, he republishes the HDA, Erik runs `svn update`, and the definition refreshes inside Erik's existing scene with his animation intact.

---

**Maria: Lookdev** (parallel with rigging)

SVN updates. References the model USD for context. Builds MaterialX materials under `/CharRobot/Mtl`, inline in the lookdev file (Option A — small production).

```
[Reference: char-robot_model.usdc]   ← context: the geometry to shade
[Layer Break]                        ← everything above is Maria's contribution
[Material Library: MaterialX networks]
[Assign Material: bindings]
[Configure Layer: metrics]
[USD ROP → char-robot_lookdev.usda]
```

Publishes:

```
$ASSETS/char-robot/blocks/lookdev/usd/char-robot_lookdev.usda
```

Opens the published file as text and confirms it contains materials and bindings — not a copy of the geometry. Notifies Alex: *“Lookdev done. Ready for assembly.”*

---

**Alex: Assembly**

SVN updates. Creates the assembly HIP: Sublayer LOPs bring in the lookdev and model blocks (no rig block — Lane 1 asset), a Configure Layer LOP sets `CharRobot` as the default prim, and an **Add Variant / Set Variant** LOP sets production defaults for any VariantSets modeling defined. The USD ROP writes the assembled file.

The resulting assembly file:

```
#usda 1.0
(
    defaultPrim = "CharRobot"
    metersPerUnit = 1
    upAxis = "Y"
    subLayers = [
        @../../blocks/lookdev/usd/char-robot_lookdev.usda@,
        @../../blocks/model/usd/char-robot_model.usdc@
    ]
)
```

Alex opens it as text and checks the two things that matter: the sublayer paths are **relative**, and there are no scene opinions in the file — only composition.

Publishes:

```
$ASSETS/char-robot/assembly/usd/char-robot.usda
```

Notifies Ina and Maria: *“char-robot.usda ready. Set dressing and shot layout can begin.”*

---

### Phase 2 — Set creation

Set creation happens in parallel with asset work where possible, but requires the relevant assets to be published first. Ina and Maria build the living room set — the persistent shared space that all shots in this location will use.

---

**Ina: Set Dressing**

SVN updates. Opens the set dressing HIP. References all the prop and furniture assets and places them in the world. The set dressing layer establishes the full spatial layout of the living room — where every piece of furniture sits, where props are arranged.

LOP network:

```
[Reference: prop-sofa.usda → /World/Props/Sofa]
[Reference: prop-table.usda → /World/Props/CoffeeTable]
[Reference: prop-lamp.usda → /World/Props/FloorLamp]
[Transform edits — position, rotate, scale each prop]
[Configure Layer: metrics]
[USD ROP → set-living-room_dressing.usda]
```

**No Layer Break here.** The stage starts empty and the references *are* Ina's contribution — placing those props is the entire job of set dressing. A Layer Break below the references would discard them and publish a file containing transform overrides on prims that do not exist: an empty set, no error. (Section 13.1)

Publishes:

```
$SETS/living-room/blocks/dressing/usd/set-living-room_dressing.usda
```

Notifies Maria: *“Set dressing published. Ready for set lighting.”*

---

**Maria: Set Lighting** (can begin once dressing is published)

SVN updates. SubLayers the dressing block to see the dressed space, then breaks — the dressed room is context she is lighting against, not something she republishes. Adds practical lights: the floor lamp, ceiling fixtures, anything physically present in the room and on regardless of which shot is filmed here.

LOP network:

```
[Sublayer: set-living-room_dressing.usda]   ← context
[Layer Break]                               ← above this: Maria's lights only
[Sphere Light → /World/Lighting/FloorLampPractical]
[Rect Light → /World/Lighting/CeilingFixture]
[Configure Layer: metrics]
[USD ROP → set-living-room_lighting.usda]
```

Publishes:

```
$SETS/living-room/blocks/lighting/usd/set-living-room_lighting.usda
```

Checks the published file: two lights, no furniture.

---

**Maria: Set Lookdev** (optional — as needed)

If the location needs surface overrides that aren't part of any individual asset — worn paint on the specific walls of this room, staining on the particular floor — Maria adds those in the set lookdev layer, with the same context-below-break structure.

Publishes (if needed):

```
$SETS/living-room/blocks/lookdev/usd/set-living-room_lookdev.usda
```

---

**Ina: Set Assembly**

SVN updates. Creates the set assembly — a simple HIP with Sublayer LOPs stacking the set's blocks and a USD ROP writing the assembled file.

```
#usda 1.0
(
    metersPerUnit = 1
    upAxis = "Y"
    subLayers = [
        @../../blocks/lighting/usd/set-living-room_lighting.usda@,
        @../../blocks/lookdev/usd/set-living-room_lookdev.usda@,
        @../../blocks/dressing/usd/set-living-room_dressing.usda@
    ]
)
```

Publishes:

```
$SETS/living-room/assembly/usd/set-living-room.usda
```

Notifies the team: *“Set published. Shot layout can begin.”*

---

### Phase 3 — Shot production

**Ina: Layout**

SVN updates. Her layout HIP subLayers the assembled set for context — the room is already dressed and lit with its practicals — then breaks. Her job is to add the camera and place the robot for this specific shot, and to establish the shot's frame range.

LOP network:

```
[Sublayer: set-living-room.usda]        ← context: the shared space
[Layer Break]                           ← above this: Ina's shot contribution
[Reference: char-robot.usda → /World/Characters/Hero]
[Camera LOP → /World/Cameras/Main]
[Transform edits, shot-specific set overrides if needed]
[Configure Layer: metrics + startTimeCode 1001, endTimeCode 1100]
[USD ROP → kilo-0010_layout.usda]
```

The break placement is the thing to get right, and it is the opposite of what it looks like at first glance. The **set** is below the break: Ina is not republishing the living room. The **robot reference and the camera** are above it: those are her deliverables, and a break placed below them would silently strip the character and camera out of the published shot. The test is Section 13.1's — *if this vanished from my file, would my work be missing?*

Layout also owns the shot's frame range (Section 10.6), because layout is where the shot's timing is first established.

Publishes:

```
$SHOTS/kilo/0010/blocks/layout/usd/kilo-0010_layout.usda
```

Notifies Erik: *“Layout published. Hero at `/World/Characters/Hero`, camera at `/World/Cameras/Main`. Frames 1001–1100.”*

---

**Erik: Animation**

SVN updates — which brings him both the layout block and any rig HDA changes.

His animation HIP does two things. For **context**, it subLayers the shot's stack so far, in shot root order: the set, then layout. This matters — the layout block on its own is sparse. It contains a camera and a reference to the robot, and nothing else; the living room only appears when the set is subLayered beneath it. Loading just the previous block gives an almost-empty stage, which is the most common confusion when people first work this way.

For **authoring**, it contains the `char-robot_rig` HDA from the tab menu, giving Erik live controls. He animates on those controls, then bakes: this is a Lane 1 asset (Section 12.2), so the bake extracts per-part transforms and a SOP Import LOP brings them onto the stage as time-sampled overrides on the prims layout already established.

LOP network:

```
[Sublayer: set-living-room.usda]        ← context (weakest)
[Sublayer: kilo-0010_layout.usda]       ← context
[Layer Break]                           ← above this: Erik's animation only
[SOP Import: baked transforms → /World/Characters/Hero/Geo/...]
[Configure Layer: metrics]
[USD ROP → kilo-0010_anim.usdc]
```

Published as `.usdc` — it is time-sampled cache data, not composition (Section 5.4).

Publishes:

```
$SHOTS/kilo/0010/blocks/anim/usd/kilo-0010_anim.usdc
```

Notifies Maria: *“Anim published, kilo-0010. Rough pass.”*

---

**Maria: Shot Lighting**

SVN updates. Same pattern: subLayer the stack so far for context — set, layout, anim, in shot root order — then break. The practical lights from the set are already present in that context; her job is the hero lighting that shapes this shot.

LOP network:

```
[Sublayer: set-living-room.usda]        ← context (weakest)
[Sublayer: kilo-0010_layout.usda]       ← context
[Sublayer: kilo-0010_anim.usdc]         ← context
[Layer Break]                           ← above this: Maria's lighting only
[Sphere Light → /World/Lighting/KeyLight]
[Sphere Light → /World/Lighting/RimLight]
[Karma Render Settings → /Render]
[Configure Layer: metrics]
[USD ROP → kilo-0010_lighting.usda]
```

As the last artist in the shot chain, Maria also creates the shot root. Note that it subLayers the **set** directly as the weakest layer — the set does not arrive through any block (Section 9.4):

```
#usda 1.0
(
    metersPerUnit = 1
    upAxis = "Y"
    subLayers = [
        @../../blocks/lighting/usd/kilo-0010_lighting.usda@,
        @../../blocks/anim/usd/kilo-0010_anim.usdc@,
        @../../blocks/layout/usd/kilo-0010_layout.usda@,
        @../../../../../sets/living-room/assembly/usd/set-living-room.usda@
    ]
)
```

Five lines, and the whole shot is legible: every ingredient named, strongest first.

Publishes both:

```
$SHOTS/kilo/0010/blocks/lighting/usd/kilo-0010_lighting.usda
$SHOTS/kilo/0010/assembly/usd/kilo-0010.usda
```

Renders from the shot root — interactively via the USD Render ROP, or on the farm with Husk (Section 13.6).

---

### When something changes upstream

**If the robot model updates:**

Alex republishes `char-robot_model.usdc`. Assuming prim paths and topology are stable, the change propagates automatically through the assembly to everything downstream. Maria checks her lookdev bindings, Alex verifies the assembly and republishes the rig HDA if the rig needs adjusting, Ina and Erik reload and verify their layers. Only republish if something is actually broken.

If prim paths *did* change, this is a breaking change and must be flagged explicitly (Section 9.6) — every downstream override targets those paths by name, and they will fail silently.

**If the rig updates:**

Alex republishes `char-robot_rig.hda`. Erik runs `svn update` and the definition refreshes in his open scene. If Alex only changed rig internals, Erik's animation is untouched and he simply re-bakes. If Alex renamed or removed a control Erik has keys on, that is a breaking change and needed coordinating before it happened (Section 12.1).

**If the set dressing changes:**

Ina updates `set-living-room_dressing.usda` and republishes. Because `set-living-room.usda` subLayers it by stable relative path, the assembled set reflects the change automatically. Maria reloads her set lighting HIP to verify the practicals still read against the new arrangement. Every shot that subLayers the set gets the update on next reload — no per-shot work.

**If a shot needs a set override:**

A prop needs to be moved for a specific shot — the coffee table pushed aside for a stunt. This override lives in the shot's layout block, not in the set. The set is unchanged, and because it is the weakest layer in the shot root, layout's opinion wins automatically:

```
over "World" {
    over "Props" {
        over "CoffeeTable" {
            double3 xformOp:translate = (2.0, 0, 0.5)
        }
    }
}
```

Other shots are unaffected. The coffee table remains in its original set position everywhere else.

The key point: **only republish if your layer's content has actually changed or broken**. USD's composition propagates updates automatically. Republishing unnecessarily creates noise and forces downstream artists to reload without reason.

---

## 26. Further Reading

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
- [husk command-line renderer](https://www.sidefx.com/docs/houdini/ref/utils/husk.html) — the full, version-specific flag reference for farm rendering (Section 13.6).
- [Digital assets (HDAs)](https://www.sidefx.com/docs/houdini/assets/) — how rigs are packaged and published (Section 12.1).
- [USD Render ROP](https://www.sidefx.com/docs/houdini/nodes/out/usdrender.html) — rendering the stage from inside Houdini.
- [Colour management (OCIO) in Houdini](https://www.sidefx.com/docs/houdini/solaris/ocio.html) — the authoritative version of Section 19.

**Shading and colour**

- [MaterialX](https://materialx.org/) — the shading standard used for lookdev (Section 11.3).
- [UsdSkel schema](https://openusd.org/release/api/usd_skel_page_front.html) — the skeletal animation schema, if you reach Lane 3 in Section 12.2.
- [Houdini packages](https://www.sidefx.com/docs/houdini/ref/plugins.html) — how the project environment reaches each artist (Section 18.3).
- [OpenColorIO](https://opencolorio.org/) — the colour-management system behind the OCIO config (Section 19).

---

*End of guide.*
