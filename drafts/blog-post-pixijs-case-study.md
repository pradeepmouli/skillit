---
title: '110 Lines of JSDoc Turned a 47K-Star Library Into a Grade A Agent Skill'
published: false
description: 'How compile-time skill generation from inline code documentation scored 113/120 on skill-judge — with a real PixiJS case study.'
tags: ai, typescript, documentation, webdev
cover_image:
---

Every AI coding agent has the same problem: it doesn't know your library.

It knows React. It knows Express. It was trained on them. But your library? Your API? Your pitfalls? It's guessing. And guessing means hallucinated APIs, deprecated patterns, and subtle bugs that pass code review because the agent was confident.

Agent skills ([SKILL.md files](https://agentskills.io)) solve this. They're structured documentation that agents load on demand — your library's API, decision procedures, and anti-patterns in a format optimized for LLM consumption.

But who writes them? And who keeps them in sync?

## The Problem With Hand-Written Skills

Hand-written skills drift. You refactor a function, rename a parameter, deprecate an API — and the skill is wrong. It's a separate file that nobody remembers to update. The same problem we've had with documentation for decades.

The fix is obvious: **generate skills from the code itself.** If the documentation is inline (JSDoc), it updates atomically when the code changes. An agent edits ONE location and the truth propagates.

## The Experiment

I wanted to test this on a real codebase. Not a toy project — something with hundreds of classes, complex configuration, and actual pitfalls that trip up developers.

[PixiJS](https://github.com/pixijs/pixijs). 47K stars. 205 classes. 119 configuration interfaces. Major v7→v8 migration with breaking changes everywhere.

### Step 1: Install and Generate (0 effort)

```bash
npm install --save-dev typedoc-plugin-to-skills
npm run build:docs
```

The plugin hooks into TypeDoc (which PixiJS already uses) and generates skills alongside the normal API docs. Zero config.

**Result: 224 reference files, organized by module.** Classes split into `classes/scene/sprite.md`, `classes/rendering/webglrenderer.md`, etc. — mirroring the source directory structure. Config interfaces summarized in SKILL.md with details in `references/config.md`. Architecture docs, migration guides, and performance tips extracted from PixiJS's existing `@document` tags.

**Skill-judge score: 84/120 (B-).**

Not bad for zero effort. The generator handled progressive disclosure (lean SKILL.md → detailed references), token budgeting (no file exceeds 8K tokens), config detection (119 `*Options` interfaces), and directory-based splitting automatically.

But the skill was missing something critical: _expert knowledge_. An agent reading it could look up API signatures, but it couldn't answer "when should I use Sprite vs Graphics?" or "what should I never do in v8?"

### Step 2: Add Expert Knowledge (110 lines of JSDoc)

The plugin supports three custom JSDoc tags for expert knowledge:

- `@useWhen` — when should an agent reach for this class?
- `@avoidWhen` — when should it NOT use this?
- `@pitfalls` — what should it NEVER do, and why?

I added these to 7 key classes. Here's what the Sprite annotation looks like:

```typescript
/**
 * @useWhen
 * - Displaying images, texture regions, or sprite sheets
 * - You need fast batched rendering of many images
 *
 * @avoidWhen
 * - Drawing dynamic shapes — use Graphics instead
 * - Rendering text — use Text or BitmapText
 *
 * @pitfalls
 * - NEVER create Sprites from unloaded textures — always Assets.load() first
 * - NEVER use Sprite.from() in hot loops — it creates new textures each call
 */
```

Similar annotations on Application, Container, Graphics, Text, Assets, and AbstractRenderer. Plus a `@packageDocumentation` block with 6 NEVER rules covering v8 migration pitfalls.

Total: **110 lines of JSDoc across 8 files.** About 15 minutes of work for someone who knows the library.

**Skill-judge score: 113/120 (A).**

### The Scores

|                     | Install + Generate | After JSDoc |
| ------------------- | ------------------ | ----------- |
| **Score**           | 84/120 (B-)        | 113/120 (A) |
| **Anti-Patterns**   | 11/15              | 14/15       |
| **Procedures**      | 13/15              | 14/15       |
| **Knowledge Delta** | 14/20              | 19/20       |
| **Usability**       | 8/15               | 12/15       |

The B- baseline is strong because PixiJS already has good docs — architecture overviews, migration guides, performance tips. The generator extracted all of it. The jump to A came from the expert knowledge that only exists in developers' heads: which class to use when, what mistakes cost hours to debug, what v7 patterns silently break in v8.

## What the Generated Skill Looks Like

```
skills/pixi-js/
  SKILL.md (343 lines)
    - When to Use (12 triggers from @useWhen)
    - Avoid When (5 entries from @avoidWhen)
    - Pitfalls (13 NEVER rules from @pitfalls)
    - Configuration (119 interfaces, summary list)
    - Quick Reference (by module)
    - Documentation (architecture, perf tips, migration guides)

  references/
    classes/
      scene/
        index.md          # Class table with descriptions
        container.md      # Full API: 72 properties, 35 methods
        sprite.md         # Deduplicated — inherits from Container
        graphics.md       # v8 chainable API, all drawing methods
        ...29 files
      rendering/
        index.md
        webglrenderer.md
        webgpurenderer.md
        ...80+ files
      text/, assets/, events/, filters/, ...
    architecture.md
    performance-tips.md
    v8-migration-guide.md
    ...224 total reference files
```

An agent loading this skill knows:

- **What PixiJS is** (2D rendering for WebGL/WebGPU/Canvas)
- **When to use each class** (Sprite for images, Graphics for shapes, BitmapText for dynamic text)
- **What to never do** (v7 API in v8, textures from unloaded images, Graphics every frame)
- **How to configure it** (119 options with per-property docs)
- **How to migrate** (v5→v8 guides with old/new code)

All from inline code documentation. No separate files to maintain.

## Why This Matters

The agent skills ecosystem is growing fast. Vercel, Supabase, Stripe, Cloudflare — they all publish skills. But most are hand-written, which means:

1. They drift from the code
2. Someone has to write them
3. Someone has to maintain them

Compile-time generation from inline docs solves all three. The code is the source of truth. The skill is a compiled artifact — like a binary from source code.

The 110-line investment is small because it's additive. You're not writing a skill from scratch — you're annotating code you already maintain. When you refactor Sprite, the annotation moves with it.

## Try It

```bash
npm install --save-dev typedoc-plugin-to-skills
```

Add to `typedoc.json`:

```json
{
  "blockTags": ["@useWhen", "@avoidWhen", "@pitfalls", "@config"]
}
```

Run `pnpm typedoc`. Check `skills/<package>/SKILL.md`.

The audit tells you what's missing. The bundled skill (`to-skills-docs`) teaches your agent what JSDoc to write.

## Where It Doesn't Work (and Workarounds)

**TypeScript only.** The core pipeline runs through TypeDoc, which parses TypeScript. If your library is plain JavaScript with no types, TypeDoc can't extract much. Workaround: add a `tsconfig.json` with `allowJs: true` and `checkJs: true` — TypeDoc will pick up JSDoc annotations from `.js` files.

**CLI tools have a gap.** TypeDoc extracts API docs, not CLI usage. If your library is primarily a CLI (users run commands, not import functions), the generated skill will be thin. There's a separate `@skillit/cli` package that introspects commander/yargs programs, but it requires programmatic setup — it doesn't auto-discover your CLI from `package.json bin`. For now, the workaround is a `## Troubleshooting` section in your README and `@pitfalls` on your options interface.

**Config files aren't code.** If your library's main interface is a config file (like ESLint, Prettier, or Tailwind), the interesting documentation lives in JSON schemas or prose docs, not TypeScript types. The plugin detects typed `*Options`/`*Config` interfaces, but if your config is validated at runtime (e.g., Zod schemas with `.describe()`) rather than typed at compile time, those descriptions won't flow through. Workaround: create a typed interface that mirrors your config schema and tag it with `@config`.

**Huge class hierarchies get repetitive.** PixiJS has 205 classes, many extending Container. Each subclass inherits 72 properties. The generator deduplicates these (showing "Inherits N properties from Parent"), but the inheritance chain resolution depends on TypeDoc having `disableSources: false`. If sources are disabled (as PixiJS does), some heuristics kick in. The output is correct but occasionally verbose.

**The expert knowledge still requires a human.** The generator produces a B- skill from zero effort. Getting to A requires someone who knows the library to write `@useWhen`/`@pitfalls` annotations. An agent can do this (~80K tokens for PixiJS), but it needs domain knowledge context — the migration guides, GitHub issues, Stack Overflow patterns. The bundled skill guides what to write, but not what the pitfalls actually are.

**Monorepos with shared types can over-detect config surfaces.** If you have a monorepo where many packages export `*Options` interfaces (PixiJS has 119), the SKILL.md Configuration section becomes a long list. The generator caps this with a summary pointing to `references/config.md`, but the config reference itself can be large. Workaround: use `@config` explicitly on the interfaces that matter, and the generator will prioritize those over suffix-matched ones. (This is on the roadmap — explicit `@config` should suppress suffix detection.)

**No runtime extraction.** The plugin runs at build time via TypeDoc. It can't observe how your library behaves at runtime — no test output analysis, no error message cataloging, no performance profiling results. Everything it knows comes from static source analysis + JSDoc annotations. If your library's pitfalls are runtime-only (memory leaks, race conditions, performance cliffs), you need to document them explicitly with `@pitfalls`.

## What's Next

The generator handles TypeScript APIs well. The gaps are in CLI-first tools, runtime-validated configs, and cross-cutting documentation that doesn't belong on any single function. There are plugins for [VitePress](https://github.com/pradeepmouli/to-skills/tree/master/packages/vitepress) and [Docusaurus](https://github.com/pradeepmouli/to-skills/tree/master/packages/docusaurus) that extract prose docs from your docs site. An examples scanner links `examples/*.ts` files to the functions they import. And the root file scanner picks up `ARCHITECTURE.md`, `MIGRATION.md`, and `TROUBLESHOOTING.md` automatically.

But the core thesis holds: **code is the source of truth, and the skill should be compiled from it.** Everything else is an escape hatch for what code can't express.

[GitHub](https://github.com/pradeepmouli/to-skills) · [npm](https://www.npmjs.com/package/typedoc-plugin-to-skills) · [PixiJS case study](https://github.com/pradeepmouli/pixijs/tree/dev/skills/pixi-js)
