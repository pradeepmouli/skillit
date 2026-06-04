# MCP-as-Skills Benchmark — Design

- **Date:** 2026-05-21
- **Status:** Approved (design); ready for implementation planning
- **Owner:** Pradeep Mouli
- **Feeds into:** `writing-plans` (implementation plan)

## Summary

Measure, defensibly and publicly, where converting an MCP server's tool surface
into a progressive-disclosure Agent Skill (via `@skillit/mcp`) beats consuming
the server as raw MCP — and where it does not. The study spans five hypotheses
(H1–H5) covering token economics, latency, tool-selection accuracy, cross-harness
portability, and multi-session cost.

A prerequisite product feature — an **autonomous refine eval loop** (`to-skills
refine`) — is built first (Phase 0), because the benchmark's strongest experimental
condition (autonomously-refined skills) cannot exist without it. The refine loop is
the automation of a workflow the project already documents and performs manually.

## Goals

1. Produce a defensible, reproducible benchmark with results committed as data
   (append-only JSONL), so charts are derived, never hand-computed.
2. Convert the existing manual audit→fix→re-score workflow into an autonomous,
   model-driven loop usable on both TypeScript-source skills and MCP skills.
3. Publish a technical writeup + blog post that **concedes the narrow case where
   raw MCP wins**, so the wins are credible.

## Non-Goals

- Benchmarking against newer server versions over time (pinned versions only; a
  re-run in 6 months is a separate study).
- Frontier-model tool-selection accuracy (saturates; no signal — see H3).
- OpenCode / Cursor harness coverage in this pass (deferred — see H4).
- Auto-generating the ground-truth corpus end-to-end without a human anchor.

---

## Architecture: two deliverables, two repos

### ① Phase 0 — `refine` eval loop (lands in the `to-skills` monorepo)

This is **product work**, not benchmark-only code. It is the prerequisite that
produces benchmark condition D.

What already exists (do not reinvent):

- **The gate** — `estimateSkillJudgeScore()` in `packages/core/src/audit-score.ts`
  maps ~20 deterministic audit checks onto 8 skill-judge dimensions (D1–D8, /120)
  and emits `ActionableImprovement[]` with concrete `targets` (file → export →
  tag → point value).
- **The loop, manual** — `documentation-audit.md` documents the "Recommended
  Workflow" (run → fix fatals → fix errors → re-run → verify) and states the audit
  _suggests but does not modify files_ — a human + the `to-skills-docs` skill close
  the loop by hand today.

What Phase 0 adds (narrow):

1. **Autonomous loop driver** in `@skillit/core`, alongside the scorer:

   ```
   extract → audit → estimateSkillJudgeScore
     while not passing (grade A) and iterations < cap:
       Sonnet drafts a fix for each flagged target
       Opus reviews the draft (critique, accept/revise)
       Sonnet refines per the review
       re-extract → re-audit → re-score
   ```

   The optimization target is the **deterministic** skill-judge estimate, never
   tool-selection accuracy. This is the same loop core to-skills already performs
   manually.

2. **Single CLI entry point** — `to-skills refine` (in `@skillit/cli`) detects the
   source and dispatches to the correct write-adapter:

   ```
   @skillit/core   loop driver + estimateSkillJudgeScore (the engine)
   @skillit/cli    `to-skills refine` — single front door, dispatches by source
      ├─ MCP adapter (from @skillit/mcp) → writes _meta.toSkills sidecar overlay
      └─ TypeDoc adapter                   → writes JSDoc tags on source exports
   ```

   - **MCP adapter:** servers are external and cannot take JSDoc edits, so fixes
     land in a tool-keyed `_meta.toSkills` **sidecar overlay**, merged at extraction
     time via the existing projection path (`packages/mcp/src/extract.ts:448`).
   - **TypeDoc adapter:** writes `@useWhen` / `@avoidWhen` / `@pitfalls` etc. onto the
     flagged source exports.
   - `@skillit/mcp` remains usable programmatically; the CLI is the canonical entry.

