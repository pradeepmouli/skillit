# MCP-as-Skills Benchmark — Implementation Plan (Phases 1–5)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `to-skills-bench` repo that measures, defensibly and reproducibly, where converting MCP server tool surfaces into Agent Skills beats raw MCP — and where it does not.

**Architecture:** Standalone pnpm workspace (`to-skills-bench/`) mirroring the `to-skills` layout; `@to-skills/mcp` pinned as a versioned dep. Four packages: `harness` (runner + result schema), `tasks` (corpus + ground truth), `servers` (pinned MCP servers), `report` (chart generation). Append-only JSONL results committed for diffing; charts derive, never compute.

**Tech Stack:** TypeScript 5 strict, Node ≥22, pnpm workspaces, Vitest, `@anthropic-ai/sdk` (H3 only), `tiktoken`/`anthropic count_tokens` (H1), `vega-lite` or `observable-plot` (charts), `zod` (result schema validation)

**Prerequisite:** Phase 0 (`to-skills refine`) must be complete and `@to-skills/client` published (or available via `workspace:*` link) before running condition D in H3.

---

## File Map

### Repo root (`to-skills-bench/`)

- `pnpm-workspace.yaml` — `packages: ["packages/*"]`
- `package.json` — private workspace root, Node ≥22
- `tsconfig.json` — workspace-root tsconfig (strict)
- `results/H1.jsonl`, `results/H2.jsonl`, `results/H3.jsonl`, `results/H4.jsonl`, `results/H5.jsonl` — append-only measurement rows
- `docs/writeup.md` — technical writeup (filled in as hypotheses complete)

### `packages/harness/`

- `src/schema.ts` — `BenchResult` type + zod schema
- `src/append.ts` — `appendResult(row)` — validates + appends one JSON line to `results/<H>.jsonl`
- `src/env.ts` — `captureEnv()` — node version, os, cpu
- `src/tokenize.ts` — `countTokens(text, method)` — Anthropic API + tiktoken fallback
- `src/index.ts` — barrel
- `__tests__/schema.test.ts` — round-trip and validation tests
- `__tests__/append.test.ts` — append-to-temp-file tests

### `packages/servers/`

- `package.json` — pinned MCP server deps (exact versions)
- `src/index.ts` — exports server configs as `McpTransport` objects ready for `extractMcpSkill`

### `packages/tasks/`

- `src/corpus.ts` — `Task` type + `loadCorpus()` — reads `tasks/*.json`
- `tasks/filesystem/*.json` — ~15 task files for filesystem server
- `tasks/github/*.json` — ~20 task files for github server
- `tasks/sentry/*.json` — ~15 task files for third-party TS server
- `tasks/fastmcp/*.json` — ~15 task files for FastMCP Python server
- `__tests__/corpus.test.ts` — validates every task file against schema

### `packages/report/`

- `src/charts.ts` — generates vega-lite specs from JSONL rows (never computes, only reads)
- `src/index.ts` — barrel

---

## Chunk 1: Repo scaffold + result schema

> Everything required before the first measurement can land.

---

### Task 1: Bootstrap the repo

**Files:**

- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `results/.gitkeep`

> Run all commands from inside the `to-skills-bench/` directory you create. This repo lives **adjacent** to `to-skills/`, not inside it.

- [ ] **Step 1: Create repo directory and git init**

