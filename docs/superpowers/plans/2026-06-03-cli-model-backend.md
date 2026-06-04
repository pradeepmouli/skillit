# CLI Model Backend for `refine` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `to-skills refine` and `to-skills init` drive the audit→draft→review loop through an already-authenticated agent CLI (`claude`, `codex`, `copilot`) instead of direct Anthropic API calls, selected via `--model-client`.

**Architecture:** Add a second `ModelClient` implementation (`CliModelClient`) beside `AnthropicModelClient`, plus a factory that picks between them. The CLI client reuses the existing pure `buildDraftPrompt`/`buildReviewPrompt`/`parseReviewVerdict` and only changes the transport: spawn a per-CLI adapter, capture stdout, extract the answer from the CLI's JSON envelope. Nothing in `@skillit/core` or the refine loop changes.

**Tech Stack:** TypeScript strict (no `any`), ESM `.js` import specifiers, Node `child_process.spawn` (arg array, no shell), Vitest, oxlint/oxfmt, conventional commits. `@skillit/client` only.

**Spec:** `docs/superpowers/specs/2026-06-03-cli-model-backend-design.md`.

---

## Repo conventions (read before starting)

- Run tests from the **repo root**: `pnpm exec vitest run <path> --reporter=dot` (vitest globs are root-relative; running inside a package finds no files). Type-check: `pnpm --filter @skillit/client type-check`. Lint: `pnpm run lint`.
- Tests live in `packages/client/src/__tests__/` (matches the include glob `packages/**/src/**/*.test.ts`).
- **The commit hook rejects the literal `re`+`.exec(`** — use `.match()`/`.matchAll()`.
- No `any`, anywhere (including tests).
- The lint-staged hook runs `oxfmt`/`oxlint --fix` on commit and may reformat; that's expected.

## File Structure

| File                                                      | Responsibility                                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/client/src/model/models.ts` (new)               | Shared `DRAFTER`/`REVIEWER`/`MAX_TOKENS` constants (moved out of `anthropic.ts` so both the API client and the claude adapter import one source of truth).   |
| `packages/client/src/model/anthropic.ts` (modify)         | Import the constants from `models.ts` instead of declaring them. No behavior change.                                                                         |
| `packages/client/src/model/cli/run.ts` (new)              | `runCli(opts)`: spawn a process (arg array, no shell), optional stdin, timeout; resolve stdout or throw. Injectable.                                         |
| `packages/client/src/model/cli/adapters.ts` (new)         | `CliAdapter` interface + `claudeAdapter`/`codexAdapter`/`copilotAdapter` + `adapterFor(kind)`.                                                               |
| `packages/client/src/model/cli/cli-client.ts` (new)       | `CliModelClient implements ModelClient` (adapter + injectable runner).                                                                                       |
| `packages/client/src/model/model-client-factory.ts` (new) | `createModelClient(kind, opts?)`: `'api'`→Anthropic, CLI kind→`CliModelClient` + PATH pre-flight.                                                            |
| `packages/client/src/commands/refine.ts` (modify)         | `--model-client`/`--model-cli-timeout` options; `RefineCommandOpts` fields; `runRefine` takes a `ModelClient`; `runRefineCommand` builds it via the factory. |
| `packages/client/src/commands/init.ts` (modify)           | `--model-client`/`--model-cli-timeout` options threaded into the refine dispatch opts.                                                                       |
| `README.md` (modify)                                      | Document `--model-client`.                                                                                                                                   |
| `.changeset/cli-model-backend.md` (new)                   | `@skillit/client` minor.                                                                                                                                     |

---

## Chunk 1: Shared constants + process runner

### Task 1.1: Extract shared model constants

**Files:** Create `packages/client/src/model/models.ts`; Modify `packages/client/src/model/anthropic.ts:5-7`.

- [ ] **Step 1: Create `models.ts`.**

```typescript
// packages/client/src/model/models.ts
// Shared model identifiers for the refine drafter/reviewer roles. Imported by
// both the Anthropic API client and the claude CLI adapter so the role→model
// mapping has one source of truth.
export const DRAFTER = 'claude-sonnet-4-6';
export const REVIEWER = 'claude-opus-4-7';
export const MAX_TOKENS = 1024;
```

- [ ] **Step 2: Update `anthropic.ts` to import them.** Replace lines 5-7 (`const DRAFTER`/`REVIEWER`/`MAX_TOKENS`) with:

```typescript
import { DRAFTER, REVIEWER, MAX_TOKENS } from './models.js';
```

(Place it with the other imports at the top; delete the three `const` lines. The rest of `anthropic.ts` is unchanged.)

- [ ] **Step 3: Verify nothing broke.**

Run: `pnpm exec vitest run packages/client --reporter=dot`
Expected: PASS (same count as before — this is a pure refactor).
Run: `pnpm --filter @skillit/client type-check`
Expected: exit 0.

- [ ] **Step 4: Commit.**

```bash
git add packages/client/src/model/models.ts packages/client/src/model/anthropic.ts
git commit -m "refactor(client): extract shared refine model constants"
```

### Task 1.2: Process runner

**Files:** Create `packages/client/src/model/cli/run.ts`; Test `packages/client/src/__tests__/cli-run.test.ts`.

- [ ] **Step 1: Write the failing test.**

```typescript
// packages/client/src/__tests__/cli-run.test.ts
import { describe, it, expect } from 'vitest';
import { runCli } from '../model/cli/run.js';

