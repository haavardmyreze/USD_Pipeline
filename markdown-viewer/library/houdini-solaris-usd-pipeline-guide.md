# Houdini Solaris / USD Pipeline Guide

---

### Table of Contents

**Part I — Understanding USD**

1. The Problem This Solves
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
19. Publishing
20. Source Control (SVN)
21. Debugging Checklist
22. Core Rules
23. Mental Models

**Part IV — Putting It Together**

24. Worked Example: Full Production Cycle
25. Further Reading

---

## How to Use This Guide

| You are… | Read… |
| --- | --- |
| New to USD | Part I (Sections 1–5) in order, then Part II |
| Starting a task | Section 7 (the daily loop) + Section 8 (naming at a glance) |
| Looking up a filename pattern | Section 16 (naming conventions) |
| Setting up a new project | Section 17 (folder structure) + Section 18 (paths) |
| Going deeper on USD | Section 5 (USD in Depth) |
| Something is broken | Section 21 (debugging) |
| Onboarding someone | Part I, then walk through Section 24 together |

---

**Part I — Understanding USD**

---

## 1. The Problem This Solves

Before introducing any USD concepts, it helps to understand what problem USD is designed to fix.

On a traditional 3D production — in Maya, Cinema 4D, Blender, or similar tools — a scene typically lives in **one file**. That file contains everything: geometry, materials, animation, lighting, cameras, render settings. When a team needs to work on the same scene, problems follow:

- Only one artist can safely edit the file at a time
- Files get locked, or worse, silently overwritten
- Merging two artists’ changes is difficult or impossible
- It is hard to know what changed, when, and why
- The file grows large and fragile as production continues

These problems get worse as the team grows. They also get worse as the project gets more complex. The traditional answer is to break the scene into separate files — but without a shared system for how those files connect, you end up with a different kind of chaos.

**USD is that shared system.**

It defines a consistent way for many partial files to be combined into one coherent scene at runtime. No single file owns the whole scene. Every artist contributes their own file. The scene is assembled from those contributions automatically.

---

## 2. What USD Is

USD — Universal Scene Description — was developed at Pixar and open-sourced in 2016. It is easy to think of it as a file format, but it is really three things stacked together:

- **A set of file formats** — `.usda` (readable text), `.usdc` (compact binary), `.usd` (either of those), and `.usdz` (a packaged archive). These hold the data.
- **A scene-graph data model** — a standard way to describe geometry, materials, cameras, lights, and their hierarchy, so every tool reads the same scene the same way.
- **A composition engine** — the rules for combining many files into one scene.

The composition engine is the part that matters, and it is what makes everything else in this guide possible. It lets many separate files each state *opinions* about the same scene, then resolves them into a single result by strict, predictable rules. No file has to contain the whole scene — each file contributes a part, and USD assembles them.

A few words you will see throughout:

- A **stage** is the fully composed scene — what you actually see in the viewport and render. It lives in no single file; it is the result of combining files.
- A **layer** is one file's contribution. Layers are the unit of collaboration: each artist authors their own layer.
- A **prim** (primitive) is a node in the scene hierarchy — a mesh, a light, a camera, a transform, a material.
- An **opinion** is a single statement of a value. Many layers can hold opinions about the same prim; composition decides which one wins.

This is what makes the pipeline work: a downstream artist can override a value an upstream artist authored **without modifying the upstream file**. The lighter can move a prop the layout artist placed, and if layout later republishes, the lighter's override still applies on top. Because of that, "the scene" is not a file anyone owns — it is assembled at runtime from everyone's layers.

> 👉 If you remember one thing: USD is a composition engine. Files contribute opinions; USD composes them into a stage. Section 5 covers the mechanics — layers, prims, composition arcs, and the strength order that decides which opinion wins.
> 

### A concrete example

Take one shot: a robot walking through a warehouse, and four artists who all need to work on it at once — one placing the robot and camera, one animating the walk, one adding smoke and sparks, one lighting the scene.

The robot is an **asset**, built and textured once. The warehouse is a **set**, dressed and lit once. The shot is everything specific to this moment. In USD, none of the four artists work in the same file — each owns one **block** (a sparse layer holding only their contribution), and a small **shot root** composes the blocks into the finished shot:

```
char-robot.usda            ← asset: built once, reused everywhere
set-warehouse.usda         ← set: the dressed space (layout subLayers it)
neon-0010_layout.usda      ← block: camera, and where the robot stands
neon-0010_anim.usda        ← block: how the robot moves
neon-0010_fx.usda          ← block: smoke and sparks
neon-0010_lighting.usda    ← block: key light, mood, render settings
        ↓  composed by  ↓
neon-0010.usda             ← shot root: subLayers the blocks into one stage
```

Each block holds only its author’s opinions. The lighting block does not contain the robot or the warehouse — only the lights, the render settings, and any overrides the lighter needs. When USD opens the shot root, it reads every block, follows the references out to the asset and the set, and resolves the whole thing into a single stage.

Here is the part that makes it click. Layout places the robot at the origin. The lighter wants it nudged half a metre for a cleaner silhouette — but never opens layout’s file. They author the nudge in their own block:

```
# neon-0010_lighting.usda
over "World" {
    over "Characters" {
        over "Hero" {                                  # the robot, as placed by layout
            double3 xformOp:translate = (0.5, 0, 0)    # nudged for framing
        }
    }
}
```

The shot root lists the lighting block above the layout block, so lighting’s opinion is the stronger one and the robot ends up nudged — while layout’s file stays exactly as it was. If layout later re-blocks the shot and republishes, the nudge still applies on top. Nobody merged anything, nobody overwrote anyone, and four people worked the same shot in parallel.

That is what USD buys you. The rest of this guide is how to make it work in practice.

### Assets, sets, and shots

The files in that example fall into three distinct categories that run through everything in this pipeline.

**Assets** are the building blocks of a production — characters, props, individual pieces of furniture. An asset like `char-robot.usda` is built once and reused wherever it is needed. It is not specific to any location or moment in the film.

**Sets** are dressed, populated spaces — a living room, a warehouse floor, a forest clearing. A set assembles assets into a persistent shared environment that multiple shots can inhabit. The sofa’s position in the living room is a set-level truth, not a shot-level truth. If the sofa moves, it moves for every shot that takes place in that room.

**Shots** are specific moments — a particular sequence of frames with a specific camera, specific character positions, specific lighting. A shot references a set and adds everything that is unique to that moment: the camera angle, character blocking, and any shot-specific overrides to the environment.

This three-tier structure shapes the folder layout, naming conventions, and ownership rules throughout this guide. When you see something described differently for assets, sets, or shots, this is why.

---

## 3. The Mental Shift

There is one conceptual change that makes USD make sense. Until it clicks, everything feels backwards.