```bash
mkdir to-skills-bench && cd to-skills-bench
git init
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Create package.json**

```json
{
  "name": "to-skills-bench",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "type-check": "tsgo --noEmit",
    "build": "pnpm -r run build"
  },
  "devDependencies": {
    "@typescript-go/tsgo": "latest",
    "vitest": "^3.0.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 5: Create results directory and .gitignore**

```bash
mkdir results && touch results/.gitkeep
printf "node_modules\ndist\n" >> .gitignore
git add -A && git commit -m "chore: init to-skills-bench monorepo"
```

> JSONL result files in `results/` are **committed** — they are not gitignored. Every `appendResult` call adds to an append-only log.

---

### Task 2: Harness package — result schema

**Files:**

- Create: `packages/harness/package.json`
- Create: `packages/harness/tsconfig.json`
- Create: `packages/harness/src/schema.ts`
- Create: `packages/harness/src/__tests__/schema.test.ts`

- [ ] **Step 1: Create harness package.json**

```json
{
  "name": "@bench/harness",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "type-check": "tsgo --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Write schema.ts**

```typescript
// packages/harness/src/schema.ts
import { z } from 'zod';

export const BenchResultSchema = z.object({
  hypothesis: z.enum(['H1', 'H2', 'H3', 'H4', 'H5']),
  server: z.string(),
  serverVersion: z.string(),
  condition: z.enum(['raw_mcp', 'auto_skill', 'doc_mined_skill', 'eval_loop_skill']),
  model: z.string().optional(),
  task: z.string().optional(),
  metric: z.string(),
  value: z.number(),
  unit: z.enum(['tokens', 'ms', 'accuracy', 'boolean']),
  tokenizer: z.enum(['anthropic_count_tokens', 'tiktoken_cl100k_base']).optional(),
  timestamp: z.string(),
  envInfo: z.object({
    node: z.string(),
    os: z.string(),
    cpu: z.string()
  })
});

export type BenchResult = z.infer<typeof BenchResultSchema>;
```

- [ ] **Step 3: Write the failing test**

```typescript
// packages/harness/src/__tests__/schema.test.ts
import { describe, it, expect } from 'vitest';
import { BenchResultSchema } from '../schema.js';

const valid: Parameters<typeof BenchResultSchema.parse>[0] = {
  hypothesis: 'H1',
  server: 'filesystem',
  serverVersion: '0.6.2',
  condition: 'raw_mcp',
  metric: 'tokens',
  value: 4200,
  unit: 'tokens',
  tokenizer: 'anthropic_count_tokens',
  timestamp: new Date().toISOString(),
  envInfo: { node: '22.0.0', os: 'darwin', cpu: 'arm64' }
};

describe('BenchResultSchema', () => {
  it('parses a valid row', () => {
    expect(() => BenchResultSchema.parse(valid)).not.toThrow();
  });

  it('rejects unknown condition', () => {
    expect(() => BenchResultSchema.parse({ ...valid, condition: 'manual_skill' })).toThrow();
  });

  it('rejects unknown hypothesis', () => {
    expect(() => BenchResultSchema.parse({ ...valid, hypothesis: 'H6' })).toThrow();
  });

  it('accepts optional fields missing', () => {
    const { model: _m, task: _t, tokenizer: _tok, ...noOptional } = valid as any;
    expect(() => BenchResultSchema.parse(noOptional)).not.toThrow();
  });
});
```

- [ ] **Step 4: Run test — expect failure**

```bash
pnpm install && pnpm test packages/harness/src/__tests__/schema.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 5: Create src/index.ts and tsconfig.json**

```typescript
// packages/harness/src/index.ts
export * from './schema.js';
```

```json
// packages/harness/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "include": ["src"],
  "compilerOptions": { "rootDir": "src", "outDir": "dist" }
}
```

- [ ] **Step 6: Run test — expect pass**

```bash
pnpm test packages/harness/src/__tests__/schema.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/harness/
git commit -m "feat(harness): add BenchResult schema with zod validation"
```

---

### Task 3: Harness — append + env capture

**Files:**

- Create: `packages/harness/src/append.ts`
- Create: `packages/harness/src/env.ts`
- Create: `packages/harness/src/__tests__/append.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/harness/src/__tests__/append.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendResult } from '../append.js';
import type { BenchResult } from '../schema.js';

let tmp: string;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true });
});

const row: BenchResult = {
  hypothesis: 'H1',
  server: 'filesystem',
  serverVersion: '0.6.2',
  condition: 'raw_mcp',
  metric: 'tokens',
  value: 4200,
  unit: 'tokens',
  tokenizer: 'anthropic_count_tokens',
  timestamp: '2026-05-21T00:00:00.000Z',
  envInfo: { node: '22.0.0', os: 'darwin', cpu: 'arm64' }
};

describe('appendResult', () => {
  it('creates the file on first append and writes valid JSON', () => {
    tmp = mkdtempSync(join(tmpdir(), 'bench-'));
    const file = join(tmp, 'H1.jsonl');
    appendResult(file, row);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ hypothesis: 'H1', value: 4200 });
  });

  it('appends without overwriting prior rows', () => {
    tmp = mkdtempSync(join(tmpdir(), 'bench-'));
    const file = join(tmp, 'H1.jsonl');
    appendResult(file, row);
    appendResult(file, { ...row, value: 5000 });
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).value).toBe(5000);
  });

  it('rejects an invalid row before writing', () => {
    tmp = mkdtempSync(join(tmpdir(), 'bench-'));
    const file = join(tmp, 'H1.jsonl');
    expect(() => appendResult(file, { ...row, hypothesis: 'H9' } as any)).toThrow();
    expect(() => readFileSync(file)).toThrow(); // file must not have been created
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
pnpm test packages/harness/src/__tests__/append.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement append.ts and env.ts**

```typescript
// packages/harness/src/append.ts
import { appendFileSync } from 'node:fs';
import { BenchResultSchema, type BenchResult } from './schema.js';

export function appendResult(filePath: string, row: BenchResult): void {
  BenchResultSchema.parse(row); // throws on invalid
  appendFileSync(filePath, JSON.stringify(row) + '\n', 'utf8');
}
```

```typescript
// packages/harness/src/env.ts
import { cpus, type } from 'node:os';

export function captureEnv(): { node: string; os: string; cpu: string } {
  return {
    node: process.version.replace(/^v/, ''),
    os: type(),
    cpu: cpus()[0]?.model ?? 'unknown'
  };
}
```

- [ ] **Step 4: Update index.ts**

```typescript
// packages/harness/src/index.ts
export * from './schema.js';
export * from './append.js';
export * from './env.js';
```

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm test packages/harness/
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/harness/
git commit -m "feat(harness): add appendResult + captureEnv"
```

---

### Task 4: Servers package — pin MCP server deps

**Files:**

- Create: `packages/servers/package.json`
- Create: `packages/servers/src/index.ts`

- [ ] **Step 1: Create servers/package.json**

Pin exact versions of servers under test. Identify the ~80-100-tool stress server and third-party TS server before finalizing (open item from spec). Use placeholders until resolved.

```json
{
  "name": "@bench/servers",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/server-filesystem": "0.6.2",
    "@modelcontextprotocol/server-github": "0.6.2"
  }
}
```

> **Open item:** Add third-party TS server and stress server (80–100 tools) when identified. Hard selection criterion: each must ship real documentation (otherwise condition C collapses into B).

- [ ] **Step 2: Create servers/src/index.ts**

Export transport configs as ready-to-use `McpTransport` objects (stdio). Format matches what `extractMcpSkill({ transport })` expects.

```typescript
// packages/servers/src/index.ts
import type { McpTransport } from '@to-skills/mcp';

export const SERVERS: Record<string, { transport: McpTransport; version: string }> = {
  filesystem: {
    version: '0.6.2',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem@0.6.2', '/tmp']
    }
  },
  github: {
    version: '0.6.2',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github@0.6.2'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env['GITHUB_PERSONAL_ACCESS_TOKEN'] ?? '' }
    }
  }
};
```

- [ ] **Step 3: Install + type-check**

```bash
pnpm install && pnpm type-check
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/servers/
git commit -m "feat(servers): pin MCP server versions for benchmark"
```

---

## Chunk 2: H1 — Context arithmetic

> Pure measurement, no LLM. Token counts for raw MCP vs. skill+lazy per server.

---

### Task 5: Tokenizer utility

**Files:**

- Create: `packages/harness/src/tokenize.ts`
- Create: `packages/harness/src/__tests__/tokenize.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/harness/src/__tests__/tokenize.test.ts
import { describe, it, expect } from 'vitest';
import { countTokens } from '../tokenize.js';

describe('countTokens', () => {
  it('returns a positive number for non-empty text', async () => {
    const n = await countTokens('Hello, world!', 'tiktoken_cl100k_base');
    expect(n).toBeGreaterThan(0);
  });

  it('returns 0 for empty string', async () => {
    const n = await countTokens('', 'tiktoken_cl100k_base');
    expect(n).toBe(0);
  });

  it('longer text has more tokens', async () => {
    const short = await countTokens('Hi', 'tiktoken_cl100k_base');
    const long = await countTokens(
      'Hello, this is a much longer sentence with many words.',
      'tiktoken_cl100k_base'
    );
    expect(long).toBeGreaterThan(short);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
pnpm test packages/harness/src/__tests__/tokenize.test.ts
```

Expected: FAIL

- [ ] **Step 3: Install tiktoken**

```bash
pnpm add tiktoken --filter @bench/harness
```

- [ ] **Step 4: Implement tokenize.ts**

```typescript
// packages/harness/src/tokenize.ts
import type { BenchResult } from './schema.js';

type TokenizerMethod = BenchResult['tokenizer'];

export async function countTokens(
  text: string,
  method: NonNullable<TokenizerMethod>
): Promise<number> {
  if (text.length === 0) return 0;

  if (method === 'tiktoken_cl100k_base') {
    const { get_encoding } = await import('tiktoken');
    const enc = get_encoding('cl100k_base');
    const tokens = enc.encode(text);
    enc.free();
    return tokens.length;
  }

  // anthropic_count_tokens — requires ANTHROPIC_API_KEY in env
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic();
  const response = await client.beta.messages.countTokens({
    model: 'claude-haiku-4-5-20251001',
    messages: [{ role: 'user', content: text }]
  });
  return response.input_tokens;
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm test packages/harness/src/__tests__/tokenize.test.ts
```

Expected: PASS (tiktoken path only — Anthropic path requires API key)

- [ ] **Step 6: Export from index**

Add to `packages/harness/src/index.ts`:

```typescript
export * from './tokenize.js';
```

- [ ] **Step 7: Commit**

```bash
git add packages/harness/
git commit -m "feat(harness): add countTokens with tiktoken + Anthropic fallback"
```

---

### Task 6: H1 measurement script

**Files:**

- Create: `packages/harness/src/h1.ts` — H1 runner

- [ ] **Step 1: Write H1 runner**

```typescript
// packages/harness/src/h1.ts
// Run: node --import tsx packages/harness/src/h1.ts
import { resolve } from 'node:path';
import { appendResult } from './append.js';
import { captureEnv } from './env.js';
import { countTokens } from './tokenize.js';
import { SERVERS } from '../../servers/src/index.js';

const RESULTS_FILE = resolve('results/H1.jsonl');
const TOKENIZER = 'tiktoken_cl100k_base' as const;
const env = captureEnv();

async function measureServer(name: string, version: string): Promise<void> {
  // Lazy import to avoid loading @to-skills/mcp at module level
  const { extractMcpSkill, renderSkill } = await import('@to-skills/mcp');
  const serverInfo = SERVERS[name];
  if (!serverInfo) throw new Error(`Unknown server: ${name}`);

  console.log(`\n--- ${name} v${version} ---`);

  // Condition A: raw MCP (tools/list JSON)
  const skill = await extractMcpSkill({ transport: serverInfo.transport });
  const rawJson = JSON.stringify({ tools: (skill as any)._rawTools ?? [] });
  const rawTokens = await countTokens(rawJson, TOKENIZER);

  appendResult(RESULTS_FILE, {
    hypothesis: 'H1',
    server: name,
    serverVersion: version,
    condition: 'raw_mcp',
    metric: 'total_tokens',
    value: rawTokens,
    unit: 'tokens',
    tokenizer: TOKENIZER,
    timestamp: new Date().toISOString(),
    envInfo: env
  });
  console.log(`  raw_mcp: ${rawTokens} tokens`);

  // Condition B: auto skill (SKILL.md eager section)
  const { rendered } = await renderSkill(skill, {});
  const skillEagerTokens = await countTokens(rendered.eager, TOKENIZER);
  appendResult(RESULTS_FILE, {
    hypothesis: 'H1',
    server: name,
    serverVersion: version,
    condition: 'auto_skill',
    metric: 'eager_tokens',
    value: skillEagerTokens,
    unit: 'tokens',
    tokenizer: TOKENIZER,
    timestamp: new Date().toISOString(),
    envInfo: env
  });
  console.log(`  auto_skill (eager): ${skillEagerTokens} tokens`);

  // Per-tool lazy token counts (conditions C + D deferred: requires doc-mined/eval-loop SKILL.md
  // files to be pre-generated. Run a second H1 top-up pass once those exist.)
  for (const [toolName, toolContent] of Object.entries(rendered.lazy ?? {})) {
    const lazyTokens = await countTokens(toolContent as string, TOKENIZER);
    appendResult(RESULTS_FILE, {
      hypothesis: 'H1',
      server: name,
      serverVersion: version,
      condition: 'auto_skill',
      metric: `lazy_tokens:${toolName}`,
      value: lazyTokens,
      unit: 'tokens',
      tokenizer: TOKENIZER,
      timestamp: new Date().toISOString(),
      envInfo: env
    });
  }

  console.log(
    `  auto_skill (per-tool lazy): ${Object.keys(rendered.lazy ?? {}).length} tools recorded`
  );
}

for (const [name, { version }] of Object.entries(SERVERS)) {
  await measureServer(name, version);
}
console.log('\nH1 complete. Results appended to', RESULTS_FILE);
```

> **Note:** Confirm `renderSkill`'s return type before running. Check `packages/mcp/src/index.ts` in the `to-skills` repo for what is exported and `packages/core/src/renderer.ts` for the `RenderedSkill` shape (fields: `eager`, `lazy`, and token budget metadata). Adjust `rendered.eager` / `rendered.lazy` to match the actual field names.

- [ ] **Step 2: Install @to-skills/mcp (versioned dep, not workspace link)**

```bash
pnpm add @to-skills/mcp --filter @bench/harness
```

Replace with the published version number, e.g. `@to-skills/mcp@0.4.0`. Use workspace link only if running against an unpublished build.

- [ ] **Step 3: Run H1 against filesystem server**

```bash
node --import tsx packages/harness/src/h1.ts 2>&1 | head -40
```

Expected: token counts logged, rows appended to `results/H1.jsonl`

- [ ] **Step 4: Verify JSONL output**

```bash
head -5 results/H1.jsonl | python3 -m json.tool
```

Expected: valid JSON, `hypothesis: "H1"`, correct server/condition/metric fields

- [ ] **Step 5: Commit initial H1 results**

```bash
git add results/H1.jsonl packages/harness/src/h1.ts
git commit -m "feat(H1): measure raw MCP vs. auto skill token counts for filesystem + github"
```

---

## Chunk 3: H2 — Cold-start latency

---

### Task 7: H2 measurement script

**Files:**

- Create: `packages/harness/src/h2.ts`

- [ ] **Step 1: Write H2 runner**

```typescript
// packages/harness/src/h2.ts
import { resolve } from 'node:path';
import { appendResult } from './append.js';
import { captureEnv } from './env.js';
import { SERVERS } from '../../servers/src/index.js';
import { readFileSync } from 'node:fs';

const RESULTS_FILE = resolve('results/H2.jsonl');
const RUNS = 10;
const env = captureEnv();

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function p95(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)]!;
}

async function measureMcpColdStart(name: string): Promise<number[]> {
  const { extractMcpSkill } = await import('@to-skills/mcp');
  const serverInfo = SERVERS[name]!;
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await extractMcpSkill({ transport: serverInfo.transport });
    times.push(performance.now() - t0);
  }
  return times;
}

async function measureSkillColdStart(skillPath: string): Promise<number[]> {
  // Install: pnpm add js-yaml @types/js-yaml --filter @bench/harness
  const { load: parseYaml } = await import('js-yaml');
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const content = readFileSync(skillPath, 'utf8');
    if (!content.startsWith('---')) throw new Error('Not a SKILL.md file');
    const fmEnd = content.indexOf('\n---\n', 4);
    if (fmEnd === -1) throw new Error('Unterminated frontmatter');
    // Parse full frontmatter YAML — this is what a real harness does on cold start
    const fmText = content.slice(4, fmEnd);
    const _metadata = parseYaml(fmText);
    times.push(performance.now() - t0);
  }
  return times;
}

for (const [name, { version }] of Object.entries(SERVERS)) {
  console.log(`\n--- ${name} v${version} ---`);

  const mcpTimes = await measureMcpColdStart(name);
  const mcpMedian = median(mcpTimes);
  const mcpP95 = p95(mcpTimes);

  for (const [metric, value] of [
    ['median_ms', mcpMedian],
    ['p95_ms', mcpP95]
  ] as const) {
    appendResult(RESULTS_FILE, {
      hypothesis: 'H2',
      server: name,
      serverVersion: version,
      condition: 'raw_mcp',
      metric,
      value,
      unit: 'ms',
      timestamp: new Date().toISOString(),
      envInfo: env
    });
  }
  console.log(`  raw_mcp: median=${mcpMedian.toFixed(1)}ms  p95=${mcpP95.toFixed(1)}ms`);

  // Skill cold start — requires a pre-extracted SKILL.md for this server
  const skillPath = `skills/${name}/SKILL.md`;
  try {
    const skillTimes = await measureSkillColdStart(skillPath);
    const skillMedian = median(skillTimes);
    const skillP95 = p95(skillTimes);
    for (const [metric, value] of [
      ['median_ms', skillMedian],
      ['p95_ms', skillP95]
    ] as const) {
      appendResult(RESULTS_FILE, {
        hypothesis: 'H2',
        server: name,
        serverVersion: version,
        condition: 'auto_skill',
        metric,
        value,
        unit: 'ms',
        timestamp: new Date().toISOString(),
        envInfo: env
      });
    }
    console.log(`  auto_skill: median=${skillMedian.toFixed(1)}ms  p95=${skillP95.toFixed(1)}ms`);
  } catch {
    console.log(`  auto_skill: skipped (no SKILL.md at ${skillPath})`);
  }
}

console.log('\nH2 complete. Results appended to', RESULTS_FILE);
```

- [ ] **Step 2: Run H2**

```bash
node --import tsx packages/harness/src/h2.ts
```

Expected: latency rows written to `results/H2.jsonl`

- [ ] **Step 3: Commit H2 results**

```bash
git add results/H2.jsonl packages/harness/src/h2.ts
git commit -m "feat(H2): measure MCP cold-start vs skill read latency"
```

---

## Chunk 4: Task corpus (H3 prerequisite)

> The corpus must be authored before H3 can run. This is the most expensive step. Do not scale until the pilot passes.

---

### Task 8: Task schema and corpus loader

**Files:**

- Create: `packages/tasks/package.json`
- Create: `packages/tasks/src/corpus.ts`
- Create: `packages/tasks/src/__tests__/corpus.test.ts`

- [ ] **Step 1: Create tasks/package.json**

```json
{
  "name": "@bench/tasks",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Write corpus.ts**

```typescript
// packages/tasks/src/corpus.ts
import { z } from 'zod';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const TaskSchema = z.object({
  id: z.string(),
  server: z.string(),
  task: z.string(),
  ground_truth_tools: z.array(z.string()).min(1),
  difficulty: z.enum(['obvious', 'disambiguation', 'adversarial']),
  notes: z.string().optional()
});

export type Task = z.infer<typeof TaskSchema>;

export function loadCorpus(tasksDir: string): Task[] {
  const tasks: Task[] = [];
  const servers = readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const server of servers) {
    const files = readdirSync(join(tasksDir, server)).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(tasksDir, server, file), 'utf8'));
      tasks.push(TaskSchema.parse(raw));
    }
  }
  return tasks;
}
```

- [ ] **Step 3: Write the failing test (validates task schema)**

```typescript
// packages/tasks/src/__tests__/corpus.test.ts
import { describe, it, expect } from 'vitest';
import { TaskSchema } from '../corpus.js';

