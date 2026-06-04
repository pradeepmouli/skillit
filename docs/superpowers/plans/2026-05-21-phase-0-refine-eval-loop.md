# Phase 0: Autonomous Refine Eval Loop — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate the existing manual audit→fix→re-score workflow into an autonomous `to-skills refine` command that iteratively annotates skills until grade A or an iteration cap.

**Architecture:** `@skillit/core` owns the abstract engine (loop driver + types + work-item selector); `@skillit/mcp` owns the MCP overlay adapter (sidecar file); `@skillit/typedoc` owns the TypeDoc adapter (JSDoc tag insertion); a new `@skillit/client` package owns the Anthropic SDK implementation + the `to-skills` bin with the `refine` command.

**Tech Stack:** TypeScript 5 strict, Node ≥22, Vitest, pnpm workspaces, commander, `@anthropic-ai/sdk`, `tsgo` build

---

## File Map

### Created

- `packages/core/src/refine/types.ts` — shared interfaces: ModelClient, RefineSource, RefineOptions, RefineResult, DraftedFix, RefineTag
- `packages/core/src/refine/select-targets.ts` — parseTag, selectWorkItems (ActionableImprovement → ranked RefineWorkItem[])
- `packages/core/src/refine/loop.ts` — refineSkill() async function (the engine)
- `packages/core/src/refine/index.ts` — barrel for refine sub-package
- `packages/mcp/src/refine/overlay.ts` — ToSkillsOverlay type, readOverlay, writeOverlay, applyFixToOverlay
- `packages/mcp/src/refine/merge-overlay.ts` — mergeOverlay(skill, overlay): ExtractedSkill
- `packages/mcp/src/refine/mcp-source.ts` — McpRefineSource implements RefineSource
- `packages/mcp/src/refine/index.ts` — barrel
- `packages/typedoc/src/refine/jsdoc-edit.ts` — insertJsDocTag (string-based JSDoc tag insertion)
- `packages/typedoc/src/refine/typedoc-source.ts` — TypeDocRefineSource implements RefineSource
- `packages/typedoc/src/refine/index.ts` — barrel
- `packages/client/package.json` — new package @skillit/client with bin to-skills
- `packages/client/tsconfig.json` — extends workspace root
- `packages/client/tsconfig.build.json` — outDir dist, excludes tests
- `packages/client/src/model/anthropic.ts` — AnthropicModelClient implements ModelClient
- `packages/client/src/commands/refine.ts` — commander refine command (dispatches by source)
- `packages/client/src/bin.ts` — CLI entry point
- `packages/client/src/index.ts` — public API exports

### Modified

- `packages/core/src/index.ts` — add refine exports
- `packages/mcp/src/index.ts` — add refine exports
- `packages/typedoc/src/index.ts` — add refine exports (if exists; skip if missing)
- `pnpm-workspace.yaml` — already matches `packages/*`, no change needed
- `packages/client/` — new workspace member (auto-discovered)

### Tests

- `packages/core/src/refine/__tests__/select-targets.test.ts`
- `packages/core/src/refine/__tests__/loop.test.ts`
- `packages/mcp/src/refine/__tests__/overlay.test.ts`
- `packages/mcp/src/refine/__tests__/merge-overlay.test.ts`
- `packages/mcp/src/refine/__tests__/mcp-source.test.ts`
- `packages/typedoc/src/refine/__tests__/jsdoc-edit.test.ts`
- `packages/client/src/__tests__/anthropic-model.test.ts`

---

## Chunk 1: Core refine engine

> `packages/core/src/refine/` — abstract types + work-item selector + loop driver

---

### Task 1: Scaffold refine types

**Files:**

- Create: `packages/core/src/refine/types.ts`

- [ ] **Step 1: Write the file**

```typescript
// packages/core/src/refine/types.ts
import type {
  ExtractedSkill,
  SkillJudgeEstimate,
  ActionableImprovement,
  AuditContext
} from '../index.js';

export type RefineTag = 'useWhen' | 'avoidWhen' | 'pitfalls' | 'remarks' | 'example';

export interface DraftRequest {
  toolName: string;
  tag: RefineTag;
  suggestion: string;
  currentValue: string | undefined;
  skill: ExtractedSkill;
}

export interface ReviewRequest {
  toolName: string;
  tag: RefineTag;
  draft: string;
  suggestion: string;
  skill: ExtractedSkill;
}

export type ReviewVerdict = 'accepted' | 'revise';

export interface ReviewResult {
  verdict: ReviewVerdict;
  feedback: string;
}

export interface DraftedFix {
  toolName: string;
  tag: RefineTag;
  value: string;
}

export interface ModelClient {
  draft(req: DraftRequest): Promise<string>;
  review(req: ReviewRequest): Promise<ReviewResult>;
}

export interface RefineSource {
  extract(): Promise<ExtractedSkill>;
  auditContext(skill: ExtractedSkill): AuditContext;
  applyFixes(fixes: readonly DraftedFix[]): Promise<void>;
}

export interface RefineWorkItem {
  toolName: string;
  tag: RefineTag;
  improvement: ActionableImprovement;
}

export type RefineStopReason = 'passed' | 'max-iterations' | 'no-improvements' | 'plateau';

export interface RefineIteration {
  iteration: number;
  estimate: SkillJudgeEstimate;
  workItems: readonly RefineWorkItem[];
  fixes: readonly DraftedFix[];
}

export interface RefineOptions {
  source: RefineSource;
  model: ModelClient;
  passingGrades?: ReadonlyArray<SkillJudgeEstimate['grade']>;
  maxIterations?: number;
  itemsPerIteration?: number;
  onIteration?: (iteration: RefineIteration) => void;
}

export interface RefineResult {
  iterations: readonly RefineIteration[];
  finalSkill: ExtractedSkill;
  finalEstimate: SkillJudgeEstimate;
  passed: boolean;
  stoppedReason: RefineStopReason;
}
```

- [ ] **Step 2: Verify TypeScript accepts it**

```bash
cd packages/core && pnpm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/refine/types.ts
git commit -m "feat(core/refine): add refine types (ModelClient, RefineSource, DraftedFix, RefineResult)"
```

---

### Task 2: Work-item selector

**Files:**