> **Traditional thinking:**
*“I am editing the scene.”*
> 

> **USD thinking:**
*“I am contributing my layer to a composed scene.”*
> 

In a traditional pipeline you open the scene and work in it. In a USD pipeline, the scene does not exist as a single thing you open. It is assembled at runtime from layers. Your job is to author your layer — and only your layer.

This has a practical consequence: **you do not touch another artist’s layer**. If you need something changed in a layer you do not own, you talk to the artist who owns it. You do not open their file.

On a small team where one person covers multiple roles, this still applies — to yourself. Once you have published a layer and the next person in the chain has built on it, treat it as handed off. Changes go through the communication process, not through quietly re-editing files.

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

When multiple layers are composed together, opinions can conflict. USD resolves conflicts using **opinion strength**: stronger layers win over weaker ones. The strength ordering is called LIVRPS (Local > Inherits > VariantSets > References > Payloads > Specializes). You do not need to memorise this, but you need to know it exists. It explains how a lighting override can win over a model value without touching the model file.

In the shot root, **layer order determines strength**. Layers listed earlier are stronger. This is why lighting goes first and layout goes last — the lighter’s overrides win over placement data, which is the correct creative intention.

```
subLayers = [
    @neon-0010_lighting.usda@,   ← strongest
    @neon-0010_fx.usda@,
    @neon-0010_anim.usda@,
    @neon-0010_layout.usda@      ← weakest
]
```

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

| Format | Extension | Use for |
| --- | --- | --- |
| ASCII text | `.usda` | Composition layers, materials, assignments — anything you need to read or diff |
| Binary crate | `.usdc` | Geometry, animation caches — fast and compact but not human-readable |

When you cannot tell what is in a `.usdc` file by opening it, use `usdview` or the Houdini scene graph tree. Never guess at binary contents.

---

**Part II — How the Pipeline Works**

---

## 6. Roles

This guide uses role names to describe responsibilities, not job titles. On a small team, one person will cover multiple roles. That is expected and normal. The rules do not change based on team size — one person simply owns more layers.

| Role | Responsible for |
| --- | --- |
| **Modeling** | Geometry, prim hierarchy, VariantSet definitions |
| **Lookdev** | Materials, shading, material assignments on assets |
| **Rigging** | Rig setup in HIP, skeleton structure for animation handoff |
| **Assembly** | Final asset package, combining model, rig, and lookdev |
| **Set Dressing** | Prop placement and furniture arrangement within a set |
| **Set Lighting** | Practical lights and persistent environment lighting within a set |
| **Set Lookdev** | Location-specific surface overrides within a set |
| **Layout** | Camera placement, character blocking, shot-specific overrides to the set |
| **Animation** | Character and object motion, baked animation output |
| **FX** | Simulations, FX caches, FX USD layers |
| **Lighting** | Shot hero lights, mood, atmosphere, render settings |

**On a flat team, who creates the shot root?**

The shot root file assembles all of the shot's blocks into the final shot (explained in Section 9). On a larger production this is often a dedicated TD’s job. On a small flat team, it falls to whoever is acting as project lead for that shot — typically the lighting artist, since they are last in the chain. It is a simple file to create (see Section 9.3) and does not require a specialist.

---

## 7. The Daily Loop

This is what every artist does every working day, in order:

```
1. SVN Update
2. Open your HIP
3. Do your work
4. Publish USD
5. Verify the published USD loads correctly
6. SVN Commit
```

That loop is the pipeline. Everything else in this guide is detail that supports one of those six steps.

**A few things that never change:**

- Always SVN update before you start. You need the latest version of everything upstream.
- Always publish USD before you hand off. A HIP file is not a handoff.
- Always verify your publish in a clean Houdini session — not the one you authored it in.
- Always commit with a message that describes what changed and why.

**Commit messages that work:**

```
Layout: moved hero 2m left for camera framing, neon-0010
Anim: rough walk cycle pass, neon-0010 — timing not final
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

- A **name** is one token, hyphenated: `char-robot`, `set-living-room`, `neon-0010`.
- A **published block** is `<name>_<block>`: `char-robot_model.usdc`, `neon-0010_lighting.usda`.
- An **assembly** is just the clean name: `char-robot.usda`, `set-living-room.usda`, and `neon-0010.usda` (the shot root).
- A **HIP** adds artist and version: `neon-0010_anim_erik_v003.hip`.

Published USD filenames are stable — they never carry a version or an artist. HIP files always do.

---

## 9. The Pipeline

### 9.1 Asset pipeline

An asset is built from **blocks** plus one **assembly** file — the same structure used for sets and shots.

**Blocks** are sparse layers, each owning a single concern. The common asset blocks are `model`, `rig`, and `lookdev`, but the list is not fixed — an asset can have whatever blocks it needs.

**Assembly** is a single file that subLayers all of the asset's blocks. It holds **no scene opinions of its own** — only subLayers, a `defaultPrim`, and any production-default variant selections. It is the file sets and shots reference.

The blocks have a natural workflow dependency:

```
model → (rig ∥ lookdev) → assembly → published asset
```

Modeling publishes first. Rig and lookdev can then run in parallel. Assembly waits for both.

```
char-robot_model.usdc       ← block: geometry and prim hierarchy
char-robot_rig.usda         ← block: skeleton structure (bind pose only)
char-robot_lookdev.usda     ← block: materials and bindings
        ↓
char-robot.usda             ← assembly: subLayers the blocks (what shots reference)
```

The assembly file (always `.usda`, pure composition):

```
#usda 1.0
(
    defaultPrim = "CharRobot"
    subLayers = [
        @$ASSETS/char-robot/blocks/lookdev/usd/char-robot_lookdev.usda@,
        @$ASSETS/char-robot/blocks/rig/usd/char-robot_rig.usda@,
        @$ASSETS/char-robot/blocks/model/usd/char-robot_model.usdc@
    ]
)
```

Assembly ordering determines opinion strength — earlier listed = stronger. The artist owning the assembly is responsible for that ordering.

**Shots always reference the assembly file, not the individual blocks.**

### 9.1.1 When to use a single block

The split into separate blocks makes the most sense when different people own different concerns, or when the asset is complex enough that separating geometry from materials has clear organisational value.

When one artist builds an asset end to end — a smaller prop, a tightly integrated hero asset where shading decisions are made alongside geometry decisions — there is no requirement to split it. The asset can be a single block, or a single self-contained layer published directly as the assembly. In that case the assembly file is the asset file.

```
char-robot.usda     ← geometry, materials, rig, everything — authored in one HIP
```

The rule is not *always split*. The rule is that whatever gets published as the assembly must be a stable, correctly structured USD file with a default prim set, at a stable path, that downstream stages can reference reliably. How many blocks or intermediate HIPs produced it is an internal decision for whoever owns that asset.

A useful way to think about it: blocks exist to serve parallel work and clear ownership boundaries. If neither is a concern for a given asset, splitting into blocks adds overhead without adding value.

**Complex assets are also assemblies.** A VFX asset with smoke, fire, particles, and a full shader rig is itself an assembly of sub-assets. The same principle applies — a root `fx-explosion.usda` subLayers its blocks. What looks like an edge case is the same model at a different scale.

### 9.2 Set pipeline

A set is built from **blocks** plus one **assembly** file, the same as an asset.

**Blocks** are any number of named layers, each owning a single concern (dressing, lighting, FX, lookdev, etc). A block can cover any discipline, but a single block should not mix concerns.

- Block names are free-form, lowercase, with hyphens for word separation (no underscores), e.g. `dressing`, `fg-dressing`, `room-a-lighting`.
- If a set has both a dressing block and a lighting block, they must not overlap opinions on the same prims unless that overlap is intentional and coordinated.

**Assembly** is a single file that subLayers all blocks for the set. It contains no scene opinions of its own — only subLayers. It is the canonical file downstream shots reference, and its filename is the clean set name with no block token (e.g. `set-landscape.usda`).

Example block + assembly composition:

```
set-landscape_fg-dressing.usda     ← block: foreground dressing
set-landscape_room-a-lighting.usda ← block: room A lighting
        ↓