describe('TaskSchema', () => {
  it('accepts a valid task', () => {
    expect(() =>
      TaskSchema.parse({
        id: 'fs-001',
        server: 'filesystem',
        task: 'List all files in /tmp',
        ground_truth_tools: ['list_directory'],
        difficulty: 'obvious'
      })
    ).not.toThrow();
  });

  it('rejects empty ground_truth_tools', () => {
    expect(() =>
      TaskSchema.parse({
        id: 'fs-001',
        server: 'filesystem',
        task: 'List all files',
        ground_truth_tools: [],
        difficulty: 'obvious'
      })
    ).toThrow();
  });

  it('rejects unknown difficulty', () => {
    expect(() =>
      TaskSchema.parse({
        id: 'fs-001',
        server: 'filesystem',
        task: 'List all files',
        ground_truth_tools: ['list_directory'],
        difficulty: 'easy'
      })
    ).toThrow();
  });
});
```

- [ ] **Step 4: Run test — expect pass**

```bash
pnpm install && pnpm test packages/tasks/
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tasks/
git commit -m "feat(tasks): add Task schema + corpus loader"
```

---

### Task 9: Author pilot task corpus (10 tasks, one server)

> Author 10 tasks for the `filesystem` server before running the H3 pilot. Two passes: author writes, second person spot-checks ground truth. This is the bottleneck — do not rush it.

- [ ] **Step 1: Extract filesystem SKILL.md to understand the tool surface**

```bash
node --import tsx -e "
import { extractMcpSkill } from '@to-skills/mcp';
const skill = await extractMcpSkill({ transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem@0.6.2', '/tmp'] }});
console.log(skill.functions.map(f => f.name));
"
```

- [ ] **Step 2: Author 10 task JSON files**

Create `packages/tasks/tasks/filesystem/` and write 10 JSON files. Distribution: 4 obvious, 4 disambiguation, 2 adversarial.

Example files:

```json
// packages/tasks/tasks/filesystem/fs-001.json
{
  "id": "fs-001",
  "server": "filesystem",
  "task": "List all files in /tmp",
  "ground_truth_tools": ["list_directory"],
  "difficulty": "obvious",
  "notes": "Direct match from tool name"
}
```

```json
// packages/tasks/tasks/filesystem/fs-008.json
{
  "id": "fs-008",
  "server": "filesystem",
  "task": "I need to check what's in a file before deciding whether to overwrite it",
  "ground_truth_tools": ["read_file"],
  "difficulty": "disambiguation",
  "notes": "Could mistakenly pick write_file; must read first"
}
```

```json
// packages/tasks/tasks/filesystem/fs-009.json
{
  "id": "fs-009",
  "server": "filesystem",
  "task": "Move a file from /tmp/old.txt to /tmp/new.txt",
  "ground_truth_tools": ["move_file"],
  "difficulty": "adversarial",
  "notes": "Tempting to pick copy_file + delete_file; move_file is the correct single tool"
}
```

- [ ] **Step 3: Validate all 10 tasks parse correctly**

```bash
node --import tsx -e "
import { loadCorpus } from './packages/tasks/src/corpus.js';
const tasks = loadCorpus('./packages/tasks/tasks');
console.log('Valid tasks:', tasks.length);
tasks.forEach(t => console.log(t.id, t.difficulty));
"
```

Expected: 10 tasks, each with correct id + difficulty

- [ ] **Step 4: Commit pilot corpus**

```bash
git add packages/tasks/tasks/filesystem/
git commit -m "feat(corpus): add 10-task filesystem pilot corpus"
```

---

## Chunk 5: H3 pilot and full run

---

### Task 10: H3 measurement script

**Files:**

- Create: `packages/harness/src/h3.ts`

- [ ] **Step 1: Write H3 runner**

```typescript
// packages/harness/src/h3.ts
// Usage: ANTHROPIC_API_KEY=... node --import tsx packages/harness/src/h3.ts --pilot
import { resolve } from 'node:path';
import { appendResult } from './append.js';
import { captureEnv } from './env.js';
import { loadCorpus } from '../../tasks/src/corpus.js';
import type { Task } from '../../tasks/src/corpus.js';
import type { BenchResult } from './schema.js';
import Anthropic from '@anthropic-ai/sdk';

const RESULTS_FILE = resolve('results/H3.jsonl');
const TRIALS = 5;
const TEMPERATURE = 0.3;
const env = captureEnv();
const client = new Anthropic();

const MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'] as const;

type Condition = BenchResult['condition'];

const isPilot = process.argv.includes('--pilot');

function buildPrompt(context: string, task: string): string {
  // Frozen format — do not change across conditions or runs
  return [
    `Available tools: ${context}`,
    `Task: ${task}`,
    'Output JSON: { "tools": ["tool_name", ...], "reasoning": "..." }'
  ].join('\n');
}

function scoreResponse(predicted: string[], groundTruth: string[]): number {
  const predSet = new Set(predicted);
  const truthSet = new Set(groundTruth);
  const isExact =
    predicted.length === groundTruth.length && groundTruth.every((t) => predSet.has(t));
  if (isExact) return 1.0;
  const isSuperset = groundTruth.every((t) => predSet.has(t));
  if (isSuperset) return 0.5;
  return 0.0;
}

async function runTrial(
  model: string,
  condition: Condition,
  task: Task,
  context: string
): Promise<number> {
  const prompt = buildPrompt(context, task.task);
  const msg = await client.messages.create({
    model,
    max_tokens: 512,
    temperature: TEMPERATURE,
    messages: [{ role: 'user', content: prompt }]
  });
  const text = (msg.content[0] as { text: string }).text;
  let predicted: string[] = [];
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { tools?: string[] };
      predicted = parsed.tools ?? [];
    }
  } catch {
    /* predicted stays empty */
  }
  return scoreResponse(predicted, task.ground_truth_tools);
}