describe('runCli', () => {
  it('returns stdout for a successful command', async () => {
    const out = await runCli({ cmd: 'node', args: ['-e', 'process.stdout.write("hello")'] });
    expect(out).toBe('hello');
  });

  it('writes input to stdin when provided', async () => {
    const out = await runCli({
      cmd: 'node',
      args: ['-e', 'process.stdin.pipe(process.stdout)'],
      input: 'piped-in'
    });
    expect(out).toBe('piped-in');
  });

  it('throws with the command and a stderr tail on non-zero exit', async () => {
    await expect(
      runCli({ cmd: 'node', args: ['-e', 'process.stderr.write("boom"); process.exit(3)'] })
    ).rejects.toThrow(/node.*exit code 3.*boom/s);
  });

  it('throws a timeout error when the command exceeds timeoutMs', async () => {
    await expect(
      runCli({ cmd: 'node', args: ['-e', 'setTimeout(()=>{}, 10000)'], timeoutMs: 100 })
    ).rejects.toThrow(/timed out after 100ms/);
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `pnpm exec vitest run packages/client/src/__tests__/cli-run.test.ts --reporter=dot`
Expected: FAIL (`Cannot find module '../model/cli/run.js'`).

- [ ] **Step 3: Implement `run.ts`.**

```typescript
// packages/client/src/model/cli/run.ts
import { spawn } from 'node:child_process';

export interface RunCliOptions {
  /** Executable name (resolved on PATH) — never a shell string. */
  cmd: string;
  /** Arguments as an array — no shell, so no injection/escaping concerns. */
  args: string[];
  /** Optional text written to the child's stdin, then closed. */
  input?: string;
  /** Per-call timeout in milliseconds (default 120000). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Spawn `cmd` with `args` (no shell), optionally pipe `input` to stdin, and
 * resolve the captured stdout. Throws on non-zero exit (message includes the
 * command, exit code, and a stderr tail) or on timeout.
 */
export function runCli(opts: RunCliOptions): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise<string>((resolve, reject) => {
    const child = spawn(opts.cmd, opts.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${opts.cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${opts.cmd} failed to start: ${err.message}`));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        const tail = stderr.trim().slice(-500);
        reject(new Error(`${opts.cmd} ${opts.args.join(' ')} exit code ${code}: ${tail}`));
      }
    });

    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
    }
    child.stdin.end();
  });
}
```

- [ ] **Step 4: Run, verify it passes.**

Run: `pnpm exec vitest run packages/client/src/__tests__/cli-run.test.ts --reporter=dot`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/client/src/model/cli/run.ts packages/client/src/__tests__/cli-run.test.ts
git commit -m "feat(client): process runner for cli model adapters"
```

---

## Chunk 2: Adapters + CliModelClient

### Task 2.1: CLI adapters

**Files:** Create `packages/client/src/model/cli/adapters.ts`; Test `packages/client/src/__tests__/cli-adapters.test.ts`.

Adapter contract: `invocation(role, prompt)` returns how to run the CLI (the adapter decides arg-vs-stdin prompt delivery); `extractResult(stdout)` pulls the answer text out of that CLI's JSON envelope. Verified envelopes (probed live 2026-06-03):

- **claude**: `claude -p --output-format json --model <m>` (prompt on stdin) → stdout is one JSON object `{ "type":"result", "is_error":false, "result":"<answer>", ... }`.
- **codex**: `codex exec --json` (prompt on stdin) → stdout is JSONL; the answer is the last line `{"type":"item.completed","item":{"type":"agent_message","text":"<answer>"}}`. Non-JSON log lines may be interleaved — skip lines that don't `JSON.parse`.
- **copilot**: `copilot -p <prompt> --output-format json --no-color` (prompt as arg) → stdout is JSONL; the answer is the last `{"type":"assistant.message","data":{"content":"<answer>","model":"...","toolRequests":[]}}` event (there are also `assistant.message_delta` streaming events — skip those — and a final `{"type":"result","exitCode":0,...}` with no content). Skip lines that don't `JSON.parse`. **Auth gotcha (verified):** copilot prioritizes a `GH_TOKEN`/`GITHUB_TOKEN`/`COPILOT_GITHUB_TOKEN` env var over its stored `/login` credential; if that env token lacks the "Copilot Requests" permission, copilot fails auth even though `/login` is valid. This is the consumer's environment concern (do NOT strip env vars in the shipped adapter — that would break users whose env token IS the valid cred). When live-testing copilot during implementation, run it with those vars cleared (`env -u GH_TOKEN -u GITHUB_TOKEN -u COPILOT_GITHUB_TOKEN copilot ...`) if the ambient token is stale.