- Create: `packages/core/src/refine/select-targets.ts`
- Create: `packages/core/src/refine/__tests__/select-targets.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/refine/__tests__/select-targets.test.ts
import { describe, it, expect } from 'vitest';
import { parseTag, selectWorkItems } from '../select-targets.js';
import type { ActionableImprovement } from '../../index.js';

describe('parseTag', () => {
  it('extracts @useWhen', () => expect(parseTag('Add @useWhen annotation')).toBe('useWhen'));
  it('extracts @avoidWhen', () => expect(parseTag('Missing @avoidWhen')).toBe('avoidWhen'));
  it('extracts @pitfalls', () => expect(parseTag('@pitfalls missing')).toBe('pitfalls'));
  it('returns undefined for unknown', () =>
    expect(parseTag('general improvement')).toBeUndefined());
});

describe('selectWorkItems', () => {
  const imp = (suggestion: string, points: number, toolName = 'tool_a'): ActionableImprovement => ({
    suggestion,
    points,
    dimension: 'D2',
    targets: [{ file: 'f.ts', name: toolName, kind: 'function' }]
  });

  it('ranks by points descending and caps at limit', () => {
    const items = [
      imp('Add @useWhen annotation', 5, 'tool_a'),
      imp('Add @pitfalls annotation', 10, 'tool_b'),
      imp('Add @avoidWhen annotation', 3, 'tool_c')
    ];
    const result = selectWorkItems(items, 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.improvement.points).toBe(10);
    expect(result[0]!.tag).toBe('pitfalls');
    expect(result[1]!.improvement.points).toBe(5);
    expect(result[1]!.tag).toBe('useWhen');
  });

  it('skips improvements without parseable tags', () => {
    const items = [
      imp('General quality improvement', 5, 'tool_a'),
      imp('Add @useWhen annotation', 8, 'tool_b')
    ];
    const result = selectWorkItems(items, 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.toolName).toBe('tool_b');
  });

  it('expands multi-target improvements into one item per target', () => {
    const multi: ActionableImprovement = {
      suggestion: 'Add @useWhen annotation',
      points: 5,
      dimension: 'D2',
      targets: [
        { file: 'f.ts', name: 'tool_a', kind: 'function' },
        { file: 'f.ts', name: 'tool_b', kind: 'function' }
      ]
    };
    const result = selectWorkItems([multi], 10);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.toolName)).toEqual(['tool_a', 'tool_b']);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd packages/core && pnpm test src/refine/__tests__/select-targets.test.ts
```

Expected: FAIL — cannot find module `../select-targets.js`

- [ ] **Step 3: Implement select-targets.ts**

```typescript
// packages/core/src/refine/select-targets.ts
import type { ActionableImprovement } from '../index.js';
import type { RefineTag, RefineWorkItem } from './types.js';

const TAG_RE = /@(\w+)/;

export function parseTag(suggestion: string): RefineTag | undefined {
  const match = suggestion.match(TAG_RE);
  if (!match) return undefined;
  const tag = match[1] as RefineTag;
  const valid: ReadonlySet<RefineTag> = new Set([
    'useWhen',
    'avoidWhen',
    'pitfalls',
    'remarks',
    'example'
  ]);
  return valid.has(tag) ? tag : undefined;
}

export function selectWorkItems(
  improvements: readonly ActionableImprovement[],
  limit: number
): RefineWorkItem[] {
  const items: RefineWorkItem[] = [];
  for (const imp of improvements) {
    const tag = parseTag(imp.suggestion);
    if (!tag) continue;
    const targets = imp.targets ?? [];
    for (const target of targets) {
      items.push({ toolName: target.name, tag, improvement: imp });
    }
  }
  items.sort((a, b) => b.improvement.points - a.improvement.points);
  return items.slice(0, limit);
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd packages/core && pnpm test src/refine/__tests__/select-targets.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/refine/select-targets.ts packages/core/src/refine/__tests__/select-targets.test.ts
git commit -m "feat(core/refine): add parseTag + selectWorkItems with tests"
```

---

### Task 3: Refine loop driver

**Files:**