set-landscape.usda                 ← assembly: subLayers all blocks
```

Assembly ordering determines opinion strength. The artist owning the assembly is responsible for sublayer ordering (earlier listed = stronger). The assembly is always `.usda` — pure composition, kept readable and diffable.

```
#usda 1.0
(
    subLayers = [
        @$SETS/landscape/blocks/room-a-lighting/usd/set-landscape_room-a-lighting.usda@,
        @$SETS/landscape/blocks/fg-dressing/usd/set-landscape_fg-dressing.usda@
    ]
)
```

The set owns everything about the space that is persistent across shots. It is not specific to any shot. All shots that take place in that space reference the assembly file.

### 9.3 Shot pipeline

A shot is built from **blocks** plus one **assembly** file — the assembly here is called the **shot root**. The common shot blocks are `layout`, `anim`, `fx`, and `lighting`, but as with assets and sets the list is not fixed.

```
Set → Layout → Animation → FX → Lighting → Shot Root
```

The layout block starts from the published set rather than placing assets from scratch. Its job is to add what is unique to this specific shot — cameras, character placement, and any shot-specific overrides to the set:

```
set-living-room.usda        ← the shared space (subLayered into the layout block)
        ↓
neon-0010_layout.usda       ← block: camera, character blocking, shot-specific overrides
        ↓
neon-0010_anim.usda         ← block: character motion
        ↓
neon-0010_fx.usda           ← block: effects
        ↓
neon-0010_lighting.usda     ← block: lights and render settings
        ↓
neon-0010.usda              ← shot root (assembly: subLayers the blocks)
```

The layout block subLayers the set rather than referencing it at a prim path. This is correct because the set already defines the full scene graph structure — it establishes `/World/Props/Sofa`, `/World/Environment/Walls`, and so on. Layout adds `/World/Characters/Hero` and `/World/Cameras/Main` on top as new opinions in a stronger layer.

If a shot requires a change to the space — a prop moved for a stunt, a door left open — that override lives in the shot’s layout block. The set file is unchanged. USD’s opinion strength means the layout override wins automatically.

```
# neon-0010_layout.usda — shot-specific override example
over "World" {
    over "Props" {
        over "CoffeeTable" {
            double3 xformOp:translate = (2.0, 0, 0.5)   # moved for stunt
        }
    }
}
```

### 9.4 The shot root

The shot root (`neon-0010.usda`) is the shot's assembly file: a simple file that subLayers all of the shot's blocks. It is created at shot setup by whoever is acting as project lead, and updated when new blocks are added. Like every assembly, it holds no scene opinions of its own and is always `.usda`.

```
#usda 1.0
(
    subLayers = [
        @$SHOTS/neon/0010/blocks/lighting/usd/neon-0010_lighting.usda@,
        @$SHOTS/neon/0010/blocks/fx/usd/neon-0010_fx.usda@,
        @$SHOTS/neon/0010/blocks/anim/usd/neon-0010_anim.usda@,
        @$SHOTS/neon/0010/blocks/layout/usd/neon-0010_layout.usda@
    ]
)
```

The set is not subLayered in the shot root directly — it enters the composition through the layout block, which subLayers it. This keeps the set's contribution in the correct position in the opinion stack.

Note that this order is the **reverse** of the build order in 9.3. Earlier-listed layers are stronger (Section 5.1), so lighting — the last department to touch the shot — sits at the top and its overrides win over everything beneath, while layout sits at the bottom.

This file is not hand-edited for daily work. Daily work belongs in the blocks.

### 9.5 Ownership

Every USD layer has one responsible role at a time.

| Role | Owns | Does NOT own |
| --- | --- | --- |
| Modeling | Geometry, prim hierarchy, VariantSet definitions | Materials, shot data |
| Lookdev | Materials, shading, material bindings on assets | Shot lighting, set surfaces |
| Rigging | Skeleton structure, rig HIP | Geometry, materials |
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

---

## 11. Materials

Lookdev and final render are always Houdini/Karma, so shading is authored in **MaterialX** and rendered by **Karma**. This section covers where material files live, how they are shaded, and how colour is managed across the project.

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

### 11.4 Colour management (OCIO)

Mismatched colour configuration is the most common cause of "looks different on my machine / on the farm / in comp." Set it once for the whole project, pin it, and do not let anyone override it locally.

**One config, one place.** Point the `OCIO` environment variable at a single, version-pinned config in `houdini.env`, alongside `$PROJECT` and friends (Section 18). Everyone then resolves the same config and there is no per-artist drift. Houdini ships a built-in ACES config (an OCIO v2 / ACES 1.3 config in recent builds); for a small all-Karma team that bundled config is a fine default — the important thing is that every artist *and the farm* use the same one. Check which config you are on under **Edit ▸ OCIO Settings** rather than hardcoding a filename, since the bundled config's name changes between Houdini builds.

**Set the working space once.** In Edit ▸ OCIO Settings, set Render Working Space to **ACEScg** and View Transform to **ACES 1.0 - SDR Video**. Out of the box Houdini often defaults to Linear Rec.709 (sRGB) with an un-tone-mapped view — which is *not* ACES — so this is a deliberate, once-per-project decision.

**Texture colour spaces follow the channel tokens.** Houdini and Karma convert textures automatically from the OCIO file rules, and the channel tokens from Section 16.11 line up with those rules exactly: `bc` (base colour) is colour-managed (sRGB texture → working space); `n`, `aormt`, and `m` are **raw/linear data** and must not be colour-managed. The packed `aormt` map in particular must be read raw, or roughness and metalness come out wrong. Naming a texture correctly is therefore also what gets its colour space right.

**Render output stays linear; the look is applied downstream.** Karma writes scene-linear EXRs. Render in ACEScg — set it on the Karma Render Settings LOP (Image Output ▸ AOVs ▸ Output Colorspace) or include the colour space in the output filename, since the default file rule treats an unmarked EXR as Linear Rec.709. Do not bake the display/view transform into the EXR you hand to comp; the view transform — and any filmic tone map under Karma Render Settings ▸ Image Output ▸ Filters — is for review and LDR deliverables, applied on top of the linear render, not burned into it.

---

## 12. Rigging

> ⚠️ **Under development — and the one exception to the rest of this guide.**
> Every other discipline publishes a clean USD layer and hands it off. Rigging does not, because USD has no concept of a live rig: constraints, IK, and controls cannot live in USD at all. So rigs stay in HIP and are shared as HIP files, and only the *baked* skeleton and animation become USD. The conventions in this section are provisional — still being worked out — so treat them as the current best understanding rather than a settled standard, and check with the team before relying on the details.
>

Rigging deserves its own section because it is one of the most commonly misunderstood areas of a USD pipeline. **USD has no concept of a live rig.** Constraints, IK handles, control objects, and muscle systems do not exist in USD. They live in HIP files.

---

## 13. Solaris Essentials

### 13.1 The Layer Break LOP

Without a Layer Break, edits in a LOP network can bleed into the layers you are referencing, modifying data you do not own.

Place a Layer Break immediately after your incoming references and before any edits. All your opinions then live in a new layer above the break.

```
[Reference LOP]      ← brings in upstream data
[Layer Break]        ← your edits live above this line
[Edit/Override LOPs]
[USD ROP]            ← writes only your layer
```

**Node colours confirm this is working.** Houdini assigns each layer a colour — not meaningful in itself, but the colour is consistent across all nodes writing to the same layer. When the colour changes at your Layer Break, that visually confirms your edits are isolated in a separate layer. If everything in your network is one colour and you expected a break, the Layer Break is missing or in the wrong position.

### 13.2 The USD ROP

Key settings:

- **Save Path** — use environment variables, never local absolute paths
- **Output Primitive** — for asset publishing, set this to write only the subtree from a specific prim, not the entire stage
- **Flatten** — leave **OFF** for production publishes. A flattened file loses composition structure and downstream override capability
- **Save Style** — write only your layer, not the full composed stage

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

In Solaris: use the **Set Default Prim LOP** before your USD ROP. Treat a missing default prim as a publish error.

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

What you render is the **shot root** — the fully composed `neon-0010.usda`. Because it pulls in the set, the assets, and every block through composition, the renderer sees the whole assembled scene from that one file.

There are two ways to render the same stage:

- **Interactively, in Houdini.** The lighting block's Karma Render Settings LOP defines the camera, resolution, samples, AOVs, and output paths; a USD Render ROP renders from the GUI. This is where look and settings are dialled in.
- **On the farm, with Husk.** `husk` is the standalone command-line USD renderer that ships with Houdini. It loads a composed USD stage, picks a Hydra render delegate (Karma by default), and renders with no interactive session — exactly what a farm needs. Each node runs the same stage for a different frame range.

A representative invocation:

```
husk --renderer Karma --engine xpu \
     --frame 1001 --frame-count 100 --make-output-path \
     --output "$SHOTS/neon/0010/render/beauty.$F4.exr" \
     $SHOTS/neon/0010/assembly/usd/neon-0010.usda