- [ ] **Step 1: Write the failing tests.**

```typescript
// packages/client/src/__tests__/cli-adapters.test.ts
import { describe, it, expect } from 'vitest';
import { claudeAdapter, codexAdapter, copilotAdapter, adapterFor } from '../model/cli/adapters.js';
import { DRAFTER, REVIEWER } from '../model/models.js';

describe('claudeAdapter', () => {
  it('maps draft role to the drafter model and review role to the reviewer model', () => {
    const draft = claudeAdapter.invocation('draft', 'PROMPT');
    expect(draft.cmd).toBe('claude');
    expect(draft.args).toEqual(['-p', '--output-format', 'json', '--model', DRAFTER]);
    expect(draft.input).toBe('PROMPT');
    const review = claudeAdapter.invocation('review', 'PROMPT');
    expect(review.args).toContain(REVIEWER);
  });

  it('extracts result from the claude json envelope', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: false, result: 'the answer' });
    expect(claudeAdapter.extractResult(stdout)).toBe('the answer');
  });

  it('throws when claude reports is_error', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: true, result: 'nope' });
    expect(() => claudeAdapter.extractResult(stdout)).toThrow(/claude/i);
  });
});

describe('codexAdapter', () => {
  it('invokes codex exec --json with the prompt on stdin and no per-role model', () => {
    const inv = codexAdapter.invocation('draft', 'PROMPT');
    expect(inv.cmd).toBe('codex');
    expect(inv.args).toEqual(['exec', '--json']);
    expect(inv.input).toBe('PROMPT');
    // role-agnostic: review uses the same invocation
    expect(codexAdapter.invocation('review', 'PROMPT').args).toEqual(['exec', '--json']);
  });

  it('extracts the last agent_message from the jsonl stream, skipping log/noise lines', () => {
    const stdout = [
      'some non-json log line',
      JSON.stringify({ type: 'thread.started', thread_id: 'x' }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'final' } }),
      JSON.stringify({ type: 'turn.completed' })
    ].join('\n');
    expect(codexAdapter.extractResult(stdout)).toBe('final');
  });

  it('throws when no agent_message is present', () => {
    expect(() => codexAdapter.extractResult('{"type":"turn.completed"}')).toThrow(/codex/i);
  });
});

describe('copilotAdapter', () => {
  it('passes the prompt as an argument', () => {
    const inv = copilotAdapter.invocation('draft', 'PROMPT');
    expect(inv.cmd).toBe('copilot');
    expect(inv.args).toEqual(['-p', 'PROMPT', '--output-format', 'json', '--no-color']);
    expect(inv.input).toBeUndefined();
  });

  it('extracts the last assistant.message content from the jsonl stream, skipping deltas/result', () => {
    const stdout = [
      JSON.stringify({ type: 'assistant.message_delta', data: { deltaContent: 'the ' } }),
      JSON.stringify({ type: 'assistant.message_delta', data: { deltaContent: 'answer' } }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'the answer', toolRequests: [] }
      }),
      JSON.stringify({ type: 'result', exitCode: 0 })
    ].join('\n');
    expect(copilotAdapter.extractResult(stdout)).toBe('the answer');
  });

  it('throws when no assistant.message is present', () => {
    expect(() => copilotAdapter.extractResult('{"type":"result","exitCode":0}')).toThrow(
      /copilot/i
    );
  });
});

describe('adapterFor', () => {
  it('returns the matching adapter', () => {
    expect(adapterFor('claude')).toBe(claudeAdapter);
    expect(adapterFor('codex')).toBe(codexAdapter);
    expect(adapterFor('copilot')).toBe(copilotAdapter);
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `pnpm exec vitest run packages/client/src/__tests__/cli-adapters.test.ts --reporter=dot`
Expected: FAIL (`Cannot find module '../model/cli/adapters.js'`).

- [ ] **Step 3: Implement `adapters.ts`.**

```typescript
// packages/client/src/model/cli/adapters.ts
import { DRAFTER, REVIEWER } from '../models.js';

export type CliModelClientKind = 'claude' | 'codex' | 'copilot';
export type ModelRole = 'draft' | 'review';

export interface CliInvocation {
  /** Executable name. */
  cmd: string;
  /** Arguments (no shell). */
  args: string[];
  /** Prompt to pipe to stdin, if this CLI takes the prompt that way. */
  input?: string;
}