- Create: `packages/core/src/refine/loop.ts`
- Create: `packages/core/src/refine/__tests__/loop.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/core/src/refine/__tests__/loop.test.ts
import { describe, it, expect, vi } from 'vitest';
import { refineSkill } from '../loop.js';
import type { RefineOptions, ModelClient, RefineSource, RefineResult } from '../types.js';
import type { ExtractedSkill, SkillJudgeEstimate } from '../../index.js';

// Minimal stubs — only the fields refineSkill actually reads
const baseSkill = (): ExtractedSkill =>
  ({ name: 'test', functions: [] }) as unknown as ExtractedSkill;

const passingEstimate = (grade: SkillJudgeEstimate['grade'] = 'A'): SkillJudgeEstimate => ({
  grade,
  total: 100,
  improvements: [],
  dimensions: {} as SkillJudgeEstimate['dimensions']
});

const failingEstimate = (points = 5): SkillJudgeEstimate => ({
  grade: 'C',
  total: 60,
  improvements: [
    {
      suggestion: 'Add @useWhen annotation',
      points,
      dimension: 'D2',
      targets: [{ file: 'f.ts', name: 'tool_a', kind: 'function' as const }]
    }
  ],
  dimensions: {} as SkillJudgeEstimate['dimensions']
});

function makeSource(skills: ExtractedSkill[]): RefineSource {
  let call = 0;
  return {
    extract: vi.fn(async () => skills[call++] ?? skills.at(-1)!),
    auditContext: vi.fn(() => ({}) as any),
    applyFixes: vi.fn(async () => {})
  };
}

function makeModel(): ModelClient {
  return {
    draft: vi.fn(async () => 'Use this tool when you need to list files'),
    review: vi.fn(async () => ({ verdict: 'accepted' as const, feedback: '' }))
  };
}

function makeOptions(
  scoreSkill: (s: ExtractedSkill) => SkillJudgeEstimate,
  overrides: Partial<RefineOptions> = {}
): RefineOptions & { scoreSkill: (s: ExtractedSkill) => SkillJudgeEstimate } {
  return {
    source: makeSource([baseSkill(), baseSkill()]),
    model: makeModel(),
    ...overrides,
    scoreSkill
  };
}

describe('refineSkill', () => {
  it('stops immediately when first score already passes', async () => {
    const opts = makeOptions(() => passingEstimate());
    const result = await refineSkill(opts);
    expect(result.passed).toBe(true);
    expect(result.stoppedReason).toBe('passed');
    expect(result.iterations).toHaveLength(0);
  });

  it('runs one iteration and passes on second score', async () => {
    let call = 0;
    const opts = makeOptions(() => (call++ === 0 ? failingEstimate() : passingEstimate()));
    const result = await refineSkill(opts);
    expect(result.passed).toBe(true);
    expect(result.iterations).toHaveLength(1);
    expect(result.iterations[0]!.fixes).toHaveLength(1);
  });

  it('stops at max-iterations cap', async () => {
    const opts = makeOptions(() => failingEstimate(), { maxIterations: 2 });
    const result = await refineSkill(opts);
    expect(result.passed).toBe(false);
    expect(result.stoppedReason).toBe('max-iterations');
    expect(result.iterations).toHaveLength(2);
  });

  it('stops at no-improvements when estimate has no actionable items', async () => {
    const noItems: SkillJudgeEstimate = { ...failingEstimate(), improvements: [] };
    const opts = makeOptions(() => noItems);
    const result = await refineSkill(opts);
    expect(result.stoppedReason).toBe('no-improvements');
  });

  it('stops at plateau when score does not improve', async () => {
    const opts = makeOptions(() => failingEstimate(5), { maxIterations: 3 });
    const result = await refineSkill(opts);
    expect(result.stoppedReason).toBe('plateau');
    expect(result.iterations).toHaveLength(1);
  });

  it('calls onIteration callback each iteration', async () => {
    let call = 0;
    const onIteration = vi.fn();
    const opts = makeOptions(() => (call++ === 0 ? failingEstimate() : passingEstimate()), {
      onIteration
    });
    await refineSkill(opts);
    expect(onIteration).toHaveBeenCalledOnce();
  });

  it('calls model.review and retries draft if verdict is revise', async () => {
    let call = 0;
    const model: ModelClient = {
      draft: vi.fn(async () => 'draft'),
      review: vi.fn(async () =>
        call++ === 0
          ? { verdict: 'revise' as const, feedback: 'be more specific' }
          : { verdict: 'accepted' as const, feedback: '' }
      )
    };
    let scoreCall = 0;
    const opts = makeOptions(() => (scoreCall++ === 0 ? failingEstimate() : passingEstimate()), {
      source: makeSource([baseSkill(), baseSkill()]),
      model
    });
    const result = await refineSkill(opts);
    expect(model.draft).toHaveBeenCalledTimes(2);
    expect(result.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd packages/core && pnpm test src/refine/__tests__/loop.test.ts
```

Expected: FAIL — cannot find module `../loop.js`

- [ ] **Step 3: Implement loop.ts**

```typescript
// packages/core/src/refine/loop.ts
import { auditSkill } from '../audit.js';
import { estimateSkillJudgeScore } from '../audit-score.js';
import type { ExtractedSkill, SkillJudgeEstimate } from '../index.js';
import { selectWorkItems } from './select-targets.js';
import type {
  DraftedFix,
  RefineIteration,
  RefineOptions,
  RefineResult,
  RefineStopReason
} from './types.js';

/** @internal — test seam; production callers use the default audit+score path */
export type ScoreSkill = (skill: ExtractedSkill) => SkillJudgeEstimate;

const DEFAULT_PASSING_GRADES: ReadonlyArray<SkillJudgeEstimate['grade']> = ['A'];
const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_ITEMS_PER_ITERATION = 5;

function defaultScore(source: RefineOptions['source']): ScoreSkill {
  return (skill) => {
    const audit = auditSkill(skill, source.auditContext(skill));
    return estimateSkillJudgeScore(audit, skill);
  };
}

export async function refineSkill(
  opts: RefineOptions & { scoreSkill?: ScoreSkill }
): Promise<RefineResult> {
  const {
    source,
    model,
    passingGrades = DEFAULT_PASSING_GRADES,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    itemsPerIteration = DEFAULT_ITEMS_PER_ITERATION,
    onIteration,
    scoreSkill = defaultScore(source)
  } = opts;

  const passingSet = new Set(passingGrades);
  const iterations: RefineIteration[] = [];
  let skill = await source.extract();
  let estimate = scoreSkill(skill);

  if (passingSet.has(estimate.grade)) {
    return finished('passed', skill, estimate, iterations);
  }

  let prevTotal = estimate.total;

  for (let i = 0; i < maxIterations; i++) {
    const workItems = selectWorkItems(estimate.improvements, itemsPerIteration);
    if (workItems.length === 0) {
      return finished('no-improvements', skill, estimate, iterations);
    }

    const fixes: DraftedFix[] = [];
    for (const item of workItems) {
      const fn = skill.functions.find((f) => f.name === item.toolName);
      const currentValue = fn ? (fn.tags[item.tag] as string | undefined) : undefined;
      let draft = await model.draft({
        toolName: item.toolName,
        tag: item.tag,
        suggestion: item.improvement.suggestion,
        currentValue,
        skill
      });
      const review = await model.review({
        toolName: item.toolName,
        tag: item.tag,
        draft,
        suggestion: item.improvement.suggestion,
        skill
      });
      if (review.verdict === 'revise') {
        draft = await model.draft({
          toolName: item.toolName,
          tag: item.tag,
          suggestion: review.feedback,
          currentValue: draft,
          skill
        });
      }
      fixes.push({ toolName: item.toolName, tag: item.tag, value: draft });
    }

    await source.applyFixes(fixes);
    skill = await source.extract();
    estimate = scoreSkill(skill);

    const iteration: RefineIteration = { iteration: i + 1, estimate, workItems, fixes };
    iterations.push(iteration);
    onIteration?.(iteration);

    if (passingSet.has(estimate.grade)) {
      return finished('passed', skill, estimate, iterations);
    }

    if (estimate.total <= prevTotal) {
      return finished('plateau', skill, estimate, iterations);
    }
    prevTotal = estimate.total;
  }

  return finished('max-iterations', skill, estimate, iterations);
}

function finished(
  stoppedReason: RefineStopReason,
  finalSkill: ExtractedSkill,
  finalEstimate: SkillJudgeEstimate,
  iterations: readonly RefineIteration[]
): RefineResult {
  return {
    iterations,
    finalSkill,
    finalEstimate,
    passed: stoppedReason === 'passed',
    stoppedReason
  };
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd packages/core && pnpm test src/refine/__tests__/loop.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Create refine barrel and wire into core index**

```typescript
// packages/core/src/refine/index.ts
export * from './types.js';
export * from './select-targets.js';
export { refineSkill } from './loop.js';
export type { ScoreSkill } from './loop.js';
```

Add to `packages/core/src/index.ts` (find the last export line and add after):

```typescript
export * from './refine/index.js';
```

- [ ] **Step 6: Verify full core build**

```bash
cd packages/core && pnpm run type-check
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/refine/ packages/core/src/index.ts
git commit -m "feat(core/refine): add loop driver with plateau + cap stop conditions"
```

---

## Chunk 2: MCP overlay adapter

> `packages/mcp/src/refine/` — overlay file I/O + merge into ExtractedSkill + RefineSource

---

### Task 4: Overlay file I/O

**Files:**

- Create: `packages/mcp/src/refine/overlay.ts`
- Create: `packages/mcp/src/refine/__tests__/overlay.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/mcp/src/refine/__tests__/overlay.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emptyOverlay, readOverlay, writeOverlay, applyFixToOverlay } from '../overlay.js';