**Phase 0 critical path** for the benchmark requires only the MCP adapter; the
TypeDoc adapter rides along on the shared core driver as a fast-follow.

### ② `to-skills-bench` (separate repo)

Standalone repo, pnpm workspaces, mirroring the `to-skills` layout so contributors
don't context-switch. Pins `@skillit/mcp` (and the Phase-0 refine capability) as
a normal versioned dependency. Heavy/Python/LLM-SDK deps and pinned MCP servers stay
out of the published library monorepo.

```
to-skills-bench/
├── packages/
│   ├── harness/   # runner, instrumentation, result schema
│   ├── tasks/     # task corpus + ground truth
│   ├── servers/   # pinned MCP servers under test (exact versions)
│   └── report/    # chart generation, markdown output
├── results/       # JSONL results, committed for diffing
└── docs/          # writeup, charts
```

The permanent technical writeup lands in `to-skills/docs/benchmarks/`; the blog post
is separate.

---

## The four conditions

All four are **tool-generated**. No human authors annotations in any condition.

| Condition        | Produced by                                                                                 | Delta measures                           |
| ---------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **A. Raw MCP**   | `JSON.stringify(tools/list)`                                                                | status quo baseline                      |
| **B. Auto**      | `@skillit/mcp` extract — schema only, no doc-mining, no overlay                             | token savings of structure alone         |
| **C. Doc-mined** | extract + doc-scanner mining the server's README/docs (deterministic, one-shot)             | **B→C = free value of existing docs**    |
| **D. Eval-loop** | extract + Phase-0 `refine` loop → `_meta.toSkills` overlay, iterated to grade-A skill-judge | **C→D = value of autonomous refinement** |

`A→D` is the full headline: the tool's best autonomous output vs raw MCP.

---

## Models and roles (the circularity guard)

| Role                    | Model                 | Does                                                                                                      |
| ----------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| **Author / reviewer**   | Opus                  | Drives the refine loop review step; derives ground-truth corpus from official docs. **Never under test.** |
| **Drafter** (in loop)   | Sonnet 4.6            | Drafts/refines overlay annotations inside the refine loop                                                 |
| **Consumer under test** | Haiku 4.5, Sonnet 4.6 | Select tools in H3. **Never author the corpus.**                                                          |

Circularity is handled three ways:

1. **The loop optimizes a deterministic rubric** (skill-judge estimate), not the
   benchmark's own tool-selection metric — so condition D's artifact cannot be tuned
   to make models pick tools well.
2. **Author ≠ frontier consumer.** Opus authors ground truth and reviews; the
   consumers under test are weaker models.
3. **Sonnet's dual role is measured, not argued.** Sonnet both drafts (in the loop)
   and is tested as a consumer; Haiku 4.5 is a pure consumer (never authors). If
   Haiku's B→C→D deltas track Sonnet's, self-affinity is not driving the result —
   reported as an explicit robustness chart.

---

## Result schema (write first, before any measurement)

Every measurement appends one JSON line to `results/<hypothesis>.jsonl`. Charts read
these files; nothing is computed in chart code.

```typescript
type BenchResult = {
  hypothesis: 'H1' | 'H2' | 'H3' | 'H4' | 'H5';
  server: string;
  serverVersion: string;
  condition: 'raw_mcp' | 'auto_skill' | 'doc_mined_skill' | 'eval_loop_skill';
  model?: string; // consumer model for H3
  task?: string; // task id for H3
  metric: string;
  value: number;
  unit: 'tokens' | 'ms' | 'accuracy' | 'boolean';
  tokenizer?: 'anthropic_count_tokens' | 'tiktoken_cl100k_base'; // H1
  timestamp: string;
  envInfo: { node: string; os: string; cpu: string };
};
```

---

## Servers under test

Five servers covering the N-tools range and category mix. **Hard selection
criterion:** each must ship real documentation, or condition C (doc-mined) collapses
into B and there is no delta to measure.