```

`--frame` is the start frame, `--frame-count` the number of frames, and `--engine` selects Karma CPU or XPU. Flags change between Houdini builds — check `husk --help` for the version you are on.

**Render settings live in the stage, not on the command line.** Camera, resolution, samples, and AOVs are authored as RenderSettings and Render Var prims (from the Karma Render Settings and Render Var LOPs) in the lighting block, so Husk reads them straight from the USD — you do not re-specify them as flags. Husk looks for RenderSettings under `/Render`.

**Karma CPU vs XPU.** XPU is the hybrid CPU+GPU path — faster, shading with the same MaterialX, and a sensible default for look-dev and most shots. CPU is the full reference feature set and the ground truth. The production habit: when an XPU frame looks off, confirm it on CPU before committing a sequence.

**Output.** Karma writes scene-linear ACEScg EXRs (Section 11.4), one per frame, into a per-shot `render/` folder that is **not** committed to SVN (Section 20). The view transform is applied in comp, never baked into the EXR.

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
        over "CrateA" {
            variants = {
                string damageVariant = "damaged"
            }
        }
    }
}
```

This opinion lives only in the overriding block (here, layout). The asset file is unchanged.

---

## 15. Instancing

When the same asset appears many times in a scene — rocks, trees, crowd characters, debris — placing each one as a separate Reference would create a scene graph with thousands of individually composed prims. This is slow to load and slow to render.

USD provides two mechanisms for this: **scene-level instancing** for a moderate number of repeated assets, and **PointInstancer** for very large numbers.

### 15.1 Scene-level instancing

When a prim is marked `instanceable = true`, USD recognises that all prims sharing the same composition structure can share a single composed prototype in memory. The scene graph shows each instance individually, but the underlying data is shared.

In the assembly file, mark the asset as instanceable:

```
def Xform "CharRobot" (
    instanceable = true
    references = @$ASSETS/char-robot/assembly/usd/char-robot.usda@
)
```

**What "individual overrides" can and cannot do.** This is the part that trips people up. Instancing shares one prototype across all instances that have the *same composition*, so what you can override per instance depends on whether the override changes composition:

- **Preserves sharing — fine to vary per instance:** the instance prim's own transform (`xformOp:translate/rotate/scale`) and its visibility. These live on the instance prim, above the shared prototype, so they do not fork the prototype. Scatter a hundred crates at different positions and they still share one prototype.
- **Breaks sharing — forks the prototype:** anything that changes the composition of the instance, most commonly a **different variant selection** or a **different material binding** per instance. Each *unique* combination of variant/material becomes its own prototype. A few distinct looks is fine; a unique variant per instance defeats the point — you are back to one composed prototype per instance, just with extra steps.

So: vary transforms and visibility freely. If instances genuinely need different *variants or materials* and there are many of them, either group them so each distinct look is one shared prototype, or use a PointInstancer (15.2) with the variation baked into the prototypes.

Use scene-level instancing when:
- You have up to a few hundred repeated instances
- Instances vary mainly by transform and visibility (with at most a handful of distinct variant/material looks)
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
| 5–200 repeated props varying mainly by transform/visibility (few distinct looks) | Scene-level instancing |
| Forests, rocks, ground cover, crowds | PointInstancer |
| A handful of manually placed assets | Plain references, no instancing needed |