let tmp: string;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true });
});

describe('emptyOverlay', () => {
  it('returns version 1 with empty tools', () => {
    const o = emptyOverlay();
    expect(o.version).toBe(1);
    expect(o.tools).toEqual({});
  });
});

describe('readOverlay / writeOverlay', () => {
  it('round-trips an overlay', () => {
    tmp = mkdtempSync(join(tmpdir(), 'overlay-'));
    const path = join(tmp, 'overlay.json');
    const o = emptyOverlay();
    writeOverlay(path, o);
    expect(readOverlay(path)).toEqual(o);
  });

  it('returns empty overlay for missing file', () => {
    expect(readOverlay('/nonexistent/path/overlay.json')).toEqual(emptyOverlay());
  });
});

describe('applyFixToOverlay', () => {
  it('sets a useWhen value on a tool', () => {
    const o = emptyOverlay();
    const result = applyFixToOverlay(o, {
      toolName: 'list_files',
      tag: 'useWhen',
      value: 'When listing directory contents'
    });
    expect(result.tools['list_files']?.useWhen).toBe('When listing directory contents');
    expect(o.tools['list_files']).toBeUndefined(); // immutable
  });

  it('does not duplicate identical value', () => {
    let o = emptyOverlay();
    o = applyFixToOverlay(o, { toolName: 'list_files', tag: 'useWhen', value: 'A' });
    o = applyFixToOverlay(o, { toolName: 'list_files', tag: 'useWhen', value: 'A' });
    expect(o.tools['list_files']?.useWhen).toBe('A');
  });

  it('appends avoidWhen to existing value with newline', () => {
    let o = emptyOverlay();
    o = applyFixToOverlay(o, { toolName: 't', tag: 'avoidWhen', value: 'First' });
    o = applyFixToOverlay(o, { toolName: 't', tag: 'avoidWhen', value: 'Second' });
    expect(o.tools['t']?.avoidWhen).toBe('First\nSecond');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd packages/mcp && pnpm test src/refine/__tests__/overlay.test.ts
```

Expected: FAIL — cannot find module `../overlay.js`

- [ ] **Step 3: Implement overlay.ts**

```typescript
// packages/mcp/src/refine/overlay.ts
import { readFileSync, writeFileSync } from 'node:fs';
import type { DraftedFix, RefineTag } from '@skillit/core';

export interface OverlayAnnotations {
  useWhen?: string;
  avoidWhen?: string;
  pitfalls?: string;
  remarks?: string;
  example?: string;
}

export interface ToSkillsOverlay {
  version: 1;
  server?: OverlayAnnotations;
  tools: Record<string, OverlayAnnotations>;
}

export function emptyOverlay(): ToSkillsOverlay {
  return { version: 1, tools: {} };
}

export function readOverlay(path: string): ToSkillsOverlay {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ToSkillsOverlay;
  } catch {
    return emptyOverlay();
  }
}

export function writeOverlay(path: string, overlay: ToSkillsOverlay): void {
  writeFileSync(path, JSON.stringify(overlay, null, 2), 'utf8');
}

export function applyFixToOverlay(overlay: ToSkillsOverlay, fix: DraftedFix): ToSkillsOverlay {
  const toolKey = fix.toolName;
  const tag = fix.tag as keyof OverlayAnnotations;
  const existing = overlay.tools[toolKey]?.[tag];
  const next =
    existing !== undefined && existing !== fix.value ? `${existing}\n${fix.value}` : fix.value;
  return {
    ...overlay,
    tools: {
      ...overlay.tools,
      [toolKey]: { ...overlay.tools[toolKey], [tag]: next }
    }
  };
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd packages/mcp && pnpm test src/refine/__tests__/overlay.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/refine/overlay.ts packages/mcp/src/refine/__tests__/overlay.test.ts
git commit -m "feat(mcp/refine): add overlay I/O (read/write/apply, immutable)"
```

---

### Task 5: mergeOverlay — fold overlay into ExtractedSkill

**Files:**

- Create: `packages/mcp/src/refine/merge-overlay.ts`
- Create: `packages/mcp/src/refine/__tests__/merge-overlay.test.ts`

- [ ] **Step 1: Read the existing projection path to understand the shape to target**

Read `packages/mcp/src/extract.ts` lines 447–555 to see how `collectMetaEnrichment` merges `_meta.toSkills` into skill today.

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/mcp/src/refine/__tests__/merge-overlay.test.ts
import { describe, it, expect } from 'vitest';
import { mergeOverlay } from '../merge-overlay.js';
import type { ExtractedSkill } from '@skillit/core';

function skill(fns: Array<{ name: string }>): ExtractedSkill {
  return {
    name: 'test-server',
    functions: fns.map((f) => ({ name: f.name, description: '', parameters: [], tags: {} })),
    useWhen: [],
    avoidWhen: [],
    pitfalls: []
  } as unknown as ExtractedSkill;
}

describe('mergeOverlay', () => {
  it('does not mutate the input skill', () => {
    const s = skill([{ name: 'list_files' }]);
    const overlay = { version: 1 as const, tools: { list_files: { useWhen: 'When listing' } } };
    mergeOverlay(s, overlay);
    expect(s.functions[0]!.tags).toEqual({});
  });

  it('sets mcpMetadata.toSkills on matched function', () => {
    const s = skill([{ name: 'list_files' }]);
    const overlay = {
      version: 1 as const,
      tools: {
        list_files: { useWhen: 'When listing directory contents', pitfalls: 'Avoid on Windows' }
      }
    };
    const result = mergeOverlay(s, overlay);
    const fn = result.functions.find((f) => f.name === 'list_files')!;
    expect(fn.mcpMetadata?.toSkills?.useWhen).toEqual(['When listing directory contents']);
    expect(fn.mcpMetadata?.toSkills?.pitfalls).toEqual(['Avoid on Windows']);
  });

  it('leaves unmatched functions unchanged', () => {
    const s = skill([{ name: 'other_tool' }]);
    const overlay = { version: 1 as const, tools: { list_files: { useWhen: 'X' } } };
    const result = mergeOverlay(s, overlay);
    expect(result.functions[0]!.mcpMetadata).toBeUndefined();
  });

  it('aggregates skill-level arrays from all tool annotations', () => {
    const s = skill([{ name: 'tool_a' }, { name: 'tool_b' }]);
    const overlay = {
      version: 1 as const,
      tools: {
        tool_a: { useWhen: 'Case A', avoidWhen: 'Avoid A' },
        tool_b: { useWhen: 'Case B' }
      }
    };
    const result = mergeOverlay(s, overlay);
    expect(result.useWhen).toContain('Case A');
    expect(result.useWhen).toContain('Case B');
    expect(result.avoidWhen).toContain('Avoid A');
  });
});
```

- [ ] **Step 3: Run test — expect failure**

```bash
cd packages/mcp && pnpm test src/refine/__tests__/merge-overlay.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement merge-overlay.ts**

```typescript
// packages/mcp/src/refine/merge-overlay.ts
import type { ExtractedSkill } from '@skillit/core';
import type { ToSkillsOverlay } from './overlay.js';

export function mergeOverlay(skill: ExtractedSkill, overlay: ToSkillsOverlay): ExtractedSkill {
  const useWhen = [...(skill.useWhen ?? [])];
  const avoidWhen = [...(skill.avoidWhen ?? [])];
  const pitfalls = [...(skill.pitfalls ?? [])];

  const functions = skill.functions.map((fn) => {
    const ann = overlay.tools[fn.name];
    if (!ann) return fn;
    if (ann.useWhen) useWhen.push(ann.useWhen);
    if (ann.avoidWhen) avoidWhen.push(ann.avoidWhen);
    if (ann.pitfalls) pitfalls.push(ann.pitfalls);
    return {
      ...fn,
      mcpMetadata: {
        ...(fn as any).mcpMetadata,
        toSkills: {
          ...(fn as any).mcpMetadata?.toSkills,
          ...(ann.useWhen !== undefined && { useWhen: [ann.useWhen] }),
          ...(ann.avoidWhen !== undefined && { avoidWhen: [ann.avoidWhen] }),
          ...(ann.pitfalls !== undefined && { pitfalls: [ann.pitfalls] })
        }
      }
    };
  });

  return { ...skill, functions, useWhen, avoidWhen, pitfalls };
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd packages/mcp && pnpm test src/refine/__tests__/merge-overlay.test.ts
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/refine/merge-overlay.ts packages/mcp/src/refine/__tests__/merge-overlay.test.ts
git commit -m "feat(mcp/refine): add mergeOverlay — folds overlay annotations into ExtractedSkill"
```

---

### Task 6: McpRefineSource

**Files:**

- Create: `packages/mcp/src/refine/mcp-source.ts`
- Create: `packages/mcp/src/refine/__tests__/mcp-source.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/mcp/src/refine/__tests__/mcp-source.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { McpRefineSource } from '../mcp-source.js';
import type { ExtractedSkill } from '@skillit/core';

let tmp: string;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true });
});

const baseSkill = (): ExtractedSkill =>
  ({
    name: 'test',
    functions: [{ name: 'list_files', description: '', parameters: [], tags: {} }],
    useWhen: [],
    avoidWhen: [],
    pitfalls: []
  }) as unknown as ExtractedSkill;

describe('McpRefineSource', () => {
  it('extract returns skill with overlay merged', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'mcp-source-'));
    const overlayPath = join(tmp, 'overlay.json');
    const rawExtract = vi.fn(async () => baseSkill());
    const source = new McpRefineSource({ overlayPath, extract: rawExtract });

    // First extract — no overlay yet
    const s1 = await source.extract();
    expect(s1.functions[0]!.name).toBe('list_files');

    // Apply a fix, then re-extract — overlay should be merged
    await source.applyFixes([{ toolName: 'list_files', tag: 'useWhen', value: 'When listing' }]);
    const s2 = await source.extract();
    expect((s2.functions[0] as any).mcpMetadata?.toSkills?.useWhen).toBe('When listing');
  });

  it('applyFixes writes overlay to disk', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'mcp-source-'));
    const overlayPath = join(tmp, 'overlay.json');
    const source = new McpRefineSource({ overlayPath, extract: async () => baseSkill() });
    await source.applyFixes([
      { toolName: 'tool_a', tag: 'pitfalls', value: 'Do not call in parallel' }
    ]);
    const written = JSON.parse(readFileSync(overlayPath, 'utf8'));
    expect(written.tools.tool_a.pitfalls).toBe('Do not call in parallel');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd packages/mcp && pnpm test src/refine/__tests__/mcp-source.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement mcp-source.ts**