export interface CliAdapter {
  readonly name: CliModelClientKind;
  /** How to invoke the CLI for a given role with a given prompt. */
  invocation(role: ModelRole, prompt: string): CliInvocation;
  /** Extract the model's answer text from the CLI's stdout. Throws on error/empty. */
  extractResult(stdout: string): string;
}

export const claudeAdapter: CliAdapter = {
  name: 'claude',
  invocation(role, prompt) {
    const model = role === 'review' ? REVIEWER : DRAFTER;
    return {
      cmd: 'claude',
      args: ['-p', '--output-format', 'json', '--model', model],
      input: prompt
    };
  },
  extractResult(stdout) {
    let parsed: { is_error?: boolean; result?: string };
    try {
      parsed = JSON.parse(stdout) as typeof parsed;
    } catch {
      throw new Error(`claude: could not parse JSON output: ${stdout.slice(0, 200)}`);
    }
    if (parsed.is_error) {
      throw new Error(`claude reported an error: ${parsed.result ?? '(no result)'}`);
    }
    if (typeof parsed.result !== 'string') {
      throw new Error(`claude: no result field in output: ${stdout.slice(0, 200)}`);
    }
    return parsed.result;
  }
};

export const codexAdapter: CliAdapter = {
  name: 'codex',
  invocation(_role, prompt) {
    // codex uses its default model (no per-role mapping); prompt on stdin.
    return { cmd: 'codex', args: ['exec', '--json'], input: prompt };
  },
  extractResult(stdout) {
    let last: string | undefined;
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue; // skip log/noise lines
      let evt: { type?: string; item?: { type?: string; text?: string } };
      try {
        evt = JSON.parse(trimmed) as typeof evt;
      } catch {
        continue;
      }
      if (evt.type === 'item.completed' && evt.item?.type === 'agent_message' && evt.item.text) {
        last = evt.item.text;
      }
    }
    if (last === undefined) {
      throw new Error(`codex: no agent_message in output: ${stdout.slice(0, 200)}`);
    }
    return last;
  }
};

export const copilotAdapter: CliAdapter = {
  name: 'copilot',
  invocation(_role, prompt) {
    // copilot uses its default model; prompt passed as an argument.
    return { cmd: 'copilot', args: ['-p', prompt, '--output-format', 'json', '--no-color'] };
  },
  extractResult(stdout) {
    // copilot emits JSONL; the answer is the last `assistant.message` event's
    // data.content (skip `assistant.message_delta` streaming events + the final
    // `result` event). Verified live 2026-06-03.
    let last: string | undefined;
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      let evt: { type?: string; data?: { content?: string } };
      try {
        evt = JSON.parse(trimmed) as typeof evt;
      } catch {
        continue;
      }
      if (evt.type === 'assistant.message' && typeof evt.data?.content === 'string') {
        last = evt.data.content;
      }
    }
    if (last === undefined) {
      throw new Error(`copilot: no assistant.message in output: ${stdout.slice(0, 200)}`);
    }
    return last;
  }
};

const ADAPTERS: Record<CliModelClientKind, CliAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  copilot: copilotAdapter
};

export function adapterFor(kind: CliModelClientKind): CliAdapter {
  return ADAPTERS[kind];
}
```

- [ ] **Step 4: Run, verify it passes.**

Run: `pnpm exec vitest run packages/client/src/__tests__/cli-adapters.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/client/src/model/cli/adapters.ts packages/client/src/__tests__/cli-adapters.test.ts
git commit -m "feat(client): per-cli adapters (claude/codex/copilot)"
```

### Task 2.2: `CliModelClient`

**Files:** Create `packages/client/src/model/cli/cli-client.ts`; Test `packages/client/src/__tests__/cli-client.test.ts`.

- [ ] **Step 1: Write the failing tests.**

```typescript
// packages/client/src/__tests__/cli-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CliModelClient } from '../model/cli/cli-client.js';
import { claudeAdapter } from '../model/cli/adapters.js';
import type { DraftRequest, ReviewRequest, ExtractedSkill } from '@skillit/core';

const skill = { name: 'demo' } as unknown as ExtractedSkill;
const draftReq: DraftRequest = {
  toolName: 'gen',
  tag: 'useWhen',
  suggestion: 'say when',
  currentValue: undefined,
  skill
};
const reviewReq: ReviewRequest = {
  toolName: 'gen',
  tag: 'useWhen',
  draft: 'When generating',
  suggestion: 'say when',
  skill
};