// Load context strings per condition — must be pre-generated
// Conditions B/C/D require SKILL.md files generated by @to-skills/mcp
async function loadContext(server: string, condition: Condition): Promise<string> {
  const { readFileSync } = await import('node:fs');
  if (condition === 'raw_mcp') {
    const { extractMcpSkill } = await import('@to-skills/mcp');
    const { SERVERS } = await import('../../servers/src/index.js');
    const skill = await extractMcpSkill({ transport: SERVERS[server]!.transport });
    return JSON.stringify({ tools: (skill as any)._rawTools ?? [] }, null, 2);
  }
  const conditionPath: Record<string, string> = {
    auto_skill: `skills/${server}/auto/SKILL.md`,
    doc_mined_skill: `skills/${server}/doc-mined/SKILL.md`,
    eval_loop_skill: `skills/${server}/eval-loop/SKILL.md`
  };
  return readFileSync(conditionPath[condition]!, 'utf8');
}

const tasks = loadCorpus(resolve('packages/tasks/tasks'));
const serverFilter = isPilot ? 'filesystem' : undefined;
const filteredTasks = serverFilter ? tasks.filter((t) => t.server === serverFilter) : tasks;
const modelFilter = isPilot ? MODELS.slice(0, 1) : MODELS;
const conditions: Condition[] = isPilot
  ? ['raw_mcp', 'auto_skill']
  : ['raw_mcp', 'auto_skill', 'doc_mined_skill', 'eval_loop_skill'];