---

**Part III — Reference**

---

## 16. Naming Conventions

This section is the single reference for how all files, folders, and prims are named in this project. When in doubt about a name, come here first.

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

**Sequences** use 3–5 lowercase letters: `neon`, `trmc`, `elec`

**Shots** use 4-digit numbers, incrementing by 10: `0010`, `0020`, `0030`

Incrementing by 10 leaves room to insert shots later without renumbering.

**Shot context** is a single token: the sequence and shot joined by a hyphen — `neon-0010`, `trmc-0020`. (In the folder tree the sequence and shot are separate directories, `neon/0010/`; in filenames they form one token.)

> Note: Production tracking tools may display sequences as uppercase (NEON, TRMC). Filenames and folders always use lowercase.
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

### 16.5 Published asset USD filenames

An asset is built from blocks plus one assembly file, exactly like a set or a shot.

Block pattern:

```
<asset>_<block>.<ext>
```

Examples:

```
char-robot_model.usdc
char-robot_rig.usda
char-robot_lookdev.usda
```

Assembly file — the clean asset name, no block token:

```
char-robot.usda
prop-crate.usda
env-warehouse.usda
```

The assembly is the file sets and shots reference. It holds no scene opinions of its own — only subLayers of the asset's blocks (see Section 9.1).

**Rules:**
- No artist name in the filename
- No version number in the filename
- The filename is stable — SVN tracks its history
- The assembly file is always `.usda` — it is pure composition and must stay readable and diffable

---

### 16.6 Published set USD filenames

A set is built from blocks plus one assembly file, exactly like an asset or a shot.

Block pattern:

```
set-<name>_<block>.<ext>
```

Examples:

```
set-living-room_dressing.usda        ← prop placement, furniture
set-living-room_lighting.usda        ← practical lights, environment lighting
set-living-room_lookdev.usda         ← location-specific surface overrides
set-living-room_fg-dressing.usda     ← a more specific block, hyphenated name
set-living-room_room-a-lighting.usda ← per-room lighting block
```

Assembly file — the clean set name, no block token:

```
set-living-room.usda                 ← what shot layouts reference
set-warehouse.usda
set-forest-clearing.usda
```

HIP files follow the standard pattern, using the block name in the task position:

```
set-living-room_dressing_ina_v001.hip
set-living-room_lighting_maria_v001.hip
set-living-room_lookdev_maria_v001.hip
```

**Rules:** Block filenames and the assembly file are both stable — no artist name, no version number. SVN tracks history. The assembly file is always `.usda` (pure composition).

---

### 16.7 Published shot USD filenames

A shot is built from blocks plus one assembly file. The shot's assembly file is called the **shot root**.

Block pattern:

```
<sequence>-<shot>_<block>.<ext>
```

Examples:

```
neon-0010_layout.usda
neon-0010_anim.usda
neon-0010_fx.usda
neon-0010_lighting.usda
neon-0010_fx-sparks.usda     ← a second, more specific FX block
```