describe('CliModelClient', () => {
  it('draft() returns the trimmed result extracted from the adapter envelope', async () => {
    const runner = vi.fn(async () =>
      JSON.stringify({ type: 'result', is_error: false, result: '  When generating output  ' })
    );
    const client = new CliModelClient(claudeAdapter, { runner });
    const out = await client.draft(draftReq);
    expect(out).toBe('When generating output');
    // the adapter's invocation was forwarded to the runner
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'claude', args: expect.arrayContaining(['-p']) })
    );
  });

  it('review() parses the verdict JSON out of the adapter result', async () => {
    const runner = vi.fn(async () =>
      JSON.stringify({
        type: 'result',
        is_error: false,
        result: 'Sure: {"verdict":"revise","feedback":"too vague"}'
      })
    );
    const client = new CliModelClient(claudeAdapter, { runner });
    const res = await client.review(reviewReq);
    expect(res).toEqual({ verdict: 'revise', feedback: 'too vague' });
  });

  it('passes the configured timeout through to the runner', async () => {
    const runner = vi.fn(async () =>
      JSON.stringify({ type: 'result', is_error: false, result: 'x' })
    );
    const client = new CliModelClient(claudeAdapter, { runner, timeoutMs: 5000 });
    await client.draft(draftReq);
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 5000 }));
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `pnpm exec vitest run packages/client/src/__tests__/cli-client.test.ts --reporter=dot`
Expected: FAIL (`Cannot find module '../model/cli/cli-client.js'`).

- [ ] **Step 3: Implement `cli-client.ts`.**

```typescript
// packages/client/src/model/cli/cli-client.ts
import type { DraftRequest, ReviewRequest, ReviewResult, ModelClient } from '@skillit/core';
import { buildDraftPrompt, buildReviewPrompt, parseReviewVerdict } from '../anthropic.js';
import { runCli, type RunCliOptions } from './run.js';
import type { CliAdapter } from './adapters.js';

/** Injectable process runner (defaults to the real `runCli`). */
export type CliRunner = (opts: RunCliOptions) => Promise<string>;

export interface CliModelClientOptions {
  runner?: CliRunner;
  timeoutMs?: number;
}

/**
 * A {@link ModelClient} that drives an agent CLI (claude/codex/copilot) instead
 * of the Anthropic API. Reuses the shared prompt builders and verdict parser;
 * only the transport differs.
 */
export class CliModelClient implements ModelClient {
  private readonly runner: CliRunner;
  private readonly timeoutMs?: number;

  constructor(
    private readonly adapter: CliAdapter,
    options: CliModelClientOptions = {}
  ) {
    this.runner = options.runner ?? runCli;
    this.timeoutMs = options.timeoutMs;
  }

  private async run(role: 'draft' | 'review', prompt: string): Promise<string> {
    const inv = this.adapter.invocation(role, prompt);
    const stdout = await this.runner({
      cmd: inv.cmd,
      args: inv.args,
      ...(inv.input !== undefined ? { input: inv.input } : {}),
      ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {})
    });
    return this.adapter.extractResult(stdout);
  }

  async draft(req: DraftRequest): Promise<string> {
    const result = await this.run('draft', buildDraftPrompt(req));
    return result.trim();
  }

  async review(req: ReviewRequest): Promise<ReviewResult> {
    const result = await this.run('review', buildReviewPrompt(req));
    return parseReviewVerdict(result);
  }
}
```

- [ ] **Step 4: Run, verify it passes.**

Run: `pnpm exec vitest run packages/client/src/__tests__/cli-client.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/client/src/model/cli/cli-client.ts packages/client/src/__tests__/cli-client.test.ts
git commit -m "feat(client): CliModelClient reusing prompt builders + verdict parser"
```

---

## Chunk 3: Factory + command wiring + docs

### Task 3.1: Model-client factory

**Files:** Create `packages/client/src/model/model-client-factory.ts`; Test `packages/client/src/__tests__/model-client-factory.test.ts`.

The factory validates the kind and, for a CLI kind, runs a PATH pre-flight so a missing binary fails fast with an actionable message instead of an opaque spawn error.

- [ ] **Step 1: Write the failing tests.**

```typescript
// packages/client/src/__tests__/model-client-factory.test.ts
import { describe, it, expect } from 'vitest';
import { createModelClient } from '../model/model-client-factory.js';
import { AnthropicModelClient } from '../model/anthropic.js';
import { CliModelClient } from '../model/cli/cli-client.js';

describe('createModelClient', () => {
  it("returns an AnthropicModelClient for 'api'", () => {
    expect(createModelClient('api')).toBeInstanceOf(AnthropicModelClient);
  });

  it('returns a CliModelClient for a cli kind whose binary is present', () => {
    // inject a pre-flight that reports the binary exists
    const client = createModelClient('claude', { hasBinary: () => true });
    expect(client).toBeInstanceOf(CliModelClient);
  });

  it('throws an actionable error when the cli binary is missing', () => {
    expect(() => createModelClient('codex', { hasBinary: () => false })).toThrow(
      /codex CLI not found on PATH.*--model-client api/s
    );
  });

  it('throws on an invalid kind', () => {
    expect(() => createModelClient('bogus')).toThrow(
      /invalid --model-client.*api\|claude\|codex\|copilot/s
    );
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `pnpm exec vitest run packages/client/src/__tests__/model-client-factory.test.ts --reporter=dot`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Implement `model-client-factory.ts`.**

```typescript
// packages/client/src/model/model-client-factory.ts
import { execFileSync } from 'node:child_process';
import type { ModelClient } from '@skillit/core';
import { AnthropicModelClient } from './anthropic.js';
import { CliModelClient } from './cli/cli-client.js';
import { adapterFor, type CliModelClientKind } from './cli/adapters.js';