console.log(
  `H3 ${isPilot ? 'PILOT' : 'FULL RUN'}: ${filteredTasks.length} tasks × ${conditions.length} conditions × ${modelFilter.length} models × ${TRIALS} trials`
);

const contextCache = new Map<string, string>();

for (const task of filteredTasks) {
  for (const condition of conditions) {
    const cacheKey = `${task.server}:${condition}`;
    if (!contextCache.has(cacheKey)) {
      contextCache.set(cacheKey, await loadContext(task.server, condition));
    }
    const context = contextCache.get(cacheKey)!;

    for (const model of modelFilter) {
      const scores: number[] = [];
      for (let trial = 0; trial < TRIALS; trial++) {
        const score = await runTrial(model, condition, task, context);
        scores.push(score);
      }
      const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      appendResult(RESULTS_FILE, {
        hypothesis: 'H3',
        server: task.server,
        serverVersion: '0.6.2',
        condition,
        model,
        task: task.id,
        metric: 'accuracy',
        value: meanScore,
        unit: 'accuracy',
        timestamp: new Date().toISOString(),
        envInfo: env
      });
      console.log(`  ${task.id} ${condition} ${model}: ${meanScore.toFixed(2)}`);
    }
  }
}
console.log('\nH3 complete. Results appended to', RESULTS_FILE);
```

- [ ] **Step 2: Run H3 pilot (10 tasks, filesystem, Haiku, conditions A+B only)**

```bash
ANTHROPIC_API_KEY=... node --import tsx packages/harness/src/h3.ts --pilot
```

Expected: ~100 rows appended to `results/H3.jsonl` (10 tasks × 2 conditions × 1 model × 5 trials)

- [ ] **Step 3: Check pilot gate — B→C adversarial delta**

The pilot is conditions A and B only; C requires `doc_mined_skill` SKILL.md files. Before running C:

- Extract condition B skills for all servers: `to-skills-mcp extract --config ...`
- Generate condition C (doc-mined): `to-skills-mcp bundle --doc-mine ... --out skills/<server>/doc-mined/`
- Re-run pilot with `--pilot` on conditions A+B+C
- If adversarial B→C delta < 5%, **stop**: fix doc-mining or annotations before the full corpus

- [ ] **Step 4: Commit pilot results and move to full corpus**

```bash
git add results/H3.jsonl packages/harness/src/h3.ts
git commit -m "feat(H3): pilot run — 10 filesystem tasks, A+B conditions, Haiku"
```

---

## Chunk 6: H4 + H5

---

### Task 11: H4 — Cross-harness compatibility matrix

**Files:**

- Create: `packages/harness/src/h4-matrix.md` — manually edited pass/fail matrix
- Create: `tests/harness-compat/claude-code-mcp.sh`
- Create: `tests/harness-compat/claude-code-skill.sh`
- Create: `tests/harness-compat/codex-mcp.sh`
- Create: `tests/harness-compat/codex-skill.sh`

- [ ] **Step 1: Write 5-line repro scripts for each cell**

`tests/harness-compat/claude-code-mcp.sh`:

```bash
#!/bin/bash
# Verifies Claude Code can consume filesystem server as raw MCP
claude --mcp-config '{"mcpServers":{"filesystem":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem@0.6.2","/tmp"]}}}' \
  --print "List /tmp using MCP tools"