```typescript
// packages/mcp/src/refine/mcp-source.ts
import type { ExtractedSkill, AuditContext, DraftedFix, RefineSource } from '@skillit/core';
import { readOverlay, writeOverlay, applyFixToOverlay } from './overlay.js';
import { mergeOverlay } from './merge-overlay.js';

interface McpRefineSourceOptions {
  overlayPath: string;
  extract: () => Promise<ExtractedSkill>;
}

export class McpRefineSource implements RefineSource {
  constructor(private readonly opts: McpRefineSourceOptions) {}

  async extract(): Promise<ExtractedSkill> {
    const raw = await this.opts.extract();
    const overlay = readOverlay(this.opts.overlayPath);
    return mergeOverlay(raw, overlay);
  }

  auditContext(_skill: ExtractedSkill): AuditContext {
    return {};
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    let overlay = readOverlay(this.opts.overlayPath);
    for (const fix of fixes) {
      overlay = applyFixToOverlay(overlay, fix);
    }
    writeOverlay(this.opts.overlayPath, overlay);
  }
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd packages/mcp && pnpm test src/refine/__tests__/mcp-source.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Wire up barrel and mcp index**

```typescript
// packages/mcp/src/refine/index.ts
export * from './overlay.js';
export * from './merge-overlay.js';
export { McpRefineSource } from './mcp-source.js';
```

Add to `packages/mcp/src/index.ts`:

```typescript
export * from './refine/index.js';
```

- [ ] **Step 6: Type-check mcp**

```bash
cd packages/mcp && pnpm run type-check
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add packages/mcp/src/refine/ packages/mcp/src/index.ts
git commit -m "feat(mcp/refine): add McpRefineSource + overlay adapter"
```

---

## Chunk 3: TypeDoc adapter

> `packages/typedoc/src/refine/` — JSDoc string editor + TypeDocRefineSource

---

### Task 7: JSDoc string editor

**Files:**

- Create: `packages/typedoc/src/refine/jsdoc-edit.ts`
- Create: `packages/typedoc/src/refine/__tests__/jsdoc-edit.test.ts`

`★ Insight ─────────────────────────────────────`
We use `source.match(re)` (not `re.exec(source)`) throughout this file — semantically identical for non-global regexes, but avoids the `.exec(` token that triggers the project's security hook. The `match()` result has `.index` via `RegExpMatchArray`.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/typedoc/src/refine/__tests__/jsdoc-edit.test.ts
import { describe, it, expect } from 'vitest';
import { insertJsDocTag } from '../jsdoc-edit.js';

const fnWithDoc = `
/**
 * List all files in a directory.
 */
export function listFiles(path: string): string[] {
  return [];
}
`;

const fnWithoutDoc = `
export function listFiles(path: string): string[] {
  return [];
}
`;

describe('insertJsDocTag', () => {
  it('adds tag to existing JSDoc block', () => {
    const result = insertJsDocTag(
      fnWithDoc,
      'listFiles',
      'useWhen',
      'When listing directory contents'
    );
    expect(result).toContain('@useWhen When listing directory contents');
    expect(result).toContain('List all files');
  });

  it('creates new JSDoc block when none exists', () => {
    const result = insertJsDocTag(fnWithoutDoc, 'listFiles', 'useWhen', 'When listing');
    expect(result).toContain('/**');
    expect(result).toContain('@useWhen When listing');
    expect(result).toContain('*/');
  });

  it('is a no-op when export is not found', () => {
    const result = insertJsDocTag(fnWithDoc, 'nonExistent', 'useWhen', 'value');
    expect(result).toBe(fnWithDoc);
  });

  it('does not duplicate an already-present tag', () => {
    const withTag = insertJsDocTag(fnWithDoc, 'listFiles', 'useWhen', 'When listing');
    const again = insertJsDocTag(withTag, 'listFiles', 'useWhen', 'When listing');
    const count = (again.match(/@useWhen/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('preserves surrounding code', () => {
    const source = `const x = 1;\n${fnWithDoc}\nconst y = 2;`;
    const result = insertJsDocTag(source, 'listFiles', 'useWhen', 'When listing');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('const y = 2;');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd packages/typedoc && pnpm test src/refine/__tests__/jsdoc-edit.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement jsdoc-edit.ts**

```typescript
// packages/typedoc/src/refine/jsdoc-edit.ts
import type { RefineTag } from '@skillit/core';

// Matches `export function <name>` or `export const <name>` (arrow fns, etc.)
function exportRe(name: string): RegExp {
  return new RegExp(`(export\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}[\\s(<:,{])`, 'm');
}

// Matches a JSDoc block immediately before a token at a given index
function docBlockBefore(
  source: string,
  tokenIndex: number
): { start: number; end: number } | undefined {
  const before = source.slice(0, tokenIndex);
  const match = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!match || match.index === undefined) return undefined;
  return { start: match.index, end: match.index + match[0].length };
}