export type ModelClientKind = 'api' | CliModelClientKind;

const CLI_KINDS: readonly CliModelClientKind[] = ['claude', 'codex', 'copilot'];
const ALL_KINDS = ['api', ...CLI_KINDS] as const;

export interface CreateModelClientOptions {
  /** Per-call timeout for CLI invocations. */
  timeoutMs?: number;
  /** Injectable PATH check (defaults to a real `command -v` probe). */
  hasBinary?: (cmd: string) => boolean;
}

function defaultHasBinary(cmd: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'command', ['-v', cmd], {
      stdio: 'ignore',
      shell: process.platform !== 'win32'
    });
    return true;
  } catch {
    return false;
  }
}

function isCliKind(kind: string): kind is CliModelClientKind {
  return (CLI_KINDS as readonly string[]).includes(kind);
}

/**
 * Build the {@link ModelClient} for the requested backend. `'api'` → the
 * Anthropic API client; a CLI kind → a {@link CliModelClient} after a PATH
 * pre-flight. Throws an actionable error for an unknown kind or a missing CLI.
 */
export function createModelClient(
  kind: string,
  options: CreateModelClientOptions = {}
): ModelClient {
  if (kind === 'api') return new AnthropicModelClient();
  if (!isCliKind(kind)) {
    throw new Error(`invalid --model-client '${kind}'. Use one of: ${ALL_KINDS.join('|')}.`);
  }
  const hasBinary = options.hasBinary ?? defaultHasBinary;
  if (!hasBinary(kind)) {
    throw new Error(
      `${kind} CLI not found on PATH — install it, or use --model-client api (requires ANTHROPIC_API_KEY).`
    );
  }
  return new CliModelClient(adapterFor(kind), {
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {})
  });
}
```

- [ ] **Step 4: Run, verify it passes.**

Run: `pnpm exec vitest run packages/client/src/__tests__/model-client-factory.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/client/src/model/model-client-factory.ts packages/client/src/__tests__/model-client-factory.test.ts
git commit -m "feat(client): model-client factory with cli pre-flight"
```

### Task 3.2: Wire `--model-client` into `refine`

**Files:** Modify `packages/client/src/commands/refine.ts`.

Current relevant code (for reference):

- `RefineCommandOpts` (line ~86) — the opts interface.
- `runRefine(source, maxIterations, itemsPerIteration)` (line ~205) — hardcodes `new AnthropicModelClient()`.
- `runRefineCommand(opts)` (line ~104) — builds the source, then calls `runRefine(...)`.
- `buildRefineCommand()` (line ~22) — the commander definition with `.option(...)` chain and `.action((opts) => runRefineCommand(opts))`.

- [ ] **Step 1: Write the failing test.**

```typescript
// add to packages/client/src/__tests__/refine-resolve.test.ts (new describe block)
import { resolveModelClientKind } from '../commands/refine.js';