```

`tests/harness-compat/claude-code-skill.sh`:

```bash
#!/bin/bash
# Verifies Claude Code loads SKILL.md via project skills directory
cp skills/filesystem/auto/SKILL.md .claude/skills/filesystem/SKILL.md
claude --print "Use your filesystem skill to list /tmp"
```

`tests/harness-compat/codex-mcp.sh`:

```bash
#!/bin/bash
# Verifies Codex can consume filesystem server as raw MCP
codex --mcp '{"servers":{"filesystem":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem@0.6.2","/tmp"]}}}' \
  "List /tmp using MCP tools"
```

`tests/harness-compat/codex-skill.sh`:

```bash
#!/bin/bash
# Verifies Codex loads SKILL.md
codex "Use the filesystem skill (SKILL.md attached) to list /tmp" \
  --file skills/filesystem/auto/SKILL.md
```

- [ ] **Step 2: Run each script manually and fill in the matrix**

```markdown
<!-- packages/harness/src/h4-matrix.md -->

# H4 Compatibility Matrix

| Harness     | Server as MCP | Skill consumed | Both from same install |
| ----------- | ------------- | -------------- | ---------------------- |
| Claude Code | ✓/✗           | ✓/✗            | ✓/✗                    |
| Codex       | ✓/✗           | ✓/✗            | ✓/✗                    |
```

Fill in each cell after running the repro script. Record any error messages in comments below the table.

- [ ] **Step 3: Append H4 rows to JSONL**

```bash
# For each cell, append a boolean result row manually or via a small script
node --import tsx -e "
import { appendResult } from './packages/harness/src/append.js';
import { captureEnv } from './packages/harness/src/env.js';
appendResult('results/H4.jsonl', {
  hypothesis: 'H4',
  server: 'filesystem',
  serverVersion: '0.6.2',
  condition: 'raw_mcp',
  model: 'claude-code',
  metric: 'harness_compat',
  value: 1,  // 1 = pass, 0 = fail
  unit: 'boolean',
  timestamp: new Date().toISOString(),
  envInfo: captureEnv(),
});
"
```

- [ ] **Step 4: Commit**

```bash
git add results/H4.jsonl packages/harness/src/h4-matrix.md tests/harness-compat/
git commit -m "feat(H4): cross-harness compatibility matrix (Claude Code + Codex)"
```

---

### Task 12: H5 — Multi-session economy

**Files:**

- Create: `packages/harness/src/h5.ts`

- [ ] **Step 1: Write H5 runner**

```typescript
// packages/harness/src/h5.ts
import { resolve } from 'node:path';
import { appendResult } from './append.js';
import { captureEnv } from './env.js';
import { countTokens } from './tokenize.js';
import { SERVERS } from '../../servers/src/index.js';
import { loadCorpus } from '../../tasks/src/corpus.js';