| Server                                    | ~Tools  | Category          | Why                                                     |
| ----------------------------------------- | ------- | ----------------- | ------------------------------------------------------- |
| `@modelcontextprotocol/server-filesystem` | ~10     | Reference, small  | baseline                                                |
| `@modelcontextprotocol/server-github`     | ~25     | Reference, medium | natural namespacing (issues/pulls/repos)                |
| Third-party TS server (e.g. Sentry-class) | ~15     | Non-Anthropic TS  | validates non-reference surface                         |
| FastMCP Python server                     | ~20     | Python            | required by SC-008; exercises `@skillit/target-fastmcp` |
| Large server                              | ~80–100 | Stress            | validates H1 at the top of the N curve                  |

Exact versions pinned in `packages/servers/package.json`. **Open item:** identify the
concrete ~80–100-tool server and the third-party TS server during scaffolding.

---

## Hypotheses

### H1 — Context arithmetic (no LLM)

For each server: `raw_tokens = tokenize(tools/list JSON)`,
`skill_eager = tokenize(SKILL.md)`, `skill_lazy_per_tool = tokenize(tool's section
of references/tools.md)`. Per task, `skill_total = skill_eager + Σ lazy(t for t in
tools_used)`; `savings = (raw − skill_total) / raw`.

- **Tokenizer:** Anthropic `count_tokens` endpoint is authoritative; `tiktoken`
  `cl100k_base` is the offline fallback for fast iteration. The `tokenizer` field
  records which produced each row.
- **Output:** N-vs-tokens chart (two lines: raw MCP, skill+lazy-load) + % savings
  table per (server, task-tool-count).
- **Watch:** if `references/tools.md` token-budget-splits eagerly at large N, the
  per-tool lazy-load assumption breaks. Measure actual split sizes; report the
  fraction of tools served by a single lazy load.

### H2 — Cold-start latency

Raw MCP cold start = spawn/connect → `initialize` → `tools/list` (drain pagination).
Skill cold start = read `SKILL.md` + parse frontmatter. 10 runs each; report median
and p95. Three environments: developer laptop, CI machine, cold Lambda. Report stdio
and HTTP transports separately.

### H3 — Tool-selection accuracy (the hard one)

Frozen prompt across all conditions:

```
Available tools: <context>
Task: <task>
Output JSON: { "tools": ["tool_name", ...], "reasoning": "..." }
```

- **Corpus:** 75–100 tasks, 15–20 per server, three difficulty bands — Obvious (5),
  Disambiguation (10), Adversarial (5).
- **Ground truth:** Opus derives correct tool sets from each server's **official
  documentation**; a human spot-checks a random ~20% sample plus every task an
  adversarial-check pass disagrees on. Task descriptions are phrased as user intent,
  not copied from annotation prose, to keep ground truth independent of conditions.
- **Conditions:** A–D. **Consumers:** Haiku 4.5, Sonnet 4.6. **Trials:** 5 per
  (task, condition, model), temperature 0.3.
- **Volume:** 75 × 4 × 2 × 5 = **3,000 calls.** Budget ~$200–400.
- **Scoring:** exact match = 1.0; superset (ground truth + extras) = 0.5; subset
  (missing ground-truth tools) = 0.0; wrong = 0.0.
- **Reports:** (1) mean accuracy per (condition, model, difficulty); (2) B→C delta
  per band (the doc-mining ROI chart); (3) C→D gap (autonomous-refinement value);
  (4) Haiku-vs-Sonnet delta comparison (the circularity robustness check).
- **Pilot gate:** run 10 tasks on one server, one model first. If the B→C (or C→D)
  delta on adversarial tasks is < 5%, stop and fix the doc-mining / refine loop
  before authoring the full corpus.

### H4 — Cross-harness portability

Manual pass/fail matrix, **Claude Code + Codex only** this pass.

| Harness     | Server as MCP | Skill consumed | Both from same install |
| ----------- | ------------- | -------------- | ---------------------- |
| Claude Code | ✓/✗           | ✓/✗            | ✓/✗                    |
| Codex       | ✓/✗           | ✓/✗            | ✓/✗                    |

