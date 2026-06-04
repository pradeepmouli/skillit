# CLI Model Backend for `refine` Design

**Date:** 2026-06-03
**Status:** Approved (design)
**Scope:** `@skillit/client` only. Adds a CLI-driven `ModelClient` alongside the existing API client, selectable per run. No `@skillit/core` or `@skillit/cli` changes.
**Depends on:** the multi-source refine branch (`feat/refine-multi-source-init` / PR #52) — reuses the pure `buildDraftPrompt`/`buildReviewPrompt`/`parseReviewVerdict` it exports.

## Goal

Let `to-skills refine` (and `to-skills init`) drive the audit→draft→review loop through an **already-authenticated agent CLI** — `claude`, `codex`, or `copilot` — instead of direct Anthropic API calls. This avoids requiring `ANTHROPIC_API_KEY` and per-token API billing, reusing the user's existing CLI subscription/auth.

## Background — current state

- The refine loop is already model-agnostic: `refineSkill({ model })` accepts any `ModelClient` (`packages/core/src/refine/types.ts`):
  ```ts
  interface ModelClient {
    draft(req: DraftRequest): Promise<string>;
    review(req: ReviewRequest): Promise<ReviewResult>;
  }
  ```
- `AnthropicModelClient` (`packages/client/src/model/anthropic.ts`) is one implementation: `new Anthropic()` (reads `ANTHROPIC_API_KEY`), `DRAFTER = claude-sonnet-4-6`, `REVIEWER = claude-opus-4-7`.
- Three pure, exported helpers already exist and are reused verbatim by the new backend:
  - `buildDraftPrompt(req): string`
  - `buildReviewPrompt(req): string` (ends with `Respond with JSON only: {"verdict":...,"feedback":...}`)
  - `parseReviewVerdict(text): ReviewResult` — depth-scans arbitrary text for the embedded verdict JSON.
- `refine.ts` instantiates the client once (`model: new AnthropicModelClient()`) inside `runRefineCommand(opts)`; `init` dispatches refine through the same function.

## Design decisions (locked during brainstorming)

1. **Per-CLI adapters** for `claude`, `codex`, `copilot` (not a generic command template) — each knows its tool's non-interactive flags, structured-output mode, and model mapping.
2. **Preserve the drafter/reviewer model split, adapter-mapped**: claude maps role→`--model` (Sonnet draft / Opus review, reusing existing `DRAFTER`/`REVIEWER`); codex/copilot use their default model (no per-role flag).
3. **Structured output per adapter**: each adapter invokes its CLI's JSON/structured mode and extracts the result text; then `draft = result.trim()`, `review = parseReviewVerdict(result)`.
4. **Explicit selection, API default**: `--model-client api|claude|codex|copilot` (default `api`, preserving current behavior). No silent fallback.

## Architecture

All new code lives in `packages/client/src/model/`.

### Components

- **`model-client-factory.ts`** — `createModelClient(kind: ModelClientKind): ModelClient`. `'api'` → `new AnthropicModelClient()`; a CLI kind → `new CliModelClient(adapterFor(kind))`. Validates `kind`; for a CLI kind, runs a PATH pre-flight (below).
- **`cli/cli-client.ts`** — `CliModelClient implements ModelClient`, constructed with a `CliAdapter` and an injectable `runner` (defaults to the real `run.ts`):
  - `draft(req)` → `buildDraftPrompt(req)` → run adapter (`'draft'`) → `adapter.extractResult(stdout)` → trimmed string.
  - `review(req)` → `buildReviewPrompt(req)` → run adapter (`'review'`) → `extractResult` → `parseReviewVerdict`.
- **`cli/adapters.ts`** — `claudeAdapter`, `codexAdapter`, `copilotAdapter` and `adapterFor(kind)`, each implementing:
  ```ts
  interface CliAdapter {
    name: 'claude' | 'codex' | 'copilot';
    invocation(role: 'draft' | 'review'): { cmd: string; args: string[] }; // prompt delivered on stdin
    extractResult(stdout: string): string; // parse the CLI's JSON envelope → answer text
  }
  ```
- **`cli/run.ts`** — `runCli({ cmd, args, input, timeoutMs }): Promise<string>`: `child_process.spawn` with an **arg array and no shell** (no injection), prompt written to **stdin**, stdout captured, per-call timeout. Exported and injectable so tests never spawn a real process.
- **Shared constants** — `DRAFTER`/`REVIEWER` exported from `anthropic.ts` (or a small `models.ts`) so the claude adapter and the API client share one source of truth (DRY).

### Adapter specifics (flags verified against installed CLI versions during implementation)

- **claude**: `claude -p --output-format json --model <sonnet|opus>` (+ flags to forbid tool use, since draft/review is pure text); `extractResult` = `JSON.parse(stdout).result`.
- **codex**: `codex exec --json <…>`; `extractResult` extracts the final assistant message from the JSON stream.
- **copilot**: `copilot -p --json <…>`; `extractResult` extracts the result text.

The spec fixes the `CliAdapter` contract; the implementation plan pins exact flags after checking each CLI's `--help`/docs.

## Data flow (CLI review call)

```
runRefineCommand(opts) → createModelClient(opts.modelClient)
  → CliModelClient.review(req)
      buildReviewPrompt(req)                    // existing, includes guidance
      → runCli(claudeAdapter.invocation('review'), stdin=prompt)
         spawn: claude -p --output-format json --model claude-opus-4-7
      → claudeAdapter.extractResult(stdout) = JSON.parse(stdout).result
      → parseReviewVerdict(result)              // existing depth-scan
  → { verdict, feedback }
```

## Wiring

- Add `--model-client <api|claude|codex|copilot>` (default `api`) to `refine` and `init`.
- `runRefineCommand(opts)` replaces `new AnthropicModelClient()` with `createModelClient(opts.modelClient ?? 'api')`.
- `init` threads `--model-client` through to its refine dispatch.
- Optional `--model-cli-timeout <ms>` override for the per-call timeout (default 120000).

## Error handling (no silent fallback)

- **CLI not on PATH** (pre-flight when a CLI kind is selected) → `Error`: `<cli> CLI not found on PATH — install it or use --model-client api`.
- **Non-zero exit / timeout** → `Error` with the command, exit code, and a tail of stderr.
- **Unparseable output** (`extractResult` finds nothing / envelope shape changed) → `Error` showing the head of raw stdout, so a draft is never silently corrupted.
- **`review()` with no verdict JSON** → reuse `parseReviewVerdict`'s existing defined behavior (no special-casing).

## Testing (hermetic — no real CLI spawned)

- **Adapters**: `invocation(role)` (claude draft→Sonnet, review→Opus; codex/copilot role-agnostic) and `extractResult` against captured stdout envelope fixtures.
- **`CliModelClient`**: inject a stub `runner` returning a canned envelope; assert `draft()` returns trimmed result text and `review()` returns the parsed verdict (DI pattern as in `init`).
- **Factory**: `kind → correct client`; invalid kind → error; CLI-not-found pre-flight → actionable error (stub the probe).
- Existing `parseReviewVerdict` and prompt-builder tests cover the reused pieces — untouched.

## Scope & sequencing

- **This pass:** `CliModelClient` + three adapters + `run.ts` + factory + `--model-client` wiring on `refine` and `init` + docs.
- **Reused as-is:** `buildDraftPrompt`/`buildReviewPrompt`/`parseReviewVerdict`, the refine loop, `AnthropicModelClient`.

## Non-goals

- A generic/configurable command template (rejected in favor of per-CLI adapters).
- Auto-detecting or defaulting to a CLI backend (default stays `api`).
- Per-role model selection for codex/copilot (no per-role flag; default model).
- Streaming/interactive sessions — single-shot non-interactive invocation only.
- Changes to `@skillit/core` or `@skillit/cli`.

## Dependencies

- Builds on `feat/refine-multi-source-init` (PR #52) for the exported pure prompt builders/parser. Base this branch on it; rebase onto master once #52 merges.
- New dev/runtime deps: none (uses Node `child_process`).
