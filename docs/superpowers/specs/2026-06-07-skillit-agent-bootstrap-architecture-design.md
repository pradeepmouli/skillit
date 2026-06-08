# skillit Agent-Orchestrated Bootstrap Architecture — Design / Spec

- **Status:** Design (brainstorming phase). Design/spec only — no implementation, no implementation plan.
- **Date:** 2026-06-07
- **Branch context:** `develop` (default)
- **Author:** design pass, grounded in the existing `@skillit/*` codebase.

> The decisions in the task brief are FIXED requirements. This document designs _to_ them. Where this spec uses "MUST" / "decided" it is restating a fixed requirement; where it says "proposed" it is a design choice open to review.

---

## 0. One-paragraph thesis

A generated skill MUST be a **pure function of repo source**. skillit owns the OUTPUT (SKILL.md + `references/*.md`); the agent optimizes the INPUTS. The new primary UX is a **slash command** that runs _in the agent's own context_ and orchestrates skillit primitives in a loop: `init` (once, install/wire) → **`gen`** → **audit/judge** → **agent enriches source** → **`gen` again** → **re-audit**, repeating until the rubric is satisfied. The agent NEVER edits or authors a SKILL.md. The inputs the agent enriches are a **set of enrichment surfaces** that skillit _already_ parses — JSDoc on real symbols is ONE of them (the escape hatch for per-symbol when/how/pitfalls/`@see`), but README/markdown sections (`parseReadme`, `parseMarkdownDoc`, `scanDocs`), example files (`scanExamples`, sibling `*.example.ts`), package.json metadata, and MCP `_meta` are equally first-class inputs with their own existing parsers (§4). The agent picks the _right_ surface per finding (prose overview → README / `@packageDocumentation`; per-symbol judgment → JSDoc; project metadata → package.json). Everything is rendered by skillit's _existing_ extract→render pipeline — **no new generator and no new parser is introduced**. This permanently kills stale hand-written skills and improves the real codebase's docs as a side effect.

---

## 1. Problem & motivation

### 1.1 The external-model refine loop is the wrong _grain_ for judgment-heavy / non-introspectable skills

skillit already has an autonomous improvement loop: `refineSkill()` in `packages/core/src/refine/loop.ts`. It runs audit → estimate → select work items → `model.draft()` → `model.review()` → `source.applyFixes()` → re-extract → re-score (loop.ts:39-144). The `ModelClient` is a narrow two-method contract — `draft(req)` / `review(req)` (`refine/types.ts:42-45`) — backed by `api | claude | codex | copilot` (`commands/refine.ts:303`, `model-client-factory.ts`, `model/cli/`).

This design is correct for **narrow, mechanical tag-drafting** but is the wrong grain when the missing content is _judgment_:

1. **The model sees a keyhole, not the codebase.** A `DraftRequest` carries `{ toolName, tag, suggestion, currentValue, skill, guidance }` (`refine/types.ts:11-18`). For a config surface it sees the _type_, not the code that consumes it — which is exactly how the z2f dogfood produced fluent, authoritative, **factually inverted** `@pitfalls`/`@useWhen` ("`include: []` means none" when it means "all"). This is recorded in MEMORY: _"the refine model sees only the config TYPE, not the code that consumes it, so it invents runtime semantics… Fluent+structured+wrong is the worst skill failure and is invisible without source access."_ The partial fix (forbid unverifiable claims) and the `--ground` grounding globs (`ConfigRefineSource.loadGrounding`, config-source.ts:276-315) are workarounds for a model that fundamentally lacks the agent's whole-repo context.

2. **The CLI backends behave like chatty agents, not constrained generators.** The entire `dogfood_refine_claude_backend` memory is a 6-bug cascade: `claude -p` rewrote `CLAUDE.md` mid-draft; copilot `git checkout`'d a branch, wrote a changeset, committed, and **pushed to origin**; sonnet emitted `★ Insight` decoration; conversational preambles leaked into tag values. Every fix isolated the backend harder (`--disallowedTools …`, `--available-tools=`, `<answer>` envelope + `extractDraftAnswer`). The lesson: **we are paying the full cost of an agent (a coding model with tools) while deliberately lobotomizing it into a text-completion endpoint.** When the _caller is already an agent_ (Claude Code), this is backwards — the agent has the repo, the tools, and the judgment; skillit should channel it, not re-summon a weaker one through a CLI.

3. **The loop drives a deterministic proxy, not real quality.** `estimateSkillJudgeScore` (`audit-score.ts:112`) is presence-counting: it credits dimensions for _the existence_ of `@useWhen`/`@never`/`@example` etc., not their correctness. MEMORY: _"estimateSkillJudgeScore is a DETERMINISTIC proxy, not an LLM judge."_ A loop optimizing presence can saturate the rubric with wrong content. An agent that _understands the code_ is the missing judgment layer.

### 1.2 The stale-skill failure mode

Hand-written skills rot. The motivating instance: `lspeasy/skills/lsp-refactor/SKILL.md` documents a `move-file` command and `lspeasy rename <file> <line:col> <newName>` invocations, but `apply.ts` was refactored and `move-file` was removed; the CLI is now _dynamic_ (built at runtime from server capabilities, see §7). The skill has **no provenance** — nothing ties it to a source revision, so nothing detects the drift. There is no regenerate path; the file is authored prose. This is the disease the architecture cures: **if a skill is a pure function of source, it is always regenerable and never silently stale.**

### 1.3 The "pure function of source" thesis

Define the generated skill as `skill = G(source)` where `G` is skillit's deterministic generator (typedoc extraction → `renderSkill`). Then:

- **Determinism / provenance:** re-running `G` on the same source yields content-identical output (the renderer already runs a `canonicalize` pass, renderer.ts:155-157, types.ts:482-492). Staleness becomes _detectable_: regenerate and diff.
- **Single writer:** only `G` writes SKILL.md. The agent writes only `source`. The invariant is structurally enforceable (§8.3).
- **Judgment lives in source.** Where `G`'s auto-extracted content is thin (a bare `.description()`, no `@useWhen`, no Features section), the gap is in `source`, and the fix belongs in `source`. The agent writes the missing prose/judgment onto whichever **enrichment surface** `G` already parses — JSDoc on a symbol, a `## Features` section in the README, a sibling `*.example.ts`, a `keywords` array in package.json (§4) — and `G` renders it. The side effect is better _real_ docs and metadata (TypeDoc/Docusaurus/VitePress/llms.txt all consume the same surfaces).

---

## 2. Architecture & the loop

### 2.1 The agent-orchestrated cycle

```
            ┌─────────────────────────────────────────────────────────┐
            │  AGENT CONTEXT (Claude Code, running the slash command)  │
            │                                                          │
  ┌──────┐  │  ┌────────┐   ┌──────────┐   ┌────────────────┐         │
  │ init │──┼─▶│GENERATE│──▶│AUDIT/JUDGE│─▶│ findings (JSON) │         │
  └──────┘  │  └────────┘   └──────────┘   └───────┬────────┘         │
            │       ▲                              │                   │
            │       │                              ▼                   │
            │       │                     ┌───────────────────┐        │
            │       │   regenerate        │ AGENT ENRICHES     │        │
            │       └─────────────────────│ REPO SOURCE        │        │
            │   (pure function of source) │ (JSDoc / README /  │        │
            │                             │  examples / pkg.json)│       │
            │                             └───────────────────┘        │
            │   converged? ── no ──▲                                    │
            │      │ yes                                                │
            └──────┼────────────────────────────────────────────────────┘
                   ▼
              done (skill committed by user)
```