Each cell backed by a 5-line repro script in `tests/harness-compat/`. OpenCode and
Cursor deferred (community-contributable later). If a harness fails to consume
skill-embedded MCP frontmatter as assumed, that failure is itself a headline finding.

### H5 — Multi-session economy

Simulate a developer using a server across five sessions in a work week.
`raw_mcp_total = 5 × full_tools_list_tokens`. `skill_total = 5 × skill_eager +
unique-tools-touched lazy loads`, computed under **both** assumptions: harness caches
references between sessions, and harness does not. Document the assumption per chart.

---

## Cost and gating

- H1, H2, H5: zero LLM spend (pure measurement / simulation).
- Phase 0 refine loop: Sonnet + Opus calls, bounded by iteration cap per skill.
- H3: ~3,000 consumer calls (~$200–400) **gated behind the pilot**.

---

## Publishing

Two artifacts:

1. **Technical writeup** — `to-skills/docs/benchmarks/`: methodology, raw numbers,
   every chart, every failure mode. Permanent reference.
2. **Blog post** — one chart per hypothesis; the H1 and H5 charts are the shareable
   ones.

Both must explicitly concede the **narrow case where raw MCP wins**: servers whose
tool surface mutates per-session (per-tenant exposure, feature-flagged tools,
runtime-loaded plugins) **and** clients that both subscribe to `listChanged`
notifications **and** can authoritatively select the right newly-appeared tool
without further guidance. Both conditions must hold. For static surfaces — the
overwhelming majority — skills are strictly better at capability discovery because
annotations close the gap between "here's a JSON schema" and "here's when to use
this." The credibility of the wins depends on conceding this loss precisely.

---

## Testing strategy

- **Phase 0 loop:** unit-test the driver against fixtures (audit result + skill →
  expected target list); the LLM draft/review steps are integration-tested behind a
  recorded-fixture mode so CI is deterministic. Re-score convergence is asserted on a
  golden low-score input.
- **Harness:** result-schema validation on every appended row; H1/H2/H5 computations
  are deterministic given fixtures and unit-tested.
- **Charts:** read JSONL only; verified to compute nothing themselves.

---

## Risks / failure modes

| Risk                                             | Plan                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| H3 flat across conditions                        | Pilot 10 tasks first; if B→C/C→D adversarial delta < 5%, fix doc-mining / refine loop before scaling the corpus. |
| H1 savings shrink at large N                     | Measure actual `references/tools.md` split sizes; report fraction served by a single lazy load.                  |
| A harness rejects skill-embedded MCP frontmatter | H4 surfaces it; reframe to "works for X, gaps in Y" — still publishable.                                         |
| Sonnet self-affinity inflates deltas             | Haiku (pure consumer) vs Sonnet delta comparison reported as robustness check.                                   |
| Thin-doc servers collapse B≈C                    | "Has real docs" is a hard server-selection criterion.                                                            |

---

## Open items (resolve during scaffolding)

- Identify the concrete ~80–100-tool stress server and the third-party TS server.
- Confirm Anthropic `count_tokens` availability/quotas for H1.
- Confirm Codex can consume both an MCP server and a skill from one install (H4).

---

## Phasing / sequencing

| Phase | Deliverable                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| **0** | `refine` eval loop: core driver + `to-skills refine` + MCP overlay adapter (TypeDoc adapter fast-follow). Lands in `to-skills`. |
| **1** | `to-skills-bench` scaffold, result schema, server pinning, H1 + H2. First teaser writeup.                                       |
| **2** | Task corpus authoring (75–100 tasks, Opus-derived + human spot-check).                                                          |
| **3** | H3 pilot (one server, one model) → iterate on prompt/scoring/refine loop.                                                       |
| **4** | H3 full run + analysis; H5 measurement.                                                                                         |
| **5** | H4 compatibility matrix; final writeup + blog.                                                                                  |