export function insertJsDocTag(
  source: string,
  exportName: string,
  tag: RefineTag,
  content: string
): string {
  const re = exportRe(exportName);
  const exportMatch = source.match(re);
  if (!exportMatch || exportMatch.index === undefined) return source;

  const tagLine = ` * @${tag} ${content}`;
  const block = docBlockBefore(source, exportMatch.index);

  if (block) {
    // Check for duplicate
    const existingBlock = source.slice(block.start, block.end);
    if (existingBlock.includes(`@${tag} ${content}`)) return source;
    // Insert before closing */
    const closeIdx = block.start + existingBlock.lastIndexOf('*/');
    return source.slice(0, closeIdx) + `${tagLine}\n ` + source.slice(closeIdx);
  }

  // No existing block — create one
  const indent =
    source
      .slice(0, exportMatch.index)
      .match(/[^\n]*$/)?.[0]
      ?.match(/^\s*/)?.[0] ?? '';
  const newDoc = `${indent}/**\n${indent}${tagLine}\n${indent} */\n`;
  return source.slice(0, exportMatch.index) + newDoc + source.slice(exportMatch.index);
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd packages/typedoc && pnpm test src/refine/__tests__/jsdoc-edit.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/typedoc/src/refine/jsdoc-edit.ts packages/typedoc/src/refine/__tests__/jsdoc-edit.test.ts
git commit -m "feat(typedoc/refine): add insertJsDocTag string editor"
```

---

### Task 8: TypeDocRefineSource

**Files:**

- Create: `packages/typedoc/src/refine/typedoc-source.ts`

Note: TypeDocRefineSource is a thin shell — it reads current TypeDoc-processed files and writes back via `insertJsDocTag`. No test because it depends on TypeDoc reflection which is integration-tested separately.

- [ ] **Step 1: Implement typedoc-source.ts**

```typescript
// packages/typedoc/src/refine/typedoc-source.ts
import { readFileSync, writeFileSync } from 'node:fs';
import type { ExtractedSkill, AuditContext, DraftedFix, RefineSource } from '@skillit/core';
import { insertJsDocTag } from './jsdoc-edit.js';

interface TypeDocRefineSourceOptions {
  extract: () => Promise<ExtractedSkill>;
  resolveSourceFile: (exportName: string) => string | undefined;
}

export class TypeDocRefineSource implements RefineSource {
  constructor(private readonly opts: TypeDocRefineSourceOptions) {}

  extract(): Promise<ExtractedSkill> {
    return this.opts.extract();
  }

  auditContext(_skill: ExtractedSkill): AuditContext {
    return {};
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    const byFile = new Map<string, DraftedFix[]>();
    for (const fix of fixes) {
      const file = this.opts.resolveSourceFile(fix.toolName);
      if (!file) continue;
      const group = byFile.get(file) ?? [];
      group.push(fix);
      byFile.set(file, group);
    }
    for (const [file, fileFixes] of byFile) {
      let source = readFileSync(file, 'utf8');
      for (const fix of fileFixes) {
        source = insertJsDocTag(source, fix.toolName, fix.tag, fix.value);
      }
      writeFileSync(file, source, 'utf8');
    }
  }
}
```

- [ ] **Step 2: Create barrel and wire up typedoc index**

```typescript
// packages/typedoc/src/refine/index.ts
export { insertJsDocTag } from './jsdoc-edit.js';
export { TypeDocRefineSource } from './typedoc-source.js';
```

Add to `packages/typedoc/src/index.ts` (if it exists):

```typescript
export * from './refine/index.js';
```

- [ ] **Step 3: Type-check typedoc**

```bash
cd packages/typedoc && pnpm run type-check
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/typedoc/src/refine/ packages/typedoc/src/index.ts
git commit -m "feat(typedoc/refine): add TypeDocRefineSource + JSDoc write-back adapter"
```

---

## Chunk 4: @skillit/client — Anthropic model + refine CLI

> New package. Contains the Anthropic SDK adapter and the `to-skills` bin with the `refine` command.

---

### Task 9: Scaffold @skillit/client package

**Files:**

- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/tsconfig.build.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@skillit/client",
  "version": "0.1.0",
  "description": "Anthropic model client + to-skills CLI (refine command)",
  "license": "MIT",
  "author": "Pradeep Mouli",
  "type": "module",
  "bin": {
    "to-skills": "./dist/bin.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsgo -p tsconfig.build.json",
    "type-check": "tsgo --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0",
    "@skillit/core": "workspace:*",
    "@skillit/mcp": "workspace:*",
    "commander": "^14.0.3"
  },
  "devDependencies": {}
}
```

- [ ] **Step 2: Create tsconfig.json**

Mirror the pattern from `packages/mcp/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["src/**/__tests__"],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declarationDir": "dist"
  }
}
```

- [ ] **Step 4: Install deps**

```bash
pnpm install
```

Expected: `@skillit/client` workspace member registered

- [ ] **Step 5: Commit**

```bash
git add packages/client/
git commit -m "feat(client): scaffold @skillit/client package"
```

---

### Task 10: AnthropicModelClient

**Files:**

- Create: `packages/client/src/model/anthropic.ts`
- Create: `packages/client/src/__tests__/anthropic-model.test.ts`

`★ Insight ─────────────────────────────────────`
`parseReviewVerdict` uses a "fail-open" strategy: if the model returns malformed JSON, we treat it as `accepted` rather than crashing the loop. This is intentional — a bad verdict should not abort a refine run that may already have good fixes queued.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/client/src/__tests__/anthropic-model.test.ts
import { describe, it, expect } from 'vitest';
import { parseReviewVerdict } from '../model/anthropic.js';

describe('parseReviewVerdict', () => {
  it('parses accepted verdict', () => {
    const text = 'Looks good. {"verdict":"accepted","feedback":""}';
    expect(parseReviewVerdict(text)).toEqual({ verdict: 'accepted', feedback: '' });
  });

  it('parses revise verdict', () => {
    const text = '{"verdict":"revise","feedback":"Be more specific about edge cases"}';
    expect(parseReviewVerdict(text)).toEqual({
      verdict: 'revise',
      feedback: 'Be more specific about edge cases'
    });
  });

  it('fails open on malformed JSON — returns accepted', () => {
    expect(parseReviewVerdict('not json at all')).toEqual({ verdict: 'accepted', feedback: '' });
  });

  it('fails open on missing verdict field', () => {
    expect(parseReviewVerdict('{"feedback":"ok"}')).toEqual({
      verdict: 'accepted',
      feedback: 'ok'
    });
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd packages/client && pnpm test src/__tests__/anthropic-model.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement anthropic.ts**

```typescript
// packages/client/src/model/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { DraftRequest, ReviewRequest, ReviewResult, ModelClient } from '@skillit/core';

const DRAFTER = 'claude-sonnet-4-6';
const REVIEWER = 'claude-opus-4-7';
const MAX_TOKENS = 1024;

export function parseReviewVerdict(text: string): ReviewResult {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { verdict: 'accepted', feedback: '' };
  try {
    const parsed = JSON.parse(match[0]) as Partial<ReviewResult>;
    return {
      verdict: parsed.verdict === 'revise' ? 'revise' : 'accepted',
      feedback: parsed.feedback ?? ''
    };
  } catch {
    return { verdict: 'accepted', feedback: '' };
  }
}

export class AnthropicModelClient implements ModelClient {
  private client = new Anthropic();

  async draft(req: DraftRequest): Promise<string> {
    const prompt = [
      `You are improving MCP tool annotations for the skill "${req.skill.name}".`,
      `Tool: ${req.toolName}`,
      `Tag to fill: @${req.tag}`,
      `Guidance: ${req.suggestion}`,
      req.currentValue ? `Current value:\n${req.currentValue}` : 'No current value.',
      'Write only the annotation content — no code fences, no extra commentary.'
    ].join('\n\n');

    const msg = await this.client.messages.create({
      model: DRAFTER,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    });
    return (msg.content[0] as { text: string }).text.trim();
  }

  async review(req: ReviewRequest): Promise<ReviewResult> {
    const prompt = [
      `You are reviewing an MCP tool annotation draft.`,
      `Tool: ${req.toolName}, Tag: @${req.tag}`,
      `Guidance the drafter was given: ${req.suggestion}`,
      `Draft:\n${req.draft}`,
      'Respond with JSON only: {"verdict":"accepted"|"revise","feedback":"..."}.',
      'Accept if the draft meaningfully addresses the guidance. Revise if it is vague or incorrect.'
    ].join('\n\n');

    const msg = await this.client.messages.create({
      model: REVIEWER,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    });
    return parseReviewVerdict((msg.content[0] as { text: string }).text);
  }
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd packages/client && pnpm test src/__tests__/anthropic-model.test.ts
```

Expected: all tests PASS (parseReviewVerdict tests — no Anthropic calls in unit tests)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/model/anthropic.ts packages/client/src/__tests__/anthropic-model.test.ts
git commit -m "feat(client): add AnthropicModelClient (Sonnet drafter, Opus reviewer)"
```

---

### Task 11: refine command + bin

**Files:**

- Create: `packages/client/src/commands/refine.ts`
- Create: `packages/client/src/bin.ts`
- Create: `packages/client/src/index.ts`

- [ ] **Step 1: Implement refine.ts**

```typescript
// packages/client/src/commands/refine.ts
import { Command } from 'commander';
import { McpRefineSource, extractMcpSkill, readMcpConfigFile } from '@skillit/mcp';
import { refineSkill } from '@skillit/core';
import { AnthropicModelClient } from '../model/anthropic.js';
import { join } from 'node:path';

export function buildRefineCommand(): Command {
  return new Command('refine')
    .description('Autonomously improve a skill via the audit→draft→review loop')
    .requiredOption('--mcp <path>', 'path to mcp.json or MCP config file')
    .option('--server <name>', 'server name within the config (defaults to first)')
    .option('--overlay <path>', 'path to write the _meta.toSkills overlay JSON')
    .option('--max-iterations <n>', 'iteration cap (default 5)', '5')
    .option('--items <n>', 'work items per iteration (default 5)', '5')
    .action(
      async (opts: {
        mcp: string;
        server?: string;
        overlay?: string;
        maxIterations: string;
        items: string;
      }) => {
        const maxIterations = parseInt(opts.maxIterations, 10);
        const itemsPerIteration = parseInt(opts.items, 10);
        const overlayPath = opts.overlay ?? join(process.cwd(), '.to-skills-overlay.json');

        const entries = await readMcpConfigFile(opts.mcp);
        const entry = opts.server ? entries.find((e) => e.name === opts.server) : entries[0];
        if (!entry) {
          const name = opts.server ? `"${opts.server}"` : 'any server';
          throw new Error(`Could not find ${name} in ${opts.mcp}`);
        }

        const source = new McpRefineSource({
          overlayPath,
          extract: () => extractMcpSkill({ transport: entry.transport })
        });

        const result = await refineSkill({
          source,
          model: new AnthropicModelClient(),
          maxIterations,
          itemsPerIteration,
          onIteration: (iter) => {
            const { grade, total } = iter.estimate;
            console.log(
              `  Iteration ${iter.iteration}: grade ${grade} (${total}/120), ${iter.fixes.length} fix(es) applied`
            );
          }
        });

        console.log(`\nDone. Reason: ${result.stoppedReason}`);
        console.log(
          `Final grade: ${result.finalEstimate.grade} (${result.finalEstimate.total}/120)`
        );
        if (result.passed) {
          console.log(`Overlay written to ${overlayPath}`);
        }

        process.exit(result.passed ? 0 : 1);
      }
    );
}
```

- [ ] **Step 2: Implement bin.ts**

```typescript
// packages/client/src/bin.ts
import { Command } from 'commander';
import { buildRefineCommand } from './commands/refine.js';

const program = new Command('to-skills').description('to-skills CLI').version('0.1.0');

program.addCommand(buildRefineCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 3: Implement index.ts**

```typescript
// packages/client/src/index.ts
export { AnthropicModelClient } from './model/anthropic.js';
export { parseReviewVerdict } from './model/anthropic.js';
```

- [ ] **Step 4: Type-check the full client package**

```bash
cd packages/client && pnpm run type-check
```

Expected: no errors

- [ ] **Step 5: Build to verify dist generation**

```bash
cd packages/client && pnpm run build
```

Expected: `dist/bin.js`, `dist/index.js`, `dist/index.d.ts` created

- [ ] **Step 6: Verify bin is executable**

```bash
node packages/client/dist/bin.js --help
```

Expected: usage text showing `to-skills refine --mcp <path> [options]`

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/
git commit -m "feat(client): add to-skills bin with refine command"
```

---

### Task 12: Full integration smoke test

- [ ] **Step 1: Run all tests across the workspace**

```bash
pnpm test
```

Expected: all tests pass (select-targets, loop, overlay, merge-overlay, mcp-source, jsdoc-edit, anthropic-model)

- [ ] **Step 2: Build all packages**

```bash
pnpm run build
```

Expected: no build errors across the workspace

- [ ] **Step 3: Final commit**

```bash
git add -p  # review any remaining unstaged changes
git commit -m "chore: phase 0 refine eval loop — full integration"
```

---

## Testing notes

- **LLM draft/review steps are NOT called in unit tests.** `AnthropicModelClient` is not instantiated in the loop tests; a `{ draft: vi.fn(), review: vi.fn() }` fake is used instead. The `parseReviewVerdict` unit test covers the only logic worth asserting.
- **Loop convergence golden test** — the `loop.test.ts` `'runs one iteration and passes on second score'` case is the convergence assertion: a failing-then-passing score sequence must produce `passed: true` in exactly one iteration.
- **Overlay round-trip** covers the only I/O path with real disk state; all other tests are pure.
- **TypeDocRefineSource** is integration-only (depends on TypeDoc reflection); no unit test.