1. **`skillit init`** (once, at the start) — detect project nature, install the right `@skillit/*` package, wire generation config (today: `detectProjectNature`, `natureToPackage`, install; init.ts:159-289). Repositioned (§5): `init` does **install + wiring ONLY** — it no longer generates or refines. It runs once to set the repo up; the loop never re-inits.
2. **Generate — `skillit gen`** — deterministic `G(source)`: extract → `renderSkill`/`renderSkills` → `writeSkills`. Same machinery as the Docusaurus/VitePress integrations. This is the primitive the loop calls **every pass** (steps 2 and 5); it is NOT `init`.
3. **Audit/judge** — run `auditSkill` + `estimateSkillJudgeScore` and emit the findings as machine-readable JSON for the agent to read.
4. **Agent enriches source** — the agent reads the findings + the `ActionableImprovement[]` _targets_ (file/symbol/kind), and for each finding picks the **enrichment surface** that clears it (§4): JSDoc on a symbol, a README section, a sibling example file, or package.json metadata. It opens the real source/doc/metadata files and writes the missing content. This replaces `model.draft()`/`model.review()` with the agent's own tool use and whole-repo judgment.
5. **Regenerate + re-audit** — re-run steps 2-3. Repeat until convergence (§2.4).

### 2.2 The generate / audit / enrich / regenerate contract

The loop is a contract over three skillit-owned primitives the agent invokes (never reimplements):

| Step          | Primitive (existing)                                                                           | Owner   | Determinism                                |
| ------------- | ---------------------------------------------------------------------------------------------- | ------- | ------------------------------------------ |
| Generate      | `skillit gen` → `renderSkill`/`renderSkills` + `writeSkills` (renderer.ts:57/82, writer.ts:20) | skillit | pure fn of `ExtractedSkill`, canonicalized |
| Audit         | `auditSkill` (audit.ts:971)                                                                    | skillit | pure fn of `(skill, AuditContext)`         |
| Judge/targets | `estimateSkillJudgeScore` (audit-score.ts:112)                                                 | skillit | pure fn of `AuditResult`                   |
| Enrich        | **the agent** (Edit/Write on source)                                                           | agent   | the only non-deterministic step            |

**Hard invariant:** the agent's only write targets are repo **enrichment surfaces** — `*.ts` JSDoc, `README.md` / docs-tree markdown, `package.json` metadata, sibling `*.example.ts` / `examples/*` files, and MCP `_meta`/overlay. The agent MUST NOT create or edit any `SKILL.md` or `references/*.md`. Those are outputs of `G`, regenerated each pass. (The full surface inventory and which parser/IR field/audit code each touches is §4.)

### 2.3 What the agent READS vs. what it EDITS

**Reads — the findings shape (already exists).** The audit emits `AuditResult` (audit-types.ts:76-85): `{ package, summary{fatal,error,warning,alert}, issues: AuditIssue[], passing: AuditPass[] }`. Each `AuditIssue` (audit-types.ts:13-28) carries `{ severity, code, file, line, symbol, message, suggestion }` — already an actionable, located instruction (e.g. F4 → `"Function 'foo' is missing a JSDoc description"` with file `renderer.ts` and symbol `foo`). The judge emits `SkillJudgeEstimate` (audit-score.ts:32-59) with `dimensions` (D1-D8), `grade`, and `improvements: ActionableImprovement[]` (audit-score.ts:13-22), each carrying `{ suggestion, points, dimension, targets: [{file,name,kind}] }`. **These targets are the agent's work queue** — the same data the refine loop turns into `RefineWorkItem`s via `selectWorkItems` (select-targets.ts:21). The agent reads them directly instead.

**Edits — by enrichment surface (each parsed by an existing parser; full detail in §4):**

| Enrichment surface             | What the agent writes                                               | Parser that consumes it                                     | Audit codes it clears            |
| ------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------- |
| Symbol JSDoc summary           | `/** … */` on functions/classes/types/enums/variables               | typedoc extractor                                           | F4                               |
| `@param` / `@returns`          | prose on parameters / non-void returns                              | typedoc extractor                                           | E1, E2                           |
| Interface/type property JSDoc  | `/** … */` on each property                                         | typedoc extractor                                           | E3                               |
| Routing tags                   | `@useWhen` / `@avoidWhen` / `@never` (rendered as pitfalls)         | typedoc extractor                                           | W7, W8, W9                       |
| Depth tags                     | `@remarks` (complex fns), `@category`, `@since`/`@throws`/`@see`    | typedoc extractor                                           | W10, W11, W3                     |
| Module docs                    | `@packageDocumentation` summary + `@remarks`                        | typedoc extractor                                           | W1, W5 (remarks fallback)        |
| Example files                  | sibling `*.example.ts` / `examples/*` files                         | `scanExamples`/`linkExamplesToSkill`; config example reader | E4, W2                           |
| `@example` blocks              | example code on key exports                                         | typedoc extractor (`getTags('@example')`)                   | E4, W2                           |
| README sections                | Features / Troubleshooting / Quick Start, blockquote/intro          | `parseReadme` → `ParsedReadme`                              | F3, W5, W6, A4                   |
| Docs-tree markdown             | guide pages under `docs/` (frontmatter title/description, sections) | `parseMarkdownDoc`/`scanDocs` → `ExtractedDocument`         | (overview depth; no direct code) |
| package.json metadata          | `description`, `keywords` (≥5, ≥3 domain), `repository`             | `auditContext()` / source metadata reader                   | F1, F2, E5, W4, A1               |
| MCP `_meta.toSkills` / overlay | tool routing annotations                                            | MCP source (build JSDoc / runtime overlay)                  | W7-W9 (mcp)                      |

The mapping from audit code → enrichment surface is _already encoded_ in each check's `suggestion` text (audit.ts — note W5/W6 explicitly name BOTH the README section AND the JSDoc-tag fallback, audit.ts:558-611) and in the `improvements` builder (audit-score.ts:352-695). The agent does not need a new vocabulary; it follows the suggestions, choosing the surface the suggestion names, but with the whole-repo context the external model lacked.

**Editing is not the only move — the agent may CREATE new parseable artifacts.** Enrichment is not limited to editing surfaces that already exist. Guided by judge feedback, the agent may _add_ a new artifact when that is the better home for the missing content — e.g. create a `docs/<guide>.md` page (consumed by `scanDocs`/`parseMarkdownDoc` → `skill.documents`), add an `examples/<name>.ts` or sibling `*.example.ts` (consumed by `scanExamples`), introduce a `## Troubleshooting` section a README lacks, or split overflowing prose into a dedicated guide page rather than bloating one symbol's JSDoc. The hard constraint is unchanged: the new artifact must be of a _type an existing parser already consumes_ — **no new parser**, and never a SKILL.md. Which surface to grow vs. which to create is itself a judgment the agent makes from the feedback (a thin overview → enrich `@packageDocumentation`; a feature the rubric says is undocumented and warrants a walkthrough → a new `docs/` guide). The set of enrichment surfaces is fixed (the parsers are); the set of _artifacts_ the agent may produce on those surfaces is open.

### 2.4 Convergence / plateau detection (by the agent)

The existing loop detects plateau numerically (loop.ts:65-80): stop when `estimate.total <= prevTotal && available >= prevAvailable` (score flat AND backlog not shrinking), with a guard so per-option completeness work isn't halted mid-surface. The agent reuses the **same signals**, surfaced from the judge output:

- **Pass:** `estimate.grade ∈ passingGrades`. Decided default for bootstrap: target the **highest grade the source kind can structurally reach**, not a blanket `A`. Per the config-surface finding, _"A is structurally unreachable for a config-only skill"_ (E4 needs `@example` on functions, W3/W11 need function-level tags). So the convergence target is **kind-aware** (§6.4): typedoc/library → A; CLI adapter-model → B (W2/E1/E2 don't apply to a non-enumerated tree); config-only → B.
- **Plateau:** after an enrich pass, regenerate+audit; if `total` did not rise AND no finding's target was actually addressable in source (the agent judges this — it can _see_ that a symbol genuinely has nothing more to say), stop. The agent's judgment here is strictly better than the numeric `available >= prevAvailable` proxy because it can distinguish "stuck re-drafting" from "legitimately complete."
- **Iteration cap:** a hard ceiling (proposed default 5, matching `DEFAULT_MAX_ITERATIONS`, loop.ts:18) so a slash-command run is bounded.

**Convergence report:** the slash command ends by printing the final grade, the dimension breakdown, the list of source files it enriched, and any remaining findings it judged un-addressable (with rationale). This is the human review surface.

### 2.5 The hard invariant, restated

> The agent NEVER writes a SKILL.md or `references/*.md`. It writes only repo source. skillit's generator is the sole writer of skill artifacts.

Enforcement is designed in §8.3 (a pre-write guard / hook + a post-run determinism check that regenerates and diffs).

---

## 3. The slash command

### 3.1 Shape

A Claude Code slash command (skill) that runs in the agent's own context and orchestrates skillit primitives. Proposed name: **`/skillit-bootstrap`** (alias `/skillit`).

```
/skillit-bootstrap [--source cli|mcp|typedoc|config] [--target <pkg-dir>]
                   [--config-type <file#export>] [--program <file#export>]
                   [--out <dir>] [--grade A|B|C] [--max-iterations <n>]
                   [--ground <glob>...]
```

- `--source` / `--target` / `--config-type` / `--program` / `--out` mirror the existing `init`/`refine` flags (refine.ts:284-305, init.ts:165-178) so the orchestrator is a thin pass-through.
- `--grade` overrides the kind-aware default convergence target (§2.4).
- `--ground` is _retained but repurposed_: instead of feeding globs to a blind model, it tells the agent which consumer code to read before writing runtime-behavior pitfalls — directly addressing the z2f "model invented runtime semantics" failure, now solved by the agent actually reading that code.

### 3.2 Where it lives & how it ships

- **Packaging:** a Claude Code **plugin/skill** bundled with `@skillit/client` (a `SKILL.md` + the orchestration prose). It rides the same install path as the existing bundled `skillit-cli-docs` guidance skill that `CliRefineSource.guidance()` already reads (`cli/src/refine-source.ts:111-116`, init.ts:66 references `installTargets`). Precedent for shipping a skill _inside_ a skillit package already exists.
- **Distribution:** published under the `@skillit` scope; discoverable via the agent-skill ecosystem (the repo already authors skills; `skill-judge` and `agent-skill-creator` are in-ecosystem). The slash command is the _new primary UX_; the CLI commands remain for headless/CI (§5).

### 3.3 Thin orchestrator over skillit primitives

The slash command MUST NOT contain skill-generation, audit, or scoring logic. It is procedural glue:

1. Resolve source kind (call `detectProjectNature` / `detectRefineSource`, detect-source.ts:77/93 — or honor `--source`).
2. Run `skillit init --source <kind>` **once** (install + wire only, §5) if the repo isn't set up yet.
3. Run `skillit gen` (the generate primitive, §5.3) to produce the skill from current source.
4. Run the audit/judge primitive and parse its JSON (new thin `skillit audit --json` surface, §5.3, wrapping `auditSkill`+`estimateSkillJudgeScore`).
5. For each finding/target the agent can address: choose the enrichment surface the finding names (§4), open the cited `file` (or the README / example file / package.json), and write the edit on the named `symbol`/section/key.
6. Re-run `skillit gen` + audit. Loop steps 3–6 until convergence (§2.4) or `--max-iterations`.
7. Emit the convergence report.

Everything quality-bearing (what counts as a gap, what the target points to, what the rendered skill looks like) stays in `@skillit/core`. The agent supplies _only_ the enrichment intelligence — the one non-deterministic step.

---

## 4. Enrichment input surfaces (JSDoc is ONE of several)

> **Reframed (per the user's direction): JSDoc is not the only escape hatch.** skillit already ships _several_ parsers, and each turns a different repo artifact into skill INPUT. The agent enriches whichever surface a finding names; `G` reuses the existing parser for it. **No new parser and no new generator is introduced** — the entire point is that skillit _already_ reads all of these.

### 4.0 The surface catalogue

Each surface is: an artifact the agent can edit → an existing parser that consumes it → the `ExtractedSkill`/`AuditContext` field it populates → what it renders into → the audit codes it clears.

| #   | Surface (agent edits)                                                                                                                | Existing parser (file:line)                                                                                                                                                                                                    | IR / audit field populated                                                                            | Renders into                                                          | Clears                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| S1  | **JSDoc on symbols** (`/** */`, `@param`, `@returns`, `@remarks`, `@useWhen`/`@avoidWhen`/`@never`, `@category`, `@see`, `@example`) | typedoc extractor (`getCommentText`/`getTagMap`/`getExamples`, extractor.ts:444-665)                                                                                                                                           | `functions/classes/types[].*`, `useWhen`/`avoidWhen`/`pitfalls`, `remarks`, `examples`                | function/class/type bodies, When-to-use, Never-rules, frontmatter     | F4, E1-E3, W1-W3, W7-W11, E4                 |
| S2  | **`@packageDocumentation`** (module summary + `@remarks`)                                                                            | typedoc extractor (extractor.ts:183-202)                                                                                                                                                                                       | `skill.description`, `skill.remarks`                                                                  | Overview, frontmatter description                                     | W1, W5 (remarks fallback)                    |
| S3  | **README sections** (blockquote/intro, `## Features`, `## Troubleshooting`, `## Quick Start`/`Usage`/`Getting Started`)              | **`parseReadme`** → `ParsedReadme {blockquote, firstParagraph, quickStart, features, troubleshooting}` (readme-parser.ts:63-150; heading aliases :4-18)                                                                        | `AuditContext.readme`; `skill.readmeFeatures`/`readmeTroubleshooting`                                 | Overview, Features, Troubleshooting; frontmatter description fallback | F3, W5, W6, A4                               |
| S4  | **Docs-tree markdown** (guide pages under `docs/`, frontmatter `title`/`description`, `##` sections, code blocks)                    | **`parseMarkdownDoc`** → `ParsedMarkdownDoc {frontmatter,title,description,sections[],codeBlocks,rawContent}` (markdown-parser.ts:227); **`scanDocs`/`scanRootDocs`/`docsToExtractedDocuments`** (docs-scanner.ts:114/161/146) | `skill.documents: ExtractedDocument[]` (title/content/category/description/apiRefs, types.ts:302-315) | `## Documentation` index + `references/docs/` (renderer.ts:1133-1175) | overview depth (D1/D5); no direct fatal code |
| S5  | **Example files** (sibling `*.example.ts`, `examples/*.ts`)                                                                          | **`scanExamples`/`linkExamplesToSkill`** (examples-scanner.ts:183/237 — links example→symbol by imported symbols, falls back to `skill.examples`); config example reader (config-source.ts:115-120)                            | `functions/classes[].examples`, `skill.examples`                                                      | Examples section, function bodies                                     | E4, W2, A3                                   |
| S6  | **package.json metadata** (`description`, `keywords`, `repository`)                                                                  | metadata reader in each source's `auditContext()` (e.g. config-source.ts:219-254)                                                                                                                                              | `AuditContext.{packageDescription,keywords,repository}`; `skill.keywords/repository`                  | frontmatter, links, discovery description                             | F1, F2, E5, W4, A1                           |
| S7  | **MCP `_meta.toSkills` / overlay**                                                                                                   | MCP build source (JSDoc) / runtime overlay (refine.ts:259-272)                                                                                                                                                                 | `ExtractedFunctionMcpMetadata.toSkills` (types.ts:281-293)                                            | When-to-use / Never on MCP tools                                      | W7-W9 (mcp)                                  |

**Output-only (consumes the IR, the agent never edits it):** `renderLlmsTxt` (llms-txt.ts:26) emits `llms.txt`/`llms-full.txt` from `skill.description`/`functions`/`classes`/`types`/`examples` — it is a _downstream consumer_ of the same enriched IR, so every surface the agent improves also improves the llms.txt output for free. Docusaurus (`extractDocusaurusDocs`, docusaurus/src/index.ts) and VitePress (vitepress/src/index.ts:130) likewise _ingest_ a markdown docs tree (S4) and _emit_ skills via the same `renderSkill`/`writeSkills` — confirming the "no new generator" constraint: those integrations already prove markdown parsing → `ExtractedSkill` → `renderSkill` is a supported input path, not just JSDoc.

### 4.0.1 Choosing the right surface per finding

The agent does not write everything as JSDoc. It routes by _content kind_:

- **Prose overview / mental model** → `@packageDocumentation` (S2) for a package, or the README intro/Features (S3) — whichever the finding (W1 vs W5/F3) names. For a docs-heavy repo, a guide page (S4).
- **Per-symbol when/how/pitfalls** → JSDoc routing tags on that symbol (S1). This is the original "escape hatch": judgment that has no home in metadata or a README belongs on the symbol.
- **Project metadata** (discoverability, repo URL) → package.json (S6) — never faked into prose.
- **Worked usage** → an example file (S5) or an `@example` block (S1), per A4's guidance that `@example` produces a leaner SKILL.md than a long README Quick Start (audit.ts:893-952).
- **Troubleshooting / anti-patterns** → README Troubleshooting (S3) OR `@never` tags (S1) — the W6 check credits _either_ (audit.ts:587-611, `hasNever` fallback).
- **Create vs. edit** → the agent may _create_ a new artifact on any of these surfaces when feedback warrants it (a new `docs/` guide via S4, a new example file via S5, a README section that doesn't exist via S3), not only edit what is already there — provided the artifact type is one an existing parser consumes (§2.3, "Editing is not the only move"). The surfaces are fixed; the artifacts are open.

> The audit checks already encode these either/or choices (W5: "README ## Features … or add `@packageDocumentation` `@remarks`"; W6: "README ## Troubleshooting … or add `@never` tags"). The agent reads the suggestion and picks the surface that best fits the _truth it is documenting_, not a fixed default.

### 4.1 Primary surface by content type and project kind (the routing matrix)

This is the deterministic decision the agent consults — _"I need to express X → write it HERE."_ It picks a surface per finding/kind instead of defaulting everything to JSDoc. Surface IDs are from §4.0 (S1-S7).

**Table A — content / rule type → primary surface (+ fallback).** Consistent with the §4.0 catalogue.

| Content / rule type                                        | Primary surface                                                      | Fallback surface                                                       | IR / audit field                                        | Clears                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------- |
| Project / package overview & mental model                  | README intro/blockquote (S3) + `@packageDocumentation` summary (S2)  | `@packageDocumentation` `@remarks` (S2)                                | `skill.description`/`firstParagraph`; `skill.remarks`   | F3, W1, W5             |
| Per-symbol summary                                         | symbol JSDoc `/** */` (S1)                                           | —                                                                      | `functions/classes/types[].description`                 | F4                     |
| When-to-use                                                | `@useWhen` on symbol / `<Command>Options` (S1); config: per-property | (none — judgment only)                                                 | `useWhen[]` / surface/option `useWhen`                  | W7 (D2)                |
| Avoid-when                                                 | `@avoidWhen` on symbol / options (S1); config: per-property          | —                                                                      | `avoidWhen[]`                                           | W8 (D2/D6)             |
| Pitfalls / never-rules                                     | `@never` on symbol / options (S1)                                    | README `## Troubleshooting` prose (S3)                                 | `pitfalls[]`; `AuditContext.readme.troubleshooting`     | W9; W6                 |
| Examples (worked usage)                                    | `@example` per-symbol (S1)                                           | sibling `*.example.ts` (config) / `examples/*` via `scanExamples` (S5) | `functions[].examples` / `skill.examples`               | E4, W2, A3             |
| Params / returns                                           | `@param` / `@returns` (S1)                                           | —                                                                      | `parameters[].description`; `returnsDescription`        | E1, E2                 |
| Interface/type property docs                               | property JSDoc (S1)                                                  | —                                                                      | `types[].properties[].description`                      | E3                     |
| Feature inventory                                          | README `## Features` (S3)                                            | `@packageDocumentation` `@remarks` (S2)                                | `skill.readmeFeatures`; `AuditContext.readme.features`  | W5 (D5)                |
| Long-form guides                                           | docs-tree markdown (S4)                                              | README sections (S3)                                                   | `skill.documents[]`                                     | overview depth (D1/D5) |
| Project metadata / discovery (keywords, description, repo) | package.json (S6)                                                    | —                                                                      | `AuditContext.{keywords,packageDescription,repository}` | F1, F2, E5, W4, A1     |
| Cross-refs & external specs (e.g. the LSP spec)            | `@see` (S1)                                                          | docs-tree link (S4)                                                    | `tags.see`                                              | W3 (D3)                |
| Categorization / grouping                                  | `@category` (S1)                                                     | —                                                                      | `category`                                              | W11 (D5/D7)            |

**Table B — project / source kind → primary surface for the HEADLINE content.** Determines where the _defining_ judgment of the skill lives for each kind.

| Project / source kind                                 | Primary surface for headline content                                                         | Why                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| typedoc / library                                     | symbol JSDoc (S1) — richest, per-export                                                      | every export is introspectable; routing tags + summaries + examples all attach to symbols                     |
| CLI, introspectable (static commander)                | `<Command>Options` JSDoc (S1, surface-level)                                                 | `CliRefineSource` correlates option-interface tags onto the command surface (refine-source.ts:59-109)         |
| CLI, adapter-model (non-introspectable, e.g. lsproxy) | `@packageDocumentation` (S2) + stable-export JSDoc (S1) + README (S3) + `@see` LSP spec (S1) | no static tree to enumerate (§7); judgment lives in the package overview + stable API + outward spec pointers |
| config                                                | per-property JSDoc (S1) + sibling `*.example.ts` (S5)                                        | routing is per-option via `upsertPropertyJsDocTag`; example file clears E4 (config-source.ts)                 |
| MCP build (own TS server)                             | handler JSDoc (S1) + `_meta.toSkills` (S7)                                                   | source is editable; same writeback as typedoc                                                                 |
| MCP runtime (third-party server)                      | overlay JSON (S7)                                                                            | server source not editable; overlay is the only writable surface                                              |

### 4.2 The JSDoc surface (S1/S2): tag → field → render pipeline

Extraction (typedoc): `extractFunction`/`extractClass`/`extractType` read `comment.getTag('@remarks')`, `getTags('@example')`, `@returns`, `@category`, and the routing tags `@useWhen`/`@avoidWhen`/`@never` (extractor.ts:313-360, 631-705). Module docs: `@packageDocumentation` summary → `skill.description`; its `@remarks` → `skill.remarks` (extractor.ts:183-202). Config options carry per-property `@useWhen`/`@avoidWhen`/`@never`/`@remarks` (`extractConfigOption`, extractor.ts:687-720).

Render: `renderWhenToUse` emits `@useWhen`/`@avoidWhen` (renderer.ts:1259-1322); `renderNeverRules` emits `pitfalls` (renderer.ts:1323+); `renderFrontmatter` builds the discovery `description` (renderer.ts:1090, with a `@useWhen`-derived scenario suffix at 1056-1058); function/class/type bodies render summaries, params, returns, examples, remarks (renderer.ts:637-933). The router skill (multi-skill monorepos) aggregates `useWhen`/`avoidWhen`/`pitfalls` into decision tables (renderer.ts:323-501).

The `IR ↔ tag` correspondence the audit scores against:

| JSDoc on source                  | `ExtractedSkill`/IR field              | Rendered into                      | Audit      |
| -------------------------------- | -------------------------------------- | ---------------------------------- | ---------- |
| `/** summary */`                 | `.description`                         | body + frontmatter                 | F4         |
| `@param x — …`                   | `parameters[].description`             | function body                      | E1         |
| `@returns …`                     | `returnsDescription`                   | function body                      | E2         |
| `@remarks …`                     | `remarks`                              | body "Notes"                       | W10, D1    |
| `@example …`                     | `examples[]`                           | Examples section                   | E4, W2     |
| `@useWhen …`                     | `useWhen[]` / surface/option `useWhen` | When-to-use                        | W7, D2     |
| `@avoidWhen …`                   | `avoidWhen[]`                          | When-to-use / anti-rationalization | W8, D2/D6  |
| `@never …`                       | `pitfalls[]`                           | Never-rules                        | W9, D3     |
| `@see …`                         | `tags.see`                             | links / notable-tags               | W3, D3     |
| `@category …`                    | `category`                             | grouping                           | W11, D5/D7 |
| `@packageDocumentation` summary  | `skill.description`                    | overview                           | W1         |
| `@packageDocumentation @remarks` | `skill.remarks`                        | overview (W5 fallback)             | W5         |

> **Naming note (do not "fix"):** the _authoring_ tag for pitfalls is `@never` (what TypeDoc extracts, extractor.ts:690) but it surfaces as `pitfalls` in the IR and as the `RefineTag` `'pitfalls'` (refine/types.ts:9). The agent authors `@never`; the finding says "add `@pitfalls`/`@never`". Both refer to the same thing.

### 4.3 The README / markdown surfaces (S3/S4): section → field → render pipeline

These surfaces require **no JSDoc at all** — they are pure markdown the agent edits, parsed by `parseReadme`/`parseMarkdownDoc`.

- **README (S3).** `parseReadme` (readme-parser.ts:63) is heading-driven: it pulls the **blockquote** (first `> …` after the title) and **firstParagraph** as the description fallback (→ F3), and the named sections **Features** / **Troubleshooting** / **Quick Start** by heading alias (readme-parser.ts:4-18 — e.g. "Key Features"/"Highlights" all map to `features`; "Common Issues"/"FAQ" → `troubleshooting`). The result is `ParsedReadme`, surfaced as `AuditContext.readme` (consumed by F3/W5/W6/A4) and, for the rendered body, `skill.readmeFeatures`/`readmeTroubleshooting`. So the agent clearing W5 by **adding a `## Features` section to README.md** is a fully supported, parser-backed enrichment — not a JSDoc edit. (Precedent: `ConfigRefineSource` already loads this via `parseReadme` in `loadMetadata`, config-source.ts:240.)
- **Docs tree (S4).** For repos with a `docs/` tree, `scanDocs`+`parseMarkdownDoc` turn guide pages into `ExtractedDocument[]` → `skill.documents`, rendered as a `## Documentation` index with category grouping + `references/docs/` (renderer.ts:1133). The agent enriches by **writing/expanding guide markdown** (frontmatter `title`/`description`, `##` sections, `{@link}` API refs that become `apiRefs` for bidirectional linking, types.ts:313). This is exactly what the Docusaurus/VitePress integrations already ingest — the agent-bootstrap loop reuses the same path for any repo with docs.

### 4.4 The example & metadata surfaces (S5/S6)

- **Example files (S5).** `scanExamples` parses `examples/*.ts`, extracts imported symbols, and `linkExamplesToSkill` attaches each fenced example to the function/class it imports (falling back to `skill.examples`), clearing E4/W2 (examples-scanner.ts:183-262). The config path writes a sibling `*.example.ts` **only if absent** (no-clobber, config-source.ts:142-156). The agent enriches by **authoring a real, runnable example file** — strictly better than a synthetic `@example` string because it compiles and is linked to its symbol. A3 (trivial-example) pushes the agent toward import-bearing, multi-line examples (audit.ts:831-888).
- **package.json metadata (S6).** F1/F2/E5/W4/A1 score `description`/`keywords`/`repository`. The agent edits package.json directly; the fix is _metadata_, never prose smuggled into a doc. A1 actively penalizes generic keywords (audit.ts:757-778), so the agent writes _domain-specific_ ones.

### 4.5 typedoc / library source

The richest case — every symbol is introspectable. The agent enriches, in priority order (mirroring `targetsForMissingTag` depth-sorting, audit-score.ts:256-299 — top-level exports first):

- Missing summaries (F4) on exported functions/classes/types/enums/variables.
- `@param`/`@returns` (E1/E2), property JSDoc on `*Options`/`*Config` interfaces (E3).
- Routing tags `@useWhen`/`@avoidWhen`/`@never` on 3-5 key exports (W7/W8/W9) — judgment content: _when to reach for this, when not, the non-obvious footgun_.
- `@remarks` on complex (3+ param) functions (W10); `@category` for grouping (W11); `@example` per key export (W2/E4).
- `@packageDocumentation` summary + `@remarks` in the entry module (W1/W5).

`@see` carries cross-references (to other exports, to external specs). Writeback path for headless mode is `insertJsDocTag` (refine/jsdoc-edit.ts via `TypeDocRefineSource.applyFixes`, typedoc-source.ts:22-38, resolving symbol→file via `resolveSourceFile`); the agent in slash-command mode edits the files directly.

### 4.6 CLI source

CLI routing lives at the **command (surface)** level, not per-symbol: `CliRefineSource` correlates `@useWhen`/`@avoidWhen`/`@never`/`@remarks`/`@example` from the command's `<Command>Options` interface onto the command surface (`extract`, refine-source.ts:59-109; candidates probed as `<Cmd>Options`/`<Cmd>Opts`/`<Cmd>CommandOpts`, refine-source.ts:50-57). The agent enriches the JSDoc on those options interfaces (or, for the adapter model in §7, on the package's stable exported symbols + `@packageDocumentation`). The bundled `skillit-cli-docs` SKILL is the drafting convention reference (`guidance()`, refine-source.ts:111-116) — the agent reads it as its own guidance.

### 4.7 config source

Per-OPTION (not surface-level). `ConfigRefineSource` extracts the config type via `extractConfigSurface` (ast-grep, no `typescript` dep), routes each fix's dot-path `configKey` through `upsertPropertyJsDocTag` (config-source.ts:138-181). The agent writes `@useWhen`/`@avoidWhen`/`@never`/`@remarks` on each property declaration, and an `@example` config file to the sibling `<config>.example.ts` (written **only if absent**, never clobbered; config-source.ts:142-156). **This is the closest precedent to the new model** — `extract source → enrich → regenerate`, with grounding (`--ground`/`loadGrounding`, config-source.ts:276-315) feeding the consumer code so claims are correct. The z2f finding (model inverted `include: []` semantics) is precisely what an agent reading the consumer code fixes; the slash command turns `--ground` from "feed a blind model" into "tell the agent what to read."

### 4.8 MCP source

MCP tools advertise `_meta.toSkills` (`ExtractedFunctionMcpMetadata.toSkills.{useWhen,avoidWhen,pitfalls}`, types.ts:281-293). Two modes (the `feat/refine-build-runtime-bifurcation` work): **build mode** (`TypeScriptMcpRefineSource`) writes JSDoc back into the TS server source (same as typedoc); **runtime mode** (`McpRefineSource`) writes an `.skillit-overlay.json` since the server source may be unavailable (refine.ts:259-272). For the agent-bootstrap model, **build mode is the primary path** (agent owns the source); runtime/overlay remains for third-party servers the agent cannot edit (a legitimate headless case, §5). The escape hatch in build mode is JSDoc on the tool-handler symbols + `_meta.toSkills` annotations.

---

## 5. Repositioning the existing refine loop & model backends

### 5.1 Kept (headless / CI)

The external-model refine loop and `ModelClient` backends are **retained, not deleted**, for contexts where no orchestrating agent is present:

- **CI / unattended pipelines** — a GitHub Action that runs `skillit refine --model-client api` to keep skills fresh on merge, with no human/agent in the loop.
- **Third-party / non-editable sources** — MCP runtime/overlay mode (§4.9) where there is no source to enrich; the model drafts overlay content.
- **The deterministic core stays the backbone.** `refineSkill`, `auditSkill`, `estimateSkillJudgeScore`, `selectWorkItems`, the `RefineSource` implementations, and `applyFixes`/`upsertJsDocTag`/`upsertPropertyJsDocTag` are **all reused unchanged by the agent path** — the agent is simply a _new kind of `ModelClient`-equivalent_ that happens to live in the caller's context and edits source directly instead of returning a string for `applyFixes`.

### 5.2 Conceptual unification: the agent as a `ModelClient`

The cleanest framing: introduce an **`AgentModelClient`** conceptually — not a CLI subprocess, but the _running agent itself_. Where the CLI backends shell out to `claude -p` and fight to constrain them, the agent backend **is** the loop driver. Proposed: keep `ModelClient.draft/review` as the headless contract; the slash command bypasses it entirely and calls `selectWorkItems`/`auditSkill`/`estimateSkillJudgeScore` directly, doing the draft/review/apply itself with full repo access. This is _strictly more capable_ and avoids every CLI-backend bug in `dogfood_refine_claude_backend` (no subprocess, no tool-isolation, no `<answer>` envelope, no chattiness).

### 5.3 How `init` / `refine` CLI commands evolve

- **`skillit init`** — reduced to **install + wiring ONLY**. Today `init` does "generate → refine → regenerate" (init.ts:200-212/270-281); the generate and refine steps are removed from it. `init` runs once to detect the project, install the right `@skillit/*` package, and write generation config — it produces no skill artifacts itself. Rationale: `init` is a one-time, deterministic setup step; (re)generation is a separate, repeatable primitive (`gen`) the loop calls every pass, and the slow non-deterministic enrichment is the agent's job.
- **New `skillit gen` (proposed) — the deterministic generate command.** This is the loop's per-pass primitive: extract → `renderSkill`/`renderSkills` → `writeSkills` (the same `G(source)` the integrations already use). It is idempotent and content-deterministic (canonicalized), takes the same `--source`/`--target`/`--config-type`/`--program`/`--out` selectors, and is what the slash command (and a CI staleness check) re-runs after each enrichment. Generation was previously only reachable _inside_ `init`/`refine`; `gen` surfaces it as a first-class, side-effect-free command. **The loop says `gen`, never `init`.**
- **`skillit refine`** — unchanged for headless (it still bundles its own generate+audit+model loop). Gains a documented note that the _recommended_ interactive path is `/skillit-bootstrap` (which composes `init` + `gen` + `audit` + agent enrichment).
- **New thin `skillit audit --json`** (proposed) — wraps `auditSkill`+`estimateSkillJudgeScore`, emits the `AuditResult`+`SkillJudgeEstimate` (incl. `improvements[].targets`) as JSON to stdout. This is the read-surface the slash command consumes. It is _thin_ — no new logic, just serialization of existing outputs. (An audit formatter already exists, `audit-formatter.ts`; this adds a `--json` mode.)

### 5.4 Deprecated

Nothing is hard-deprecated immediately. **Soft-deprecation (proposed):** the `claude|codex|copilot` CLI backends are downgraded to "headless-only, advanced" in docs, since in an agent context they are redundant (the agent is the model). The `api` backend stays first-class for CI. Revisit removal after the slash command has shipped and the agentic path is proven (§9 rollout).

### 5.5 Migration story

- Existing `skillit init`/`refine` invocations keep working (flags preserved).
- The stale-skill retirement (e.g. `lsp-refactor`, §7) is a one-time manual step: delete the hand-written skill, run `/skillit-bootstrap`, commit the generated output.
- Skills written by the old loop are already regenerable (they are JSDoc-derived); re-running generate produces the canonical output. No data migration needed.
- The `curated` / bundled-guidance preserve logic in `writer.ts` (`shouldPreserveExistingSkill`, writer.ts:31/93) already protects hand-authored skills from being overwritten — relevant because a stale hand-written skill _without_ a `curated` marker will be (correctly) replaced by the generator, while genuinely curated ones are preserved. The retirement of a stale skill means removing it so the generator can own that name.

---

## 6. Generalization — one loop for all source kinds & arbitrary repos

### 6.1 The uniform contract

Every source kind already implements the same `RefineSource` interface (refine/types.ts:47-52):

```
interface RefineSource {
  extract(): Promise<ExtractedSkill>;
  auditContext(skill): AuditContext;
  applyFixes(fixes): Promise<void>;
  guidance?(): string | Promise<string>;
}
```

The agent-bootstrap loop is **source-kind-agnostic** because it only depends on this contract + the shared audit/judge. `extract()` yields the IR; `auditContext()` supplies metadata; `guidance()` supplies the drafting conventions the agent reads; the agent does the enrichment (replacing `applyFixes`'s model-drafted input with its own source edits, though `applyFixes`/`upsertJsDocTag` remain the canonical writeback for headless mode and a useful library the agent _may_ call to keep JSDoc well-formed — avoiding the malformed-merge bugs in MEMORY).

### 6.2 What each source must expose for the agent to enrich it

Surface IDs (S1-S7) and the kind→headline-surface mapping are §4.0/§4.1 (Table B). The kind-specific _primary_ surface plus its writeback helper:

| Source kind          | `extract` reads                           | Kind-specific primary surface(s)                      | Writeback helper         |
| -------------------- | ----------------------------------------- | ----------------------------------------------------- | ------------------------ |
| typedoc              | TypeDoc reflections                       | symbol JSDoc (S1) + `@packageDocumentation` (S2)      | `insertJsDocTag`         |
| cli (introspectable) | commander tree + `<Command>Options` JSDoc | options-interface JSDoc (S1, surface-level)           | `upsertJsDocTag`         |
| cli (adapter-model)  | stable exports + `@packageDocumentation`  | S2 + stable-export JSDoc (S1) + `@see` (S1)           | `upsertJsDocTag`         |
| config               | `extractConfigSurface` (ast-grep)         | per-property JSDoc (S1) + sibling `*.example.ts` (S5) | `upsertPropertyJsDocTag` |
| mcp (build)          | TS server source + `_meta.toSkills`       | handler JSDoc (S1) + `_meta.toSkills` (S7)            | `upsertJsDocTag`         |
| mcp (runtime)        | live server introspection                 | overlay JSON (S7, source not editable)                | overlay writer           |
| **arbitrary repo**   | `detectProjectNature` → one of the above  | whichever the detected kind exposes                   | as above                 |

**Common surfaces apply to EVERY kind**, not just the headline one: README sections (S3), docs-tree markdown (S4), and package.json metadata (S6) are kind-independent — any project has a README and package.json, so F1/F2/F3/E5/W4/W5/W6/A1 are clearable the same way regardless of source kind. The kind only determines where the _headline judgment_ lives (Table B).

For an arbitrary repo, the slash command runs `detectProjectNature` (detect-source.ts:93 — commander/yargs dep or loadable bin → cli; `@modelcontextprotocol/sdk` → mcp; else typedoc) and dispatches to the matching source. **No source-kind-specific logic lives in the slash command** — it is the same generate/audit/enrich/regenerate loop over whichever `RefineSource` the detection selected, with the agent routing each finding to its surface via §4.1.

### 6.3 New affordance needed (proposed): finding → source-location resolution for the agent

The agent needs to reliably open the right file for a target. Today `targetsForMissingTag` returns `{file, name, kind}` where `file` is derived from `sourceModule` (`fileForModule`, audit-score.ts:241) and is sometimes empty for CLI/config targets (audit-score.ts:289/317). **Proposed:** each `RefineSource` exposes a `resolveTargetLocation(target) → {file, declName, propertyPath?}` (typedoc already has `resolveSourceFile`, typedoc-source.ts:8; CLI has `interfaceNameCandidates`+`findInterfaceFile`, refine-source.ts:50/189; config has the dot-path `configKey`). Surfacing this uniformly lets the agent jump straight to the declaration. This is the _only_ genuinely new core affordance the architecture requires; everything else is reuse.

### 6.4 Kind-aware convergence targets

Encode the structural ceiling per kind (per the config-surface "A is unreachable" finding) so the loop targets the right grade:

- **typedoc/library:** A (90%) reachable — has functions for E4/W2, params for E1/E2, properties for E3.
- **CLI adapter-model (§7):** B — the dynamic tree is not enumerated, so per-command E1/E2/W2 don't apply; routing tags + `@packageDocumentation` + README carry it.
- **config-only:** B — no functions/params; per-option routing + one example file is the ceiling.
- **mcp:** depends on whether tools have schemas/examples; default B, A if tool handlers carry full JSDoc.

---

## 7. Worked example — the lsproxy adapter-model CLI skill

### 7.1 The constraint

`@lsproxy/cli` (bin `lsproxy`, lspeasy `apps/cli`) builds its Commander tree at **runtime** from server-advertised capabilities (`buildCommandTree(program, capabilities, session, flags)`, build-commands.ts:67). There is **no static commander program** to introspect — so `CliRefineSource`'s `introspectCommander` path (which reads `.commands`, refine-source.ts:60) cannot enumerate the command tree, and a static-program factory was **explicitly ruled out**. The dynamic tree MUST NEVER be enumerated in the skill.

### 7.2 The decided approach: enrich the stable exported symbols

`apps/cli/src/index.ts` exports a small, stable surface (index.ts:11-15):

- `RefactorSession` (+ `SessionOptions`)
- `applyWorkspaceEdit`, `applyTextEdits`, `planWorkspaceEdit`
- types `WorkspaceEdit`, `LspTextEdit`, `LspRange`, `LspPosition`, `AppliedChange`, `GlobalFlags`
- the `@packageDocumentation` block (index.ts:1-9)

The agent enriches **these symbols** (the adapter model: the skill documents _what the CLI is and when to reach for it_, plus the stable programmatic API, and points at the LSP spec for per-method params — it does NOT document `rename`/`move-symbol`/`move-file` as static commands).

Concretely, the agent writes:

- **`@packageDocumentation @remarks`** in `index.ts`: the mental model — "a refactor CLI that drives ANY LSP server; connects, reads advertised capabilities, builds the command tree at runtime; commands are whatever the server supports." → `skill.description` + `skill.remarks` (W1, W5).
- **`@useWhen`** on the package / `RefactorSession`: "rename/move/move-symbol across a whole project where ripgrep-replace would miss re-exports, aliased imports, type-only imports, and `{@link}` references" (the value prop from the stale skill, now sourced). → W7/D2.
- **`@avoidWhen`**: "read-only queries the built-in LSP tool already covers; single-file edits not worth a server round-trip." → W8.
- **`@never`** on `applyWorkspaceEdit`: "NEVER apply without a `--dry-run` preview first; NEVER assume a server supports an operation — check advertised capabilities." → W9/D3.
- **`@see`**: a pointer to the LSP specification for `textDocument/rename` / `workspace/willRenameFiles` / `refactor.move` request shapes — **this is how per-method params are documented without enumerating the dynamic tree.** → W3.
- **Symbol summaries + `@param`/`@returns`** on `RefactorSession`, `planWorkspaceEdit`, `applyWorkspaceEdit`, `applyTextEdits` (F4/E1/E2), and property JSDoc on `WorkspaceEdit`/`SessionOptions` (E3).
- **`@example`** on `RefactorSession` or `planWorkspaceEdit`: the dry-run-then-apply pattern (E4/W2).

### 7.3 How the dynamic tree is avoided

The skill body says: _"Commands are built at runtime from the connected server's capabilities; run `lsproxy --help` against your server to list them, and consult the LSP protocol spec (see `@see`) for each method's parameters."_ The generator emits no command table because the IR has no statically-known commands — `extract` yields the stable API symbols + the `@packageDocumentation` overview, not an enumerated `configSurfaces` of commands. The agent never invents commands; it documents the _adapter_ and points outward. Convergence target: **B** (§6.4).

### 7.4 Retiring `lsp-refactor`

1. Delete `lspeasy/skills/lsp-refactor/SKILL.md` (stale, no provenance, documents removed `move-file`).
2. Run `/skillit-bootstrap --source cli --target apps/cli` in lspeasy.
3. The loop generates a fresh skill from the enriched `apps/cli` JSDoc, audits, the agent fills gaps, regenerates until grade B.
4. Commit the generated skill (now a pure function of `apps/cli` source — regenerable, never silently stale).

The pre-existing typedoc-generated skills (`lspeasy-core`/`client`/`server`) are unaffected — they already flow through the same `renderSkill` machinery, so the new CLI skill sits alongside them, and a multi-skill monorepo gets the aggregated router skill (renderer.ts:323) for free.

### 7.5 Outline of the generated skill

```
skills/lsproxy-cli/SKILL.md
  frontmatter: name: lsproxy-cli
               description: "<from @packageDocumentation + @useWhen scenario suffix>"
  ## Overview          ← @packageDocumentation summary + @remarks (the adapter mental model)
  ## When to use       ← @useWhen bullets (rename-heavy cross-file refactors)
  ## When NOT to use    ← @avoidWhen bullets (read-only queries; trivial single-file edits)
  ## Never              ← @never rules (always --dry-run first; check capabilities)
  ## Setup / invocation ← install + "commands are dynamic; lsproxy --help; see LSP spec"
  ## Programmatic API   ← RefactorSession, planWorkspaceEdit, applyWorkspaceEdit (loading trigger)
  references/
    functions.md        ← planWorkspaceEdit/applyWorkspaceEdit/applyTextEdits (params/returns/examples)
    classes.md          ← RefactorSession (constructor, methods)
    types.md            ← WorkspaceEdit, SessionOptions, GlobalFlags, …
```

---

## 8. Testing / validation

### 8.1 Loop validation

- **Unit:** the slash-command orchestration is thin; its branch logic (source resolution, convergence decision, iteration cap) is testable with stubbed audit/judge outputs — mirroring the existing `loop.test.ts` which injects a `scoreSkill` seam (loop.ts:15, `ScoreSkill`). Reuse that seam.
- **Convergence:** assert the loop stops on `passed` at the kind-aware target grade, on `plateau` when no target is source-addressable, and at `max-iterations` — the four `RefineStopReason`s (refine/types.ts:60) plus the new agent-judged plateau.

### 8.2 Generated-skill quality

- **Rubric scores:** after a bootstrap run, assert `estimateSkillJudgeScore(audit, skill).grade` ≥ the kind-aware target. Reuse `auditSkill`+`estimateSkillJudgeScore` directly (audit.ts:971, audit-score.ts:112).
- **Impl-grounded review (the z2f lesson):** the deterministic estimate and an LLM-judge read can both pass while content is _factually wrong_ (MEMORY: "fluent+structured+wrong is invisible without source access"). Mitigation is structural here — the _agent that wrote the JSDoc has read the source_ — but validation MUST still include a spot-check that routing-tag claims match runtime behavior (e.g. for lsproxy, that `@never` rules reflect `apply.ts` semantics, not stale `move-file`). This is the third eval tier ("impl-grounded reviewer") from the config-surface memory.

### 8.3 Regeneration determinism & no-hand-edit enforcement (the invariant)

- **Determinism test:** generate, then generate again on unchanged source; assert byte-identical output (the renderer's `canonicalize` pass guarantees this, renderer.ts:155-157). A bootstrap run that changes source MUST be followed by a clean regenerate with no further diff.
- **No-hand-edit guard (proposed):** a pre-write hook (hookify-style) that **blocks any agent Edit/Write whose path matches `**/SKILL.md`or`**/references/\*.md`** during a bootstrap run. This makes the hard invariant (§2.5) mechanically unbreakable, not merely a convention.
- **Provenance / staleness check:** since `skill = G(source)`, a CI job regenerates and fails on diff — catching the `lsp-refactor` failure mode permanently. (The `AdapterFingerprint`/`generatedBy` machinery, types.ts:181-198, already records adapter provenance for CLI-proxy skills; extend the staleness check to all kinds.)

---

## 9. Risks, open questions, phased rollout

### 9.1 Risks

- **R1 — Agent authors plausible-but-wrong judgment content.** The headline z2f risk. _Mitigation:_ the agent reads the consumer code (`--ground` repurposed), and §8.2 mandates an impl-grounded spot-check. Strictly better than the blind model, but not zero-risk.
- **R2 — Convergence thrash / non-termination.** _Mitigation:_ hard `--max-iterations` cap + agent-judged plateau (§2.4).
- **R3 — Malformed JSDoc from direct agent edits.** The `upsertJsDocTag` merge bugs (MEMORY Bug C) show hand-merging JSDoc is error-prone. _Mitigation:_ the agent SHOULD use `upsertJsDocTag`/`upsertPropertyJsDocTag` (exported from `@skillit/core`, refine/index.ts) as the writeback helper rather than free-hand splicing, inheriting the escape/normalize fixes (`escapeJsDocClose`, multi-line prefixing).
- **R4 — Invariant leak.** An agent edits a SKILL.md anyway. _Mitigation:_ §8.3 pre-write guard.
- **R5 — Bifurcated UX confusion** (slash command vs. `refine` CLI). _Mitigation:_ clear docs (§5.3) positioning slash command as primary, CLI as headless.

### 9.2 Open questions

- **Q1 — `skillit audit --json` shape:** exact JSON schema for findings the agent consumes — does it include `resolveTargetLocation` output (§6.3) inline, or does the agent call a separate resolver?
- **Q2 — `ModelClient` retention:** keep `draft/review` as the headless contract indefinitely, or collapse to `api`-only after the agent path proves out (§5.4)?
- **Q3 — Grade target governance:** are kind-aware ceilings (§6.4) hard-coded in core, or configurable per repo?
- **Q4 — Monorepo multi-package bootstrap:** does one slash-command run handle N packages (looping the router-skill set), or one package per invocation?
- **Q5 — Where does the no-hand-edit guard live** — bundled hookify rule, a `@skillit/client` runtime check, or both?

### 9.3 Phased rollout (proposed)

1. **Phase 0 — core affordances (deterministic, no agent):** new `skillit gen` command (extract→render→write surfaced from inside `init`/`refine`); reduce `skillit init` to install/wire only; `skillit audit --json`; `resolveTargetLocation` on each `RefineSource`. All testable without an agent.
2. **Phase 1 — slash command MVP (typedoc + cli):** ship `/skillit-bootstrap` for the two best-introspected kinds; dogfood on `@skillit/*` itself and on lsproxy (§7).
3. **Phase 2 — config + mcp(build):** extend to the per-option and MCP-build surfaces (the config path is already proven; mcp-build reuses typedoc writeback).
4. **Phase 3 — guard + determinism CI:** land the no-hand-edit pre-write guard and the regenerate-and-diff staleness gate, making the invariant mechanical.
5. **Phase 4 — reposition headless:** soft-deprecate the `claude|codex|copilot` CLI backends in docs; keep `api`/overlay for CI/third-party.

---

## Appendix A — Key file references

- Loop: `packages/core/src/refine/loop.ts` (`refineSkill` :39, plateau :65-80, `ScoreSkill` seam :15).
- Refine contract: `packages/core/src/refine/types.ts` (`RefineSource` :47, `ModelClient` :42, `RefineTag` :9, `RefineStopReason` :60).
- Targets: `packages/core/src/refine/select-targets.ts` (`selectWorkItems` :21, `parseTag` :7).
- Writeback: `packages/core/src/refine/ast-edit.ts` (`upsertJsDocTag` :108, `upsertPropertyJsDocTag` :129, `stripRefineTags` :241).
- Sources: `config-source.ts` (per-option + grounding), `packages/cli/src/refine-source.ts` (CLI surface), `packages/typedoc/src/refine/typedoc-source.ts`, `packages/mcp/src/refine/{build,runtime}/`.
- Audit: `packages/core/src/audit.ts` (`auditSkill` :971, F1-A4 checks, `hasRoutingTag` :620).
- Judge: `packages/core/src/audit-score.ts` (`estimateSkillJudgeScore` :112, D1-D8 :116-168, `ActionableImprovement` :13, target builders :256-333).
- Render: `packages/core/src/renderer.ts` (`renderSkills` :57, `renderSkill` :82, router :323, when-to-use :1259, never :1323, frontmatter :1090, canonicalize :155).
- Write/preserve: `packages/core/src/writer.ts` (`writeSkills` :20, `shouldPreserveExistingSkill` :31/93, `curated`).
- Extraction tags: `packages/typedoc/src/extractor.ts` (`@packageDocumentation` :183-202, tag map :631, `@remarks`/`@category` :646-665, config-option routing :687-720).
- README/markdown parsers (enrichment surfaces S3/S4): `packages/core/src/readme-parser.ts` (`parseReadme` :63, heading aliases :4-18), `markdown-parser.ts` (`parseMarkdownDoc` :227), `markdown-types.ts` (`ParsedSection`/`ParsedMarkdownDoc`), `docs-scanner.ts` (`scanDocs` :114, `scanRootDocs` :161, `docsToExtractedDocuments` :146).
- Example parser (S5): `packages/core/src/examples-scanner.ts` (`scanExamples` :183, `linkExamplesToSkill` :237); config example reader: `config-source.ts:115-156`.
- Docs render: `renderer.ts` (`renderDocumentation` :1133). Docs IR: `types.ts` (`ExtractedDocument` :302-315).
- llms.txt (output-only consumer of the IR): `packages/core/src/llms-txt.ts` (`renderLlmsTxt` :26).
- Parser exports (all already public from `@skillit/core`): `index.ts` (`renderLlmsTxt` :60, `parseReadme` :72, `parseMarkdownDoc` :93, `scanDocs`/`docsToExtractedDocuments`/`scanRootDocs` :95, `scanExamples`/`linkExamplesToSkill` :97).
- CLI commands: `packages/client/src/commands/{init,refine}.ts`, `detect-source.ts` (`detectProjectNature` :93, `detectRefineSource` :77).
- Integrations (render reuse): `packages/vitepress/src/index.ts` (`renderSkill`/`writeSkills` :3/130), `packages/docusaurus/src/index.ts`.
- Motivating instance: `lspeasy/apps/cli/src/index.ts` (stable exports), `build-commands.ts` (`buildCommandTree` :67), `apply.ts` (removed `move-file`), `skills/lsp-refactor/SKILL.md` (stale).

## Appendix B — Established conventions honored (from MEMORY)

- `estimateSkillJudgeScore` is a deterministic presence-proxy, not an LLM judge — the agent supplies the missing judgment layer.
- "A is structurally unreachable for a config-only skill" → kind-aware convergence targets (§6.4).
- z2f finding: a blind model invents runtime semantics from the type alone → the agent reads consumer code; `--ground` repurposed (§4.8, R1).
- CLI model backends behave like chatty agents and wander with tools → in agent context the subprocess backend is redundant; the agent IS the model (§5.2).
- `upsertJsDocTag` merge fixes (escape `*/`, multi-line prefixing) → agent SHOULD reuse the helper, not free-hand splice (R3).
- TypeDoc router alignment ADR: reference files follow TypeDoc's module hierarchy → the generator (not the agent) owns reference-file layout.