const RESULTS_FILE = resolve('results/H5.jsonl');
const SESSIONS = 5;
const TOKENIZER = 'tiktoken_cl100k_base' as const;
const env = captureEnv();

const tasks = loadCorpus(resolve('packages/tasks/tasks'));

for (const [name, { version }] of Object.entries(SERVERS)) {
  const serverTasks = tasks.filter((t) => t.server === name).slice(0, SESSIONS);
  if (serverTasks.length === 0) continue;

  // Get raw token count
  const { extractMcpSkill } = await import('@to-skills/mcp');
  const skill = await extractMcpSkill({ transport: SERVERS[name]!.transport });
  const rawJson = JSON.stringify({ tools: (skill as any)._rawTools ?? [] });
  const rawPerSession = await countTokens(rawJson, TOKENIZER);
  const rawTotal = rawPerSession * SESSIONS;

  appendResult(RESULTS_FILE, {
    hypothesis: 'H5',
    server: name,
    serverVersion: version,
    condition: 'raw_mcp',
    metric: 'multi_session_total_tokens',
    value: rawTotal,
    unit: 'tokens',
    tokenizer: TOKENIZER,
    timestamp: new Date().toISOString(),
    envInfo: env
  });

  // Skill with harness caching (unique tools loaded once)
  const { readFileSync } = await import('node:fs');
  const skillContent = readFileSync(`skills/${name}/auto/SKILL.md`, 'utf8');
  const eagerTokens = await countTokens(skillContent, TOKENIZER);

  const uniqueTools = new Set(serverTasks.flatMap((t) => t.ground_truth_tools));
  // Each tool's lazy section loaded once (caching assumption)
  let lazyTotalCached = 0;
  for (const tool of uniqueTools) {
    let lazyContent = '';
    try {
      lazyContent = readFileSync(`skills/${name}/references/${tool}.md`, 'utf8');
    } catch {
      /* tool not extracted */
    }
    if (lazyContent) lazyTotalCached += await countTokens(lazyContent, TOKENIZER);
  }
  const skillTotalCached = eagerTokens * SESSIONS + lazyTotalCached;
  appendResult(RESULTS_FILE, {
    hypothesis: 'H5',
    server: name,
    serverVersion: version,
    condition: 'auto_skill',
    metric: 'multi_session_total_tokens_cached',
    value: skillTotalCached,
    unit: 'tokens',
    tokenizer: TOKENIZER,
    timestamp: new Date().toISOString(),
    envInfo: env
  });

  // Skill without harness caching (tools reloaded each session)
  const lazyTotalUncached = lazyTotalCached * SESSIONS;
  const skillTotalUncached = eagerTokens * SESSIONS + lazyTotalUncached;
  appendResult(RESULTS_FILE, {
    hypothesis: 'H5',
    server: name,
    serverVersion: version,
    condition: 'auto_skill',
    metric: 'multi_session_total_tokens_uncached',
    value: skillTotalUncached,
    unit: 'tokens',
    tokenizer: TOKENIZER,
    timestamp: new Date().toISOString(),
    envInfo: env
  });

  const savingsCached = (((rawTotal - skillTotalCached) / rawTotal) * 100).toFixed(1);
  const savingsUncached = (((rawTotal - skillTotalUncached) / rawTotal) * 100).toFixed(1);
  console.log(
    `${name}: raw=${rawTotal} skill_cached=${skillTotalCached} (${savingsCached}% saving) skill_uncached=${skillTotalUncached} (${savingsUncached}% saving)`
  );
}