describe('resolveModelClientKind', () => {
  it("defaults to 'api' when --model-client is omitted", () => {
    expect(resolveModelClientKind(undefined)).toBe('api');
  });
  it('passes through a provided kind', () => {
    expect(resolveModelClientKind('claude')).toBe('claude');
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `pnpm exec vitest run packages/client/src/__tests__/refine-resolve.test.ts --reporter=dot`
Expected: FAIL (`resolveModelClientKind` is not exported).

- [ ] **Step 3: Implement the wiring in `refine.ts`.**

(a) Replace the `AnthropicModelClient` import with the factory:

```typescript
// remove: import { AnthropicModelClient } from '../model/anthropic.js';
import { createModelClient } from '../model/model-client-factory.js';
import type { ModelClient } from '@skillit/core';
```

(b) Add fields to `RefineCommandOpts`:

```typescript
export interface RefineCommandOpts {
  source?: string;
  program?: string;
  mcp?: string;
  server?: string;
  overlay?: string;
  mode?: string;
  sourceGlob?: string;
  maxIterations: string;
  items: string;
  modelClient?: string; // <-- add
  modelCliTimeout?: string; // <-- add
}
```

(c) Add the tiny pure helper (exported for the test) near `parsePositiveInt`:

```typescript
/** The model backend to use; defaults to the API client. */
export function resolveModelClientKind(raw: string | undefined): string {
  return raw ?? 'api';
}
```

(d) Change `runRefine` to take a `ModelClient` instead of constructing one:

```typescript
function runRefine(
  source: RefineSource,
  model: ModelClient,
  maxIterations: number,
  itemsPerIteration: number
): ReturnType<typeof refineSkill> {
  return refineSkill({
    source,
    model,
    maxIterations,
    itemsPerIteration,
    onIteration: (iter) => {
      const { grade, total } = iter.estimate;
      console.log(
        `  Iteration ${iter.iteration}: grade ${grade} (${total}/120), ${iter.fixes.length} fix(es) applied`
      );
    }
  });
}
```

(e) In `runRefineCommand`, build the model before calling `runRefine` and pass it through. Add this right after `itemsPerIteration` is computed (and before/after source resolution — it must run before the `runRefine` call). Wrap construction so a bad kind / missing CLI prints the error and sets exit code instead of throwing out of the action:

```typescript
const timeoutMs =
  opts.modelCliTimeout !== undefined
    ? parsePositiveInt(opts.modelCliTimeout, '--model-cli-timeout')
    : undefined;
let model: ModelClient;
try {
  model = createModelClient(resolveModelClientKind(opts.modelClient), {
    ...(timeoutMs !== undefined ? { timeoutMs } : {})
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  return;
}
```

Then update **both** `runRefine(...)` call sites (the cli branch and the mcp branch) to pass `model`: `await runRefine(source, model, maxIterations, itemsPerIteration)` (match the existing call shape — if the code currently calls `runRefine(source, maxIterations, itemsPerIteration)` once after the branches, just add `model` as the 2nd arg there).

(f) Add the options to `buildRefineCommand()` (in the `.option(...)` chain):

```typescript
    .option('--model-client <kind>', 'model backend: api | claude | codex | copilot', 'api')
    .option('--model-cli-timeout <ms>', 'per-call timeout for cli model backends (ms)')
```

- [ ] **Step 4: Run, verify it passes + full gates.**

Run: `pnpm exec vitest run --reporter=dot`
Expected: PASS (existing refine tests still green; new `resolveModelClientKind` tests pass).
Run: `pnpm --filter @skillit/client type-check`
Expected: exit 0.

- [ ] **Step 5: Commit.**

```bash
git add packages/client/src/commands/refine.ts packages/client/src/__tests__/refine-resolve.test.ts
git commit -m "feat(client): refine --model-client selects api or a cli backend"
```

### Task 3.3: Thread `--model-client` through `init`

**Files:** Modify `packages/client/src/commands/init.ts`.

`init` dispatches refine via `runRefine`/`defaultRunRefine` building a `RefineCommandOpts`. Forward the new fields.

- [ ] **Step 1: Write the failing test.**

```typescript
// add to packages/client/src/__tests__/init.test.ts
it('threads --model-client and --model-cli-timeout into the refine dispatch', async () => {
  const calls: RefineCommandOpts[] = [];
  const deps = {
    runInstall: async () => {},
    generateSkill: async () => {},
    runRefine: async (opts: RefineCommandOpts) => {
      calls.push(opts);
    }
  };
  // build a cli fixture cwd (reuse the helper already in this file), then:
  const cmd = buildInitCommand(deps);
  await cmd.parseAsync(
    ['--source', 'cli', '--model-client', 'claude', '--model-cli-timeout', '7000'],
    {
      from: 'user'
    }
  );
  expect(calls[0]?.modelClient).toBe('claude');
  expect(calls[0]?.modelCliTimeout).toBe('7000');
});
```

(Use the same temp-cwd/`process.chdir` setup the other cli tests in this file use; import `RefineCommandOpts` from `'../commands/refine.js'` if not already imported.)

- [ ] **Step 2: Run, verify it fails.**

Run: `pnpm exec vitest run packages/client/src/__tests__/init.test.ts --reporter=dot`
Expected: FAIL (`modelClient`/`modelCliTimeout` undefined on the dispatched opts).

- [ ] **Step 3: Implement.**

(a) Add to `InitOpts`:

```typescript
interface InitOpts {
  source?: string;
  program?: string;
  out: string;
  modelClient?: string; // <-- add
  modelCliTimeout?: string; // <-- add
}
```

(b) Add the options to the `Command('init')` chain:

```typescript
    .option('--model-client <kind>', 'model backend for refine: api | claude | codex | copilot', 'api')
    .option('--model-cli-timeout <ms>', 'per-call timeout for cli model backends (ms)')
```

(c) In the `nature === 'cli'` branch, forward the fields into the `runRefine({...})` opts object:

```typescript
await runRefine({
  source: nature,
  ...(opts.program !== undefined ? { program: opts.program } : {}),
  ...(opts.modelClient !== undefined ? { modelClient: opts.modelClient } : {}),
  ...(opts.modelCliTimeout !== undefined ? { modelCliTimeout: opts.modelCliTimeout } : {}),
  maxIterations: '5',
  items: '5'
});
```

- [ ] **Step 4: Run, verify it passes + full gates.**

Run: `pnpm exec vitest run --reporter=dot`
Expected: PASS.
Run: `pnpm --filter @skillit/client type-check`
Expected: exit 0.

- [ ] **Step 5: Commit.**

```bash
git add packages/client/src/commands/init.ts packages/client/src/__tests__/init.test.ts
git commit -m "feat(client): init forwards --model-client to refine"
```

### Task 3.4: Docs + changeset

**Files:** Modify `README.md`; Create `.changeset/cli-model-backend.md`.

- [ ] **Step 1: Document the flag in `README.md`.** In the refine flag table (the one with `--source`/`--program`/`--mcp`/...), add two rows:

```markdown
| `--model-client <kind>` | `api` | Model backend: `api` (ANTHROPIC_API_KEY) or a CLI: `claude` / `codex` / `copilot` |
| `--model-cli-timeout <ms>` | `120000` | Per-call timeout for CLI model backends |
```

And add a short paragraph under the refine section:

```markdown
**CLI model backends.** Instead of the Anthropic API, `refine` (and `init`) can
drive the loop through an already-authenticated agent CLI — `--model-client claude`,
`codex`, or `copilot`. The drafter/reviewer prompts are identical; only the
transport changes. `claude` maps the drafter/reviewer split to Sonnet/Opus via
`--model`; `codex`/`copilot` use their configured default model. Each CLI must be
installed and authenticated. Note: `copilot` prioritizes a `GH_TOKEN`/`GITHUB_TOKEN`
environment variable over its `/login` credential — if that token lacks the
"Copilot Requests" permission, unset it so copilot uses your login.
```

- [ ] **Step 2: Create the changeset.**

```markdown
---
'@skillit/client': minor
---

`refine` and `init` gain `--model-client api|claude|codex|copilot`: drive the
audit→draft→review loop through an already-authenticated agent CLI instead of
the Anthropic API. Per-CLI adapters (claude maps the drafter/reviewer split to
Sonnet/Opus; codex/copilot use their default model) reuse the existing prompt
builders and verdict parser; `--model-cli-timeout` bounds each call. Default
remains `api`.
```

- [ ] **Step 3: Final gates.**

Run: `pnpm exec vitest run --reporter=dot` → PASS.
Run: `pnpm -r type-check` → exit 0.
Run: `pnpm run lint` → exit 0.

- [ ] **Step 4: Commit.**

```bash
git add README.md .changeset/cli-model-backend.md
git commit -m "docs: document --model-client cli backends + changeset"
```

---

## Self-Review

**Spec coverage:**

- Per-CLI adapters (claude/codex/copilot) → Task 2.1. ✓
- Preserve drafter/reviewer split, adapter-mapped → `claudeAdapter.invocation` maps role→model; codex/copilot role-agnostic (Task 2.1). ✓
- Structured output per adapter → each `extractResult` parses the CLI's JSON envelope (Task 2.1). ✓
- Explicit selection, API default → `createModelClient` + `resolveModelClientKind` default `'api'` + `--model-client` default `'api'` (Tasks 3.1–3.3). ✓
- Reuse `buildDraftPrompt`/`buildReviewPrompt`/`parseReviewVerdict` → `CliModelClient` (Task 2.2). ✓
- DRY shared `DRAFTER`/`REVIEWER` → `models.ts` (Task 1.1). ✓
- Error handling: missing CLI pre-flight → Task 3.1; non-zero exit/timeout → `runCli` (Task 1.2); unparseable output → each `extractResult` throws with stdout head (Task 2.1). ✓
- Wiring on refine + init + timeout override → Tasks 3.2–3.3. ✓
- Hermetic tests (injected runner/hasBinary, no real spawn of agent CLIs) → Tasks 2.2, 3.1; `runCli` tests use `node` only (Task 1.2). ✓
- Docs + changeset (client minor) → Task 3.4. ✓

**Type consistency:** `ModelClientKind`/`CliModelClientKind`, `CliAdapter.invocation(role, prompt)`, `CliInvocation {cmd,args,input?}`, `CliRunner`, `RunCliOptions {cmd,args,input?,timeoutMs?}`, `createModelClient(kind, {timeoutMs?, hasBinary?})` are consistent across tasks. `runRefine` gains a `model: ModelClient` 2nd param (Task 3.2) — both call sites updated.

**Placeholder scan:** None. All three CLI envelopes (claude single-object, codex JSONL `agent_message`, copilot JSONL `assistant.message`) are live-verified (2026-06-03); every step has concrete code.

**Auth note (not a code change):** copilot prioritizes a `GH_TOKEN`/`GITHUB_TOKEN`/`COPILOT_GITHUB_TOKEN` env var over its `/login` credential. The adapter deliberately does NOT strip these (a user's env token may be the valid cred); the README/error guidance documents the gotcha. When live-testing copilot during implementation with a stale ambient token, run with those vars cleared.