Shot root (the shot's assembly) — sequence and shot, no block token:

```
<sequence>-<shot>.usda
```

Example:

```
neon-0010.usda
```

**Rules:** Same as asset and set USD — no artist name, no version number, stable filename. The shot root is always `.usda` (pure composition).

---

### 16.8 HIP filenames

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
neon-0010_anim_erik_v001.hip
neon-0010_anim_blocking_erik_v002.hip      ← with descriptor
neon-0010_layout_ina_v001.hip
neon-0010_lighting_maria_v003.hip
neon-0010_assembly_maria_v001.hip          ← the shot root's working HIP
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

### 16.9 Versioning

- Always `v###` — three digits, zero-padded
- Start at `v001`
- Increment meaningfully — not on every minor save, but on any save you might want to return to
- Never: `v1`, `v01`, `final`, `latest`, `v_real_final_2`

---

### 16.10 Good and bad examples

| Bad | Good | Why |
| --- | --- | --- |
| `char_robot_model.usdc` | `char-robot_model.usdc` | Underscore inside a name token — words within a token use hyphens |
| `final_anim_v2.hip` | `neon-0010_anim_erik_v002.hip` | Missing shot context, no artist |
| `robotStuff.usd` | `char-robot_model.usdc` | Unclear asset, unclear task |
| `lighting_new_v5.hip` | `neon-0010_lighting_maria_v005.hip` | Missing shot context, no artist |
| `test_render_latest.usd` | `neon-0010_lighting.usda` | `latest` is not a version |
| `neon-0010_anim__erik_v001.hip` | `neon-0010_anim_erik_v001.hip` | Double underscore means empty token |
| `NEON-0010_layout.usda` | `neon-0010_layout.usda` | Uppercase in filename |
| `char-robot_lookdev_v3_FINAL.usda` | `char-robot_lookdev.usda` | Version and FINAL in published USD |

---

### 16.11 Texture filenames

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
- The channel also fixes the colour space: `bc` is colour-managed, while `n`, `aormt`, and `m` are raw/linear data and must not be colour-managed. This is what OCIO's file rules rely on — see Section 11.4.
- All filenames follow the same general rules as the rest of the guide: lowercase, no spaces, no dates, no version numbers.

---

### 16.12 Regex validation patterns

For tooling and pre-commit checks.

Because `_` is the only token separator and tokens never contain `_`, every filename parses unambiguously: split on `_` and you have the tokens. A published block file is exactly `<name>_<block>` (one underscore); an assembly is `<name>` (no underscore). So the patterns below can validate structure, not just casing — though the authoritative record of which blocks actually exist for a tier is still the assembly's subLayer list (Section 9).

Every token has the same shape: `[a-z0-9]+(?:-[a-z0-9]+)*` — lowercase, words joined by hyphens, no underscores. The patterns simply chain tokens with `_`.

**Published asset/set block** (`<name>_<block>`; `.usda` or `.usdc`)

```
^[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*\.(usd|usda|usdc)$
```

**Published asset/set assembly** (clean name, no underscore; `.usda` only)

```
^[a-z0-9]+(?:-[a-z0-9]+)*\.usda$
```

**Published shot block** (`<sequence>-<shot>_<block>`)

```
^[a-z]{3,5}-[0-9]{4}_[a-z0-9]+(?:-[a-z0-9]+)*\.(usd|usda|usdc)$
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

Assets, sets, and shots all share the same shape: a `blocks/` folder holding one folder per block, and an `assembly/` folder holding both the working HIP and the published assembly's `usd/` (the shot's assembly is its shot root).

- 📁 project_root/
    - 📁 assets/ ← individual reusable assets
        - 📁 char-robot/
            - 📁 blocks/
                - 📁 model/
                    - 📁 hip/
                        - 📄 `char-robot_model_alex_v001.hip`
                    - 📁 usd/
                        - 📄 `char-robot_model.usdc`
                - 📁 rig/
                    - 📁 hip/
                        - 📄 `char-robot_rig_alex_v001.hip` ← shared with animators
                    - 📁 usd/
                        - 📄 `char-robot_rig.usda` ← skeleton structure only
                - 📁 lookdev/
                    - 📁 hip/
                        - 📄 `char-robot_lookdev_maria_v001.hip`
                    - 📁 tex/
                        - 🖼️ `char-robot_bc_4k.exr`
                        - 🖼️ `char-robot_n_2k.exr`
                        - 🖼️ `char-robot_aormt_4k.exr`
                    - 📁 materials/ ← only if using separate material files
                        - 📄 `char-robot_paint.usda`
                        - 📄 `char-robot_metal.usda`
                    - 📁 usd/
                        - 📄 `char-robot_lookdev.usda`
            - 📁 assembly/
                - 📁 hip/
                    - 📄 `char-robot_assembly_alex_v001.hip`
                - 📁 usd/
                    - 📄 `char-robot.usda` ← published assembly, what sets and shots reference
    - 📁 sets/ ← dressed, populated spaces shared across shots
        - 📁 living-room/
            - 📁 blocks/
                - 📁 dressing/
                    - 📁 hip/
                        - 📄 `set-living-room_dressing_ina_v001.hip`
                    - 📁 usd/
                        - 📄 `set-living-room_dressing.usda` ← prop placement, furniture
                - 📁 lighting/
                    - 📁 hip/
                        - 📄 `set-living-room_lighting_maria_v001.hip`
                    - 📁 usd/
                        - 📄 `set-living-room_lighting.usda` ← practicals, env lights
                - 📁 lookdev/
                    - 📁 hip/
                        - 📄 `set-living-room_lookdev_maria_v001.hip`
                    - 📁 tex/
                        - 🖼️ `set-living-room_walls_bc_4k.exr`
                        - 🖼️ `set-living-room_walls_aormt_4k.exr`
                    - 📁 usd/
                        - 📄 `set-living-room_lookdev.usda` ← location-specific surface overrides
                - 📁 fx/ ← optional: persistent effects
                    - 📁 hip/
                        - 📄 `set-living-room_fx_nora_v001.hip`
                    - 📁 usd/
                        - 📄 `set-living-room_fx.usda`
            - 📁 assembly/
                - 📁 hip/
                    - 📄 `set-living-room_assembly_ina_v001.hip`
                - 📁 usd/
                    - 📄 `set-living-room.usda` ← published assembly, what layout references
    - 📁 shots/ ← cameras, animation, lighting — shot-specific only
        - 📁 neon/
            - 📁 0010/
                - 📁 blocks/
                    - 📁 layout/
                        - 📁 hip/
                            - 📄 `neon-0010_layout_ina_v001.hip`
                        - 📁 usd/
                            - 📄 `neon-0010_layout.usda`
                    - 📁 anim/
                        - 📁 hip/
                            - 📄 `neon-0010_anim_erik_v001.hip`
                        - 📁 usd/
                            - 📄 `neon-0010_anim.usda`
                    - 📁 fx/
                        - 📁 hip/
                            - 📄 `neon-0010_fx_nora_v001.hip`
                        - 📁 cache/
                            - 📄 `sim.####.vdb`
                        - 📁 usd/
                            - 📄 `neon-0010_fx.usda`
                    - 📁 lighting/
                        - 📁 hip/
                            - 📄 `neon-0010_lighting_maria_v001.hip`
                        - 📁 usd/
                            - 📄 `neon-0010_lighting.usda`
                - 📁 assembly/
                    - 📁 hip/
                        - 📄 `neon-0010_assembly_maria_v001.hip`
                    - 📁 usd/
                        - 📄 `neon-0010.usda` ← shot root (the shot's assembly)
    - 📁 library/ ← reusable shared assets
        - 📁 materials/
            - 📄 `metal-bare.usda`
            - 📄 `plastic.usda`
        - 📁 lights/
            - 📄 `studio-rig.usda`
    - 📁 houdini/
        - 📁 `otls/`
        - 📁 ocio/
            - 📄 `config.ocio` ← pinned colour config (Section 11.4)
        - 📄 `houdini.env`
    - 📁 docs/
        - 📄 `pipeline-guide.md`

*For texture naming conventions and validation patterns, see Section 16.11.*

---

## 18. Paths and Environment Variables

Never hardcode absolute local paths. A path like `C:/Users/artist/Desktop/...` breaks the moment anyone else opens the file.

All paths use project environment variables:

| Variable | Points to |
| --- | --- |
| `$PROJECT` | Project root |
| `$ASSETS` | `$PROJECT/assets/` |
| `$SETS` | `$PROJECT/sets/` |
| `$SHOTS` | `$PROJECT/shots/` |
| `$LIBRARY` | `$PROJECT/library/` |

Examples in use:

```
$ASSETS/char-robot/assembly/usd/char-robot.usda
$SETS/living-room/assembly/usd/set-living-room.usda
$SHOTS/neon/0010/blocks/anim/usd/neon-0010_anim.usda
$LIBRARY/materials/metal-bare.usda
```

These variables are set in `houdini.env` and configured per-project. A `houdini.env` file for this project might look like this:

```
# houdini.env
# Project: project-robot-short
# Update PROJECT path when moving the project to a new location

PROJECT = /mnt/projects/project-robot-short

ASSETS = $PROJECT/assets
SETS   = $PROJECT/sets
SHOTS  = $PROJECT/shots
LIBRARY = $PROJECT/library

# Add the project's custom OTLs to the Houdini path
HOUDINI_OTLSCAN_PATH = $PROJECT/houdini/otls;&

# Pin the project's colour config so everyone (and the farm) matches — see Section 11.4
OCIO = $PROJECT/houdini/ocio/config.ocio
```

Each artist sets `PROJECT` to wherever the project lives on their machine or network mount. Everything else derives from it, so that is the only path that ever needs changing. The `OCIO` variable pins colour management for the whole project; Section 11.4 covers what it should point at.

If references are broken when you open a HIP, check your environment variables before anything else — open a Houdini shell and run `echo $ASSETS` to verify the variable is resolving correctly.

---

## 19. Publishing

A USD file is not published until all of these are true:

- Exports without errors
- Loads correctly in a **fresh** Houdini session — not the one you authored it in
- Uses environment variables for all paths — no local absolute paths
- Default prim is set (for asset files)
- Follows naming conventions
- Committed to SVN
- Downstream artists notified if this affects their work

A file on disk that is not committed to SVN is not published — it exists only on your machine.

### 19.1 How to verify a publish

1. Write USD via the USD ROP
2. Open a blank Houdini session
3. Use a Sublayer or Reference LOP to load your file
4. Check the scene graph tree — does it look correct?
5. Check the Houdini console for warnings
6. Commit to SVN

### 19.2 Versioned archives

Published USD filenames are stable. If you need versioned snapshots for rollback, use a `versions/` subfolder:

```
$SHOTS/neon/0010/blocks/anim/usd/neon-0010_anim.usda              ← stable, referenced by others
$SHOTS/neon/0010/blocks/anim/usd/versions/neon-0010_anim_v001.usda
$SHOTS/neon/0010/blocks/anim/usd/versions/neon-0010_anim_v002.usda
```

Nothing in the pipeline references the `versions/` folder.

---

## 20. Source Control (SVN)

### 20.1 Commit these

- HIP files
- Published USD files
- Textures and material files
- Small project tools and scripts
- Documentation

### 20.2 Do not commit these

- Render outputs
- Houdini backup files (`.hip.bak`)
- Crash files
- Temporary caches
- Personal scratch files

Heavy simulation caches should be discussed with the team before committing — they may need external storage.

### 20.3 SVN and binary files

`.usdc` files produce meaningless diffs. This is expected — SVN still tracks history correctly. For any layer where readable history is useful, prefer `.usda`.

---

## 21. Debugging Checklist

Work through this in order. Most problems are a file path issue, a prim path issue, a Layer Break issue, or a stale cache.

### File and path

- [ ]  Does the file exist at the referenced path?
- [ ]  Are environment variables set correctly for this project?
- [ ]  Is the path using `$ASSETS` / `$SHOTS` — not a local absolute path?
- [ ]  Does SVN have the latest upstream file?

### Prim paths

- [ ]  Does the prim you are referencing exist in the upstream file? (Check in `usdview`)
- [ ]  Did an upstream artist rename a prim path without communicating it?
- [ ]  Is the default prim set on the asset? (Check the USDA header)
- [ ]  Is the asset placed at the correct instance path? (`/World/Characters/Hero`, not `/CharRobot`)

### Layer and composition

- [ ]  Is your Layer Break placed correctly — after incoming references, before edits?
- [ ]  Are all expected layers in the shot root? (Open `neon-0010.usda` in a text editor)
- [ ]  Is layer order in the shot root correct? (Earlier listed = stronger)
- [ ]  Is a stronger layer overriding your value unexpectedly? (Use the composition arc inspector)

### Solaris-specific

- [ ]  Are your edits going into the correct layer? (Check the Active Layer indicator)
- [ ]  Is your USD ROP writing only your layer — not the full flattened stage?
- [ ]  Did you reload references after an upstream change?
- [ ]  Are you looking at a cached version that has not updated?

### Rigging-specific

- [ ]  Does the skeleton in the published rig USD match what the animation bake expects?
- [ ]  If the rig was updated, was animation re-baked from the new rig?

### Common silent failures

- [ ]  Reference LOP with no default prim and no explicit prim path — produces nothing, no error
- [ ]  Material binding pointing to a prim that was renamed in a model update
- [ ]  FX cache with an absolute path that resolves on your machine but not others

> 👉 Most problems are path problems, prim path problems, or a missing Layer Break. Start there.
>

---

## 22. Core Rules

1. One role owns one USD layer at a time.
2. One task lives in one HIP file.
3. Never edit a layer you do not currently own.
4. Always publish USD before handing off.
5. Never pass a HIP file as a deliverable.
6. Published USD filenames stay stable — they do not version.
7. Always use environment variables for paths.
8. Set a default prim on every published asset USD.
9. Place a Layer Break after incoming references, before edits.
10. Communicate upstream changes to downstream artists — flag prim path changes explicitly.
11. Keep HIP files organised and readable.
12. If unsure who owns a layer, ask before editing.

---

## 23. Mental Models

**USD is like Photoshop layers.**
Each role adds a layer. No one paints on someone else’s layer. The final image is the composite. If you want something changed in a layer you do not own, you talk to the person who does.

**HIP is your working environment. USD is the result you hand to others.**
Your HIP is where you work — iterate, refine, experiment. Your published USD is what others build on. Keep both in good order. A well-organised HIP makes handoffs faster and debugging easier.

**Published paths are contracts.**
When you publish `neon-0010_anim.usda`, that path is a contract with every downstream layer. Renaming or moving the file breaks their work. Honour the contract, or coordinate the change explicitly before making it.

**Prim paths are as important as file paths.**
A reference that finds the right file but the wrong prim is a silent failure. Treat prim path renames as breaking changes.

**Roles are hats, not walls.**
On a small team you may wear many hats. The rules still apply — you apply them to yourself. Once you have published a layer and the next stage has built on it, treat it as handed off.

---

**Part IV — Putting It Together**

---

## 24. Worked Example: Full Production Cycle

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

Builds geometry in SOPs. Establishes prim hierarchy in Solaris. Sets default prim to `CharRobot`.

Publishes:

```
$ASSETS/char-robot/blocks/model/usd/char-robot_model.usdc
```

Commits. Notifies Maria and himself: *“Model published. Prim root `/CharRobot`, geometry under `/CharRobot/Geo`.”*

---

**Alex: Rigging** (parallel with Maria)

References model USD. Builds KineFX rig. Extracts skeleton structure (bind pose only — no animation data).

Publishes:

```
$ASSETS/char-robot/blocks/rig/usd/char-robot_rig.usda
```

Shares rig HIP with Erik: *“Rig HIP at `assets/char-robot/blocks/rig/hip/char-robot_rig_alex_v001.hip`. Skeleton root at `/CharRobot/Rig`.”*

---

**Maria: Lookdev** (parallel with rigging)

SVN updates. References model USD. Builds materials inline in the lookdev file (Option A — small production).

Publishes:

```
$ASSETS/char-robot/blocks/lookdev/usd/char-robot_lookdev.usda
```

Notifies Alex: *“Lookdev done. Ready for assembly.”*

---

**Alex: Assembly**

SVN updates. Creates the assembly HIP. In the Solaris LOP network, Sublayer LOPs bring in the model, rig, and lookdev files. A Set Default Prim LOP sets `CharRobot` as the default prim. A VariantSet LOP sets the production defaults for any VariantSets defined in modeling. The USD ROP writes the assembled file.

The resulting assembly file looks like this:

```
#usda 1.0
(
    defaultPrim = "CharRobot"
    subLayers = [
        @$ASSETS/char-robot/blocks/lookdev/usd/char-robot_lookdev.usda@,
        @$ASSETS/char-robot/blocks/rig/usd/char-robot_rig.usda@,
        @$ASSETS/char-robot/blocks/model/usd/char-robot_model.usdc@
    ]
)
```

This file is generated by the USD ROP — it is never hand-edited.

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
[Layer Break]  ← isolates dressing edits (see Section 13)
[Transform edits — position, rotate, scale each prop]
[USD ROP → set-living-room_dressing.usda]
```

Publishes:

```
$SETS/living-room/blocks/dressing/usd/set-living-room_dressing.usda
```

Notifies Maria: *“Set dressing published. Ready for set lighting.”*

---

**Maria: Set Lighting** (can begin once dressing is published)

SVN updates. References the dressing layer to see the dressed space. Adds practical lights — the floor lamp, ceiling fixtures, any lights that are physically present in the room. These are the lights that are always on regardless of which shot is being filmed here.

LOP network:

```
[Sublayer: set-living-room_dressing.usda]
[Layer Break]  ← isolates lighting edits (see Section 13)
[Sphere Light → /World/Lighting/FloorLampPractical]
[Rect Light → /World/Lighting/CeilingFixture]
[USD ROP → set-living-room_lighting.usda]
```

Publishes:

```
$SETS/living-room/blocks/lighting/usd/set-living-room_lighting.usda
```

---

**Maria: Set Lookdev** (optional — as needed)

If the location needs surface overrides that aren’t part of any individual asset — worn paint on the specific walls of this room, staining on the particular floor — Maria adds those in the set lookdev layer.

Publishes (if needed):

```
$SETS/living-room/blocks/lookdev/usd/set-living-room_lookdev.usda
```

---

**Ina: Set Assembly**

SVN updates. Creates the set root file — a simple HIP with a Sublayer LOP stacking the set’s blocks, and a USD ROP writing the assembled file.

```
#usda 1.0
(
    subLayers = [
        @$SETS/living-room/blocks/lighting/usd/set-living-room_lighting.usda@,
        @$SETS/living-room/blocks/lookdev/usd/set-living-room_lookdev.usda@,
        @$SETS/living-room/blocks/dressing/usd/set-living-room_dressing.usda@
    ]
)
```

Publishes:

```
$SETS/living-room/assembly/usd/set-living-room.usda
```

Notifies Ina (herself, switching to layout role): *“Set published. Shot layout can begin.”*

---

### Phase 3 — Shot production

**Ina: Layout**

SVN updates. Her layout HIP subLayers the assembled set — the room is already dressed and lit with its practical lights. Her job is to add the camera and place the robot character for this specific shot.

LOP network:

```
[Sublayer: set-living-room.usda]
[Reference: char-robot.usda → /World/Characters/Hero]
[Camera LOP → /World/Cameras/Main]
[Layer Break]  ← isolates shot-specific edits (see Section 13)
[Transform edits, shot-specific set overrides if needed]
[USD ROP → neon-0010_layout.usda]
```

Publishes:

```
$SHOTS/neon/0010/blocks/layout/usd/neon-0010_layout.usda
```

Notifies Erik: *“Layout published. Hero at `/World/Characters/Hero`.”*

---

**Erik: Animation**

SVN updates. Opens his animation HIP. This single file does two things: it imports the layout USD for scene context, and it contains the KineFX network sourced from the rig HIP, giving Erik live rig controls to animate with. Once animation is ready, a bake step extracts the joint transforms from the rig and brings them into the Solaris stage via a SOP Import LOP.

LOP network:

```
[Reference: neon-0010_layout.usda → /World]
[Layer Break]  ← isolates Erik's edits from the layout data (see Section 13)
[SOP Import: baked joint transforms → /World/Characters/Hero/Rig]
[USD ROP → neon-0010_anim.usda]
```

Publishes:

```
$SHOTS/neon/0010/blocks/anim/usd/neon-0010_anim.usda
```

Notifies Maria: *“Anim published, neon-0010. Rough pass.”*

---

**Maria: Shot Lighting**

SVN updates. References the animation USD, which carries the full scene chain including the dressed and practically-lit set. The practical lights from the set are already present. Maria’s job is to add the hero lighting — the key, fill, and rim lights that shape this specific shot’s mood and image.

LOP network:

```
[Reference: neon-0010_anim.usda → /World]
[Layer Break]  ← isolates shot lighting edits (see Section 13)
[Sphere Light → /World/Lighting/KeyLight]
[Sphere Light → /World/Lighting/RimLight]
[Karma Render Settings]
[USD ROP → neon-0010_lighting.usda]
```

As the last artist in the shot chain, Maria also creates the shot root:

```
#usda 1.0
(
    subLayers = [
        @$SHOTS/neon/0010/blocks/lighting/usd/neon-0010_lighting.usda@,
        @$SHOTS/neon/0010/blocks/anim/usd/neon-0010_anim.usda@,
        @$SHOTS/neon/0010/blocks/layout/usd/neon-0010_layout.usda@
    ]
)
```

Publishes both:

```
$SHOTS/neon/0010/blocks/lighting/usd/neon-0010_lighting.usda
$SHOTS/neon/0010/assembly/usd/neon-0010.usda
```

---

### When something changes upstream

**If the robot model updates:**

Alex republishes `char-robot_model.usdc`. Assuming prim paths are stable, the change propagates automatically through the assembly to everything downstream. Maria checks her lookdev bindings, Alex verifies the assembly, Ina and Erik reload and verify their layers. Only republish if something is actually broken.

**If the set dressing changes:**

Ina updates `set-living-room_dressing.usda` and republishes. Because `set-living-room.usda` subLayers it by stable path, the assembled set automatically reflects the change. Maria reloads her set lighting HIP to verify the practical lights still read correctly against the new arrangement. All shots that reference the set get the update on next reload — no per-shot work required.

**If a shot needs a set override:**

A prop needs to be moved for a specific shot — the coffee table pushed aside for a stunt. This override lives in the shot’s layout block, not in the set. The set is unchanged. The override looks like this in `neon-0010_layout.usda`:

```
over "World" {
    over "Props" {
        over "CoffeeTable" {
            double3 xformOp:translate = (2.0, 0, 0.5)
        }
    }
}
```

Other shots are unaffected. The coffee table remains in its original set position for every other shot.

The key point: **only republish if your layer’s content has actually changed or broken**. USD’s reference chain propagates updates automatically. Republishing unnecessarily creates noise and forces downstream artists to reload without reason.

---

## 25. Further Reading

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
- [USD Render ROP](https://www.sidefx.com/docs/houdini/nodes/out/usdrender.html) — rendering the stage from inside Houdini.
- [Colour management (OCIO) in Houdini](https://www.sidefx.com/docs/houdini/solaris/ocio.html) — the authoritative version of Section 11.4.

**Shading and colour**

- [MaterialX](https://materialx.org/) — the shading standard used for lookdev (Section 11.3).
- [OpenColorIO](https://opencolorio.org/) — the colour-management system behind the OCIO config (Section 11.4).

---

*End of guide.*