console.log('\nH5 complete. Results appended to', RESULTS_FILE);
```

- [ ] **Step 2: Run H5**

```bash
node --import tsx packages/harness/src/h5.ts
```

Expected: rows written to `results/H5.jsonl` for each server

- [ ] **Step 3: Commit H5 results**

```bash
git add results/H5.jsonl packages/harness/src/h5.ts
git commit -m "feat(H5): measure multi-session economy — raw MCP vs skill cached/uncached"
```

---

## Chunk 7: Report + writeup scaffolding

---

### Task 13: Report package

**Files:**

- Create: `packages/report/package.json`
- Create: `packages/report/src/charts.ts`
- Create: `docs/writeup.md`

- [ ] **Step 1: Create report package.json**

```json
{
  "name": "@bench/report",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "node --import tsx src/charts.ts"
  },
  "dependencies": {
    "vega-lite": "^5.20.0",
    "vega": "^5.30.0"
  }
}
```

- [ ] **Step 2: Create charts.ts (reads JSONL, emits chart specs)**

```typescript
// packages/report/src/charts.ts
// Charts READ from JSONL only — they compute nothing.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import type { BenchResult } from '../../harness/src/schema.js';

async function readJsonl(file: string): Promise<BenchResult[]> {
  const rows: BenchResult[] = [];
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) rows.push(JSON.parse(line) as BenchResult);
  }
  return (rl.close() as unknown as never, rows);
}

async function h1Chart(): Promise<void> {
  const rows = await readJsonl(resolve('results/H1.jsonl'));
  const tokenRows = rows.filter((r) => r.metric === 'total_tokens' || r.metric === 'eager_tokens');
  // Vega-lite spec — group by server, condition, metric; produce line chart with N on x-axis
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: 'H1: Token count by server and condition',
    data: { values: tokenRows },
    mark: 'bar',
    encoding: {
      x: { field: 'server', type: 'nominal' },
      y: { field: 'value', type: 'quantitative', title: 'Tokens' },
      color: { field: 'condition', type: 'nominal' }
    }
  };
  process.stdout.write(JSON.stringify(spec, null, 2) + '\n');
}

await h1Chart();
```

> **Note:** Full vega-lite chart specs for H2–H5 follow the same pattern: `readJsonl` → filter → group → spec. Implement these as results accumulate.

- [ ] **Step 3: Create writeup scaffolding**

Create `docs/writeup.md` with section headers matching each hypothesis. Fill in results as measurements complete.

```markdown
# MCP-as-Skills Benchmark — Technical Writeup

**Status:** Draft — results accumulating
**Date:** 2026-05-21
**Servers tested:** filesystem v0.6.2, github v0.6.2, TBD

## Summary

## H1 — Context Arithmetic

## H2 — Cold-Start Latency

## H3 — Tool-Selection Accuracy

## H4 — Cross-Harness Portability

## H5 — Multi-Session Economy

## Where Raw MCP Wins

Both conditions must hold: (1) tool surface mutates per-session AND (2) client subscribes to
`listChanged` notifications AND can authoritatively select newly-appeared tools without further
guidance. For static surfaces — the overwhelming majority — skills are strictly better.

## Conclusion
```

- [ ] **Step 4: Commit**

```bash
git add packages/report/ docs/writeup.md
git commit -m "feat(report): add chart generator scaffold + writeup template"
```

---

## Testing notes

- **Schema tests** are the only tests in this repo. Everything else is a measurement script or manual step.
- **No LLM spend** in H1, H2, H5 — those are pure computation against pre-generated files.
- **H3 pilot gate** is mandatory before full corpus: if B→C adversarial delta < 5%, do not scale.
- **Results are committed** — every JSONL row is append-only. Re-running adds new rows with new timestamps; old rows are not deleted. Analysis scripts must handle duplicates by filtering on timestamp ranges.
- **Condition D (eval_loop_skill)** requires Phase 0 to be complete. Run conditions A–C first; add D once `to-skills refine` is working and has been run against each server.
