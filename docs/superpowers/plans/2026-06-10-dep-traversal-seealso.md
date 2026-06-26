# Dep-Traversal seeAlso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When generating a skill, walk the package's direct `dependencies`, find any co-located skills, and emit a `## See Also` section that links to them — enabling agents to discover sibling skills (e.g. an agent using `lspeasy-cli` discovers the `lspeasy-core` NEVER rules).

**Architecture:** A new `discoverDepSkillsSync` / `discoverDepSkills` helper (one sync, one async wrapper) in `@skillit/core` reads `package.json#dependencies`, checks each dep for `skillit.skills` or the `skills/*/SKILL.md` convention, and returns `DepSkillRef[]`. Each of the four generate pipelines (cli, config, typedoc, mcp-gen, mcp-bundle) calls this helper immediately after extraction and stores the result on the IR (`skill.seeAlso`, `skill.rootDir`). The renderer emits `## See Also` between `## NEVER` and `## Troubleshooting`. The audit engine gains a synchronous `W12` check that compares on-disk dep skills against `skill.seeAlso` and surfaces missing entries as D3 improvements.

**Tech Stack:** TypeScript 5 strict, Node.js `node:fs` sync APIs for discovery, Vitest, pnpm workspaces.

---

## File Manifest

| File                                                    | Action                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/core/src/types.ts`                            | Add `DepSkillRef` interface; add `seeAlso?` + `rootDir?` to `ExtractedSkill` |
| `packages/core/src/index.ts`                            | Re-export `DepSkillRef` type                                                 |
| `packages/core/src/refine/dep-skills.ts`                | **New** — `discoverDepSkillsSync` + `discoverDepSkills`                      |
| `packages/core/src/refine/index.ts`                     | Export both discovery fns                                                    |
| `packages/core/src/refine/__tests__/dep-skills.test.ts` | **New** — unit tests with tmp fixture dirs                                   |
| `packages/client/src/generate.ts`                       | Wire CLI + config pipelines                                                  |
| `packages/typedoc/src/plugin.ts`                        | Wire TypeDoc EVENT_RESOLVE_END handler (sync)                                |
| `packages/mcp/src/refine/factory.ts`                    | Wire MCP gen pipeline                                                        |
| `packages/mcp/src/bundle.ts`                            | Wire MCP bundle pipeline                                                     |
| `packages/core/src/renderer.ts`                         | Add `renderSeeAlso` + wire into `renderSkillMd`                              |
| `packages/core/src/audit.ts`                            | Add `checkW12` (sync, uses `discoverDepSkillsSync`)                          |
| `packages/core/src/audit-score.ts`                      | Add W12 to D3 scorer + improvement suggestion                                |

---

### Task 1: IR types — `DepSkillRef` + new `ExtractedSkill` fields

**Files:**

- Modify: `packages/core/src/types.ts:96-102`
- Modify: `packages/core/src/index.ts:17-51`

- [ ] **Step 1.1: Add `DepSkillRef` interface and two new fields to `ExtractedSkill`**

In `packages/core/src/types.ts`, add the interface before `ExtractedSkill` (around line 19) and two new optional fields after `setup?` (before `readonly audit?` at line 102):

```ts
// Add near line 19, before ExtractedSkill:
export interface DepSkillRef {
  /** Skill name from dep's SKILL.md frontmatter `name:` field. */
  name: string;
  /** Agent-loadable path relative to project root, e.g. `node_modules/@lspeasy/core/skills/lspeasy-core` */
  path: string;
  /** Description from dep's SKILL.md frontmatter `description:` field, if present. */
  description?: string;
}
```

In `ExtractedSkill`, after `setup?: SkillSetup;` (before `readonly audit?`):

```ts
  /** Skills from direct dependencies cross-referenced in ## See Also. */
  seeAlso?: DepSkillRef[];
  /** Absolute path to the package root — used by audit for dep-skill discovery. */
  rootDir?: string;
```

- [ ] **Step 1.2: Re-export `DepSkillRef` from `packages/core/src/index.ts`**

In the existing `export type { ..., McpAuditIssue } from './types.js'` block, add `DepSkillRef`:

```ts
export type {
  ExtractedSkill,
  // ... (all existing entries) ...
  McpAuditSeverity,
  McpAuditIssue,
  DepSkillRef // <-- add this
} from './types.js';
```

- [ ] **Step 1.3: Verify type-check passes**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/to-skills
pnpm run type-check
```

Expected: exits 0 (no new errors).

- [ ] **Step 1.4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): add DepSkillRef + seeAlso/rootDir to ExtractedSkill IR"
```

---

### Task 2: Discovery helper — `packages/core/src/refine/dep-skills.ts`

**Files:**

- Create: `packages/core/src/refine/dep-skills.ts`
- Modify: `packages/core/src/refine/index.ts`

- [ ] **Step 2.1: Create `dep-skills.ts`**

Create `packages/core/src/refine/dep-skills.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DepSkillRef } from '../types.js';

function extractFrontmatterField(content: string, field: string): string | undefined {
  const match = content.match(new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm'));
  if (!match) return undefined;
  // Strip surrounding quotes (single or double)
  return match[1].replace(/^["']|["']$/g, '');
}

function parseSkillMd(skillMdPath: string): Pick<DepSkillRef, 'name' | 'description'> | undefined {
  let content: string;
  try {
    content = readFileSync(skillMdPath, 'utf8');
  } catch {
    return undefined;
  }
  const name = extractFrontmatterField(content, 'name');
  if (!name) return undefined;
  const description = extractFrontmatterField(content, 'description');
  return { name, ...(description ? { description } : {}) };
}

function discoverForDep(pkgDir: string, depName: string): DepSkillRef[] {
  const depDir = join(pkgDir, 'node_modules', depName);
  if (!existsSync(depDir)) return [];

  const depPkgPath = join(depDir, 'package.json');
  if (!existsSync(depPkgPath)) return [];

  let depPkg: { skillit?: { skills?: unknown } } = {};
  try {
    depPkg = JSON.parse(readFileSync(depPkgPath, 'utf8')) as typeof depPkg;
  } catch {
    return [];
  }

  const skillDirs: string[] = [];

  const explicitSkills = depPkg.skillit?.skills;
  if (Array.isArray(explicitSkills) && explicitSkills.length > 0) {
    for (const relPath of explicitSkills) {
      if (typeof relPath === 'string') {
        skillDirs.push(join(depDir, relPath));
      }
    }
  } else {
    const skillsRoot = join(depDir, 'skills');
    if (existsSync(skillsRoot)) {
      let entries: ReturnType<typeof readdirSync>;
      try {
        entries = readdirSync(skillsRoot, { withFileTypes: true });
      } catch {
        return [];
      }
      for (const dirent of entries) {
        if (!dirent.isDirectory()) continue;
        const skillDir = join(skillsRoot, dirent.name);
        if (existsSync(join(skillDir, 'SKILL.md'))) {
          skillDirs.push(skillDir);
        }
      }
    }
  }

  const refs: DepSkillRef[] = [];
  for (const skillDir of skillDirs) {
    const parsed = parseSkillMd(join(skillDir, 'SKILL.md'));
    if (!parsed) continue;
    // Relative path from pkgDir, no leading './'
    const relativePath = skillDir.slice(pkgDir.length + 1);
    refs.push({
      name: parsed.name,
      path: relativePath,
      ...(parsed.description ? { description: parsed.description } : {})
    });
  }
  return refs;
}

/**
 * Synchronously discover skills in direct dependencies of the package at pkgDir.
 * Returns [] on any read/parse error — never throws.
 */
export function discoverDepSkillsSync(pkgDir: string): DepSkillRef[] {
  let pkg: { dependencies?: Record<string, string> } = {};
  try {
    pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as typeof pkg;
  } catch {
    return [];
  }
  const depNames = Object.keys(pkg.dependencies ?? {});
  const refs: DepSkillRef[] = [];
  for (const depName of depNames) {
    refs.push(...discoverForDep(pkgDir, depName));
  }
  return refs;
}

/**
 * Discover skills in direct dependencies of the package at pkgDir.
 * Returns [] on any read/parse error — never throws.
 */
export async function discoverDepSkills(pkgDir: string): Promise<DepSkillRef[]> {
  return discoverDepSkillsSync(pkgDir);
}
```

- [ ] **Step 2.2: Export from `packages/core/src/refine/index.ts`**

Append to the existing exports:

```ts
export { discoverDepSkills, discoverDepSkillsSync } from './dep-skills.js';
```

- [ ] **Step 2.3: Type-check**

```bash
pnpm run type-check
```

Expected: exits 0.

- [ ] **Step 2.4: Commit**

```bash
git add packages/core/src/refine/dep-skills.ts packages/core/src/refine/index.ts
git commit -m "feat(core): add discoverDepSkills helper for dep-skill cross-reference discovery"
```

---

### Task 3: Tests for `discoverDepSkills`

**Files:**

- Create: `packages/core/src/refine/__tests__/dep-skills.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `packages/core/src/refine/__tests__/dep-skills.test.ts`:

```ts
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverDepSkills } from '../dep-skills.js';

let tmpDir: string;
afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('discoverDepSkills', () => {
  it('returns [] when package.json is missing', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    expect(await discoverDepSkills(tmpDir)).toEqual([]);
  });

  it('returns [] when package.json has no dependencies field', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-pkg' }));
    expect(await discoverDepSkills(tmpDir)).toEqual([]);
  });

  it('returns [] when dep has no skills dir and no skillit.skills', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg', dependencies: { 'dep-a': '1.0.0' } })
    );
    await mkdir(join(tmpDir, 'node_modules', 'dep-a'), { recursive: true });
    await writeFile(
      join(tmpDir, 'node_modules', 'dep-a', 'package.json'),
      JSON.stringify({ name: 'dep-a' })
    );
    expect(await discoverDepSkills(tmpDir)).toEqual([]);
  });

  it('skips deps not installed (missing node_modules/<dep>)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg', dependencies: { 'not-installed': '1.0.0' } })
    );
    // No node_modules/not-installed created
    expect(await discoverDepSkills(tmpDir)).toEqual([]);
  });

  it('discovers dep skill by convention (skills/*/SKILL.md)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg', dependencies: { 'dep-a': '1.0.0' } })
    );
    const skillDir = join(tmpDir, 'node_modules', 'dep-a', 'skills', 'dep-a-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(tmpDir, 'node_modules', 'dep-a', 'package.json'),
      JSON.stringify({ name: 'dep-a' })
    );
    await writeFile(
      join(skillDir, 'SKILL.md'),
      ['---', 'name: dep-a-skill', 'description: The dep-a skill', '---', ''].join('\n')
    );
    expect(await discoverDepSkills(tmpDir)).toEqual([
      {
        name: 'dep-a-skill',
        path: 'node_modules/dep-a/skills/dep-a-skill',
        description: 'The dep-a skill'
      }
    ]);
  });

  it('uses skillit.skills field when present (overrides convention)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg', dependencies: { 'dep-b': '1.0.0' } })
    );
    const customDir = join(tmpDir, 'node_modules', 'dep-b', 'custom-skills', 'dep-b-core');
    await mkdir(customDir, { recursive: true });
    await writeFile(
      join(tmpDir, 'node_modules', 'dep-b', 'package.json'),
      JSON.stringify({ name: 'dep-b', skillit: { skills: ['custom-skills/dep-b-core'] } })
    );
    await writeFile(
      join(customDir, 'SKILL.md'),
      ['---', 'name: dep-b-core', 'description: Core dep-b', '---', ''].join('\n')
    );
    expect(await discoverDepSkills(tmpDir)).toEqual([
      {
        name: 'dep-b-core',
        path: 'node_modules/dep-b/custom-skills/dep-b-core',
        description: 'Core dep-b'
      }
    ]);
  });

  it('skips SKILL.md files with no name: field', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg', dependencies: { 'dep-c': '1.0.0' } })
    );
    const skillDir = join(tmpDir, 'node_modules', 'dep-c', 'skills', 'dep-c-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(tmpDir, 'node_modules', 'dep-c', 'package.json'),
      JSON.stringify({ name: 'dep-c' })
    );
    await writeFile(
      join(skillDir, 'SKILL.md'),
      ['---', 'description: No name field here', '---', ''].join('\n')
    );
    expect(await discoverDepSkills(tmpDir)).toEqual([]);
  });

  it('omits description field when not present in frontmatter', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg', dependencies: { 'dep-d': '1.0.0' } })
    );
    const skillDir = join(tmpDir, 'node_modules', 'dep-d', 'skills', 'dep-d-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(tmpDir, 'node_modules', 'dep-d', 'package.json'),
      JSON.stringify({ name: 'dep-d' })
    );
    await writeFile(join(skillDir, 'SKILL.md'), ['---', 'name: dep-d-skill', '---', ''].join('\n'));
    expect(await discoverDepSkills(tmpDir)).toEqual([
      { name: 'dep-d-skill', path: 'node_modules/dep-d/skills/dep-d-skill' }
    ]);
  });

  it('strips surrounding quotes from description value', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg', dependencies: { 'dep-e': '1.0.0' } })
    );
    const skillDir = join(tmpDir, 'node_modules', 'dep-e', 'skills', 'dep-e-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(tmpDir, 'node_modules', 'dep-e', 'package.json'),
      JSON.stringify({ name: 'dep-e' })
    );
    await writeFile(
      join(skillDir, 'SKILL.md'),
      ['---', 'name: dep-e-skill', 'description: "Quoted description"', '---', ''].join('\n')
    );
    expect(await discoverDepSkills(tmpDir)).toEqual([
      {
        name: 'dep-e-skill',
        path: 'node_modules/dep-e/skills/dep-e-skill',
        description: 'Quoted description'
      }
    ]);
  });

  it('returns refs for multiple deps', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg', dependencies: { 'dep-x': '1.0.0', 'dep-y': '1.0.0' } })
    );
    for (const dep of ['dep-x', 'dep-y']) {
      const skillDir = join(tmpDir, 'node_modules', dep, 'skills', `${dep}-skill`);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(tmpDir, 'node_modules', dep, 'package.json'),
        JSON.stringify({ name: dep })
      );
      await writeFile(
        join(skillDir, 'SKILL.md'),
        ['---', `name: ${dep}-skill`, '---', ''].join('\n')
      );
    }
    const result = await discoverDepSkills(tmpDir);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name).sort()).toEqual(['dep-x-skill', 'dep-y-skill']);
  });
});
```

- [ ] **Step 3.2: Run tests — expect FAIL (dep-skills.ts doesn't exist yet)**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/to-skills
pnpm test --filter @skillit/core -- dep-skills
```

Expected: import error or "cannot find module" — test file exists but no implementation yet.

(If Step 2 above is already done, the tests will run but some may fail depending on edge cases. That's fine — Task 3 validates correctness.)

- [ ] **Step 3.3: Run tests — expect PASS (after Task 2 implementation)**

```bash
pnpm test --filter @skillit/core -- dep-skills
```

Expected: all 9 tests pass.

- [ ] **Step 3.4: Commit**

```bash
git add packages/core/src/refine/__tests__/dep-skills.test.ts
git commit -m "test(core): add dep-skills discovery unit tests"
```

---

### Task 4: CLI + Config pipeline wiring

**Files:**

- Modify: `packages/client/src/generate.ts`

- [ ] **Step 4.1: Wire `discoverDepSkills` into `generateCliSkill`**

`generateCliSkill` (line 107) already computes `pkgDir` at line 110. Add the wiring after `applyNpxMode`, before `writeCliSkill`:

```ts
import { discoverDepSkills } from '@skillit/core';

// generateCliSkill — replace the function body:
export async function generateCliSkill(opts: GenerateSkillOpts): Promise<void> {
  const program = await loadProgram({ program: opts.program, cwd: opts.cwd });
  const skill = await extractCliSkill({ program, metadata: { name: opts.name } });
  const pkgDir = await findNearestPackageDir(opts.cwd);
  const meta = pkgDir ? await readPackageMetadata(pkgDir) : {};
  applyNpxMode(skill, meta, opts.invocationMode);
  if (pkgDir) {
    skill.rootDir = pkgDir;
    skill.seeAlso = await discoverDepSkills(pkgDir);
  }
  writeCliSkill(skill, { outDir: opts.outDir });
}
```

- [ ] **Step 4.2: Wire `discoverDepSkills` into `generateConfigSkill`**

`generateConfigSkill` needs a `pkgDir` from the config file location. Update the function:

```ts
import { dirname } from 'node:path';

// generateConfigSkill — replace the function body:
export async function generateConfigSkill(opts: GenerateConfigSkillOpts): Promise<void> {
  const skill = await new ConfigRefineSource({
    configFile: opts.configFile,
    typeName: opts.typeName,
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    description: `Configuration options for ${opts.typeName}.`
  }).extract();
  const pkgDir = await findNearestPackageDir(dirname(opts.configFile));
  if (pkgDir) {
    skill.rootDir = pkgDir;
    skill.seeAlso = await discoverDepSkills(pkgDir);
  }
  const rendered = renderSkills([skill], { outDir: opts.outDir, maxTokens: 16000 });
  writeSkills(rendered, { outDir: opts.outDir });
}
```

Also add `dirname` to the import at the top of the file:

```ts
import { dirname } from 'node:path';
```

And add `discoverDepSkills` to the `@skillit/core` import:

```ts
import {
  ConfigRefineSource,
  discoverDepSkills, // add
  findNearestPackageDir,
  readPackageMetadata,
  renderSkills,
  writeSkills
} from '@skillit/core';
```

- [ ] **Step 4.3: Type-check**

```bash
pnpm run type-check
```

Expected: exits 0.

- [ ] **Step 4.4: Commit**

```bash
git add packages/client/src/generate.ts
git commit -m "feat(client): populate skill.rootDir + skill.seeAlso in CLI and config gen pipelines"
```

---

### Task 5: TypeDoc plugin wiring

**Files:**

- Modify: `packages/typedoc/src/plugin.ts:373-387`

The `EVENT_RESOLVE_END` handler at line 322 is synchronous — TypeDoc does not support async event callbacks. We use `discoverDepSkillsSync`.

- [ ] **Step 5.1: Import `discoverDepSkillsSync` in the plugin**

In `packages/typedoc/src/plugin.ts`, add to the existing `@skillit/core` import:

```ts
import {
  // ... existing imports ...
  discoverDepSkillsSync // add
} from '@skillit/core';
```

(Search for the existing `import { ... } from '@skillit/core'` block and add `discoverDepSkillsSync` to it.)

- [ ] **Step 5.2: Wire into the enrichment loop**

In the `for (const skill of skills)` loop (lines 373–387), add after line 387 (end of the loop body, before the closing `}`):

```ts
for (const skill of skills) {
  // Per-skill package.json — override root metadata with per-package values
  const skillPkg = readPackageJsonForProject(skill.name);
  if (skillPkg) {
    if (skillPkg.description) skill.packageDescription = skillPkg.description;
    if (skillPkg.keywords) skill.keywords = skillPkg.keywords;
  }

  const readme = resolveReadmeForSkill(skill.name);
  if (readme?.quickStart && skill.examples.length === 0) {
    skill.examples.push(readme.quickStart);
  }
  if (readme?.features) skill.readmeFeatures ??= readme.features;
  if (readme?.troubleshooting) skill.readmeTroubleshooting ??= readme.troubleshooting;

  // Dep-skill cross-references — sync discovery, handler is synchronous
  const pkgDir = process.cwd();
  skill.rootDir = pkgDir;
  skill.seeAlso = discoverDepSkillsSync(pkgDir);
}
```

- [ ] **Step 5.3: Type-check**

```bash
pnpm run type-check
```

Expected: exits 0.

- [ ] **Step 5.4: Commit**

```bash
git add packages/typedoc/src/plugin.ts
git commit -m "feat(typedoc): populate skill.rootDir + skill.seeAlso in EVENT_RESOLVE_END handler"
```

---

### Task 6: MCP gen + bundle pipeline wiring

**Files:**

- Modify: `packages/mcp/src/refine/factory.ts:128-134`
- Modify: `packages/mcp/src/bundle.ts:116-162`

- [ ] **Step 6.1: Wire MCP gen pipeline in `factory.ts`**

In `packages/mcp/src/refine/factory.ts`, add imports at the top:

```ts
import { dirname } from 'node:path';
import { discoverDepSkills, findNearestPackageDir } from '@skillit/core';
```

(If `findNearestPackageDir` is already imported from `@skillit/core`, just add `discoverDepSkills`. If the file imports from `../../../packages/core/...` paths, adapt accordingly — check existing imports first.)

Update `generateMcpSkill`:

```ts
export async function generateMcpSkill(opts: GenerateMcpSkillOptions): Promise<void> {
  const entries = await readMcpConfigFile(opts.mcpPath);
  const entry = selectServerEntry(entries, opts.serverName);
  const skill = await extractMcpSkill({ transport: entry.transport });
  const pkgDir = await findNearestPackageDir(dirname(opts.mcpPath));
  if (pkgDir) {
    skill.rootDir = pkgDir;
    skill.seeAlso = await discoverDepSkills(pkgDir);
  }
  // renderAndWriteMcpSkill is synchronous (writeSkills is sync), so no await.
  renderAndWriteMcpSkill(skill, opts.outDir);
}
```

- [ ] **Step 6.2: Wire MCP bundle pipeline in `bundle.ts`**

In `packages/mcp/src/bundle.ts`, add import:

```ts
import { discoverDepSkills } from '@skillit/core';
```

In `processEntry`, after the `extractMcpSkill` try/catch block (after the `} catch (err) { recordFailure(...); return; }` closing brace, before `const auditIssues` at line 167), add:

```ts
// Populate dep-skill cross-references
const pkgDir = ctx.packageRoot;
skill.rootDir = pkgDir;
skill.seeAlso = await discoverDepSkills(pkgDir);
```

- [ ] **Step 6.3: Type-check**

```bash
pnpm run type-check
```

Expected: exits 0.

- [ ] **Step 6.4: Commit**

```bash
git add packages/mcp/src/refine/factory.ts packages/mcp/src/bundle.ts
git commit -m "feat(mcp): populate skill.rootDir + skill.seeAlso in MCP gen and bundle pipelines"
```

---

### Task 7: Renderer — `renderSeeAlso` + wire into `renderSkillMd`

**Files:**

- Modify: `packages/core/src/renderer.ts:578-587`

- [ ] **Step 7.1: Add `renderSeeAlso` function**

In `packages/core/src/renderer.ts`, add the following private function near the other `renderX` helpers (before `renderSkillMd` or after `renderNeverRules` — any nearby location works):

```ts
function renderSeeAlso(skill: ExtractedSkill): string {
  if (!skill.seeAlso || skill.seeAlso.length === 0) return '';
  const lines = ['## See Also\n'];
  for (const ref of skill.seeAlso) {
    const desc = ref.description ? ` — ${ref.description}` : '';
    lines.push(`- **${ref.name}** (\`${ref.path}\`)${desc}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 7.2: Wire `renderSeeAlso` into `renderSkillMd`**

In `renderSkillMd`, the current section order around lines 581–587 is:

```ts
const neverRules = renderNeverRules(skill);
if (neverRules) sections.push(neverRules);

// Troubleshooting section from README — inline in SKILL.md
if (skill.readmeTroubleshooting) {
  sections.push('## Troubleshooting\n\n' + skill.readmeTroubleshooting);
}
```

Insert `renderSeeAlso` between them:

```ts
const neverRules = renderNeverRules(skill);
if (neverRules) sections.push(neverRules);

const seeAlso = renderSeeAlso(skill);
if (seeAlso) sections.push(seeAlso);

// Troubleshooting section from README — inline in SKILL.md
if (skill.readmeTroubleshooting) {
  sections.push('## Troubleshooting\n\n' + skill.readmeTroubleshooting);
}
```

- [ ] **Step 7.3: Run the test suite to confirm no renderer regressions**

```bash
pnpm test --filter @skillit/core
```

Expected: all tests pass (renderer has existing snapshot/behavior tests).

- [ ] **Step 7.4: Commit**

```bash
git add packages/core/src/renderer.ts
git commit -m "feat(core): add renderSeeAlso section between NEVER and Troubleshooting"
```

---

### Task 8: Audit check W12 + D3 score update

**Files:**

- Modify: `packages/core/src/audit.ts`
- Modify: `packages/core/src/audit-score.ts`

- [ ] **Step 8.1: Add `checkW12` to `audit.ts`**

In `packages/core/src/audit.ts`, import `discoverDepSkillsSync`:

```ts
import { discoverDepSkillsSync } from './refine/dep-skills.js';
```

Add the `checkW12` function before `auditSkill` (around line 937, after `checkA4`):

```ts
// ---------------------------------------------------------------------------
// W12: Dep-skill cross-references — are all direct dep skills in ## See Also?
// ---------------------------------------------------------------------------
function checkW12(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  if (!skill.rootDir) {
    passing.push(pass('W12', 'No rootDir set — dep-skill check skipped'));
    return;
  }

  const found = discoverDepSkillsSync(skill.rootDir);
  if (found.length === 0) {
    passing.push(pass('W12', 'No dep skills found'));
    return;
  }

  const covered = new Set((skill.seeAlso ?? []).map((r) => r.name));
  const missing = found.filter((r) => !covered.has(r.name));

  if (missing.length === 0) {
    passing.push(pass('W12', 'All dep skills referenced in ## See Also'));
    return;
  }

  for (const ref of missing) {
    issues.push(
      issue(
        'warning',
        'W12',
        'package.json',
        null,
        ref.name,
        `Dep '${ref.name}' has a skill at '${ref.path}' but is missing from ## See Also`,
        'Run `skillit gen` to populate the ## See Also section with dep skill references'
      )
    );
  }
}
```

- [ ] **Step 8.2: Call `checkW12` in `auditSkill`**

In `auditSkill` (line 954), add `checkW12` after `checkW11`:

```ts
// Warning checks
checkW1(skill, issues, passing);
// ... existing checks ...
checkW11(skill, issues, passing);
checkW12(skill, issues, passing); // <-- add

// Alert checks
```

- [ ] **Step 8.3: Add W12 to D3 scorer in `audit-score.ts`**

In `estimateSkillJudgeScore`, in the D3 block (lines 131–135):

```ts
// --- D3: Anti-Patterns /15 ---
let d3 = 2;
if (passes(audit, 'W9')) d3 += 8; // @never
if (passes(audit, 'W3')) d3 += 3; // notable tags
if (passes(audit, 'W6')) d3 += 2; // README troubleshooting
if (passes(audit, 'W12')) d3 += 3; // dep-skill seeAlso coverage
d3 = clamp(d3, MAX_D3);
```

- [ ] **Step 8.4: Add W12 improvement suggestion in `buildImprovements`**

In `buildImprovements` in `audit-score.ts`, find the D3 section (begins with `if (dims.d3 < MAX_D3 * 0.8)`). Add inside that block:

```ts
// D3: ...existing W9, W3, W6 suggestions...
if (dims.d3 < MAX_D3 * 0.8) {
  // ... existing suggestions ...
  if (!passes(audit, 'W12')) {
    suggestions.push({
      gain: 3,
      imp: {
        suggestion:
          'Dep skills are missing from ## See Also — run `skillit gen` to populate it (+3 on D3)',
        points: 3,
        dimension: 'D3',
        targets: []
      }
    });
  }
}
```

- [ ] **Step 8.5: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass, including the new dep-skills tests.

- [ ] **Step 8.6: Type-check**

```bash
pnpm run type-check
```

Expected: exits 0.

- [ ] **Step 8.7: Commit**

```bash
git add packages/core/src/audit.ts packages/core/src/audit-score.ts
git commit -m "feat(core): add W12 audit check and D3 scoring for dep-skill seeAlso coverage"
```

---

### Task 9: Changeset + final gate

**Files:**

- Create: changeset entry (via `pnpm changeset`)

- [ ] **Step 9.1: Create a changeset**

```bash
pnpm changeset
```

Select the following packages as changed (minor bump — new feature):

- `@skillit/core` — minor
- `@skillit/client` — patch (wires to core feature)
- `@skillit/typedoc` — patch (wires to core feature)
- `@skillit/mcp` — patch (wires to core feature)

Changeset summary:

```
Add dep-traversal ## See Also: when generating a skill, walk direct dependencies for co-located skills and emit a ## See Also section. New W12 audit check validates coverage.
```

- [ ] **Step 9.2: Run the full test suite one final time**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 9.3: Lint**

```bash
pnpm run lint
```

Expected: no lint errors.

- [ ] **Step 9.4: Build all packages**

```bash
pnpm run build
```

Expected: exits 0.

- [ ] **Step 9.5: Commit changeset**

```bash
git add .changeset/
git commit -m "chore: changeset for dep-traversal seeAlso feature"
```

---

## Self-Review

**Spec coverage check:**

- ✅ §3.1 IR changes — Task 1 (DepSkillRef + seeAlso? + rootDir? on ExtractedSkill)
- ✅ §3.2 Discovery helper — Task 2 (discoverDepSkillsSync + discoverDepSkills, explicit skillit.skills field + convention fallback, frontmatter regex, never-throws contract)
- ✅ §3.3 Pipeline wiring — Tasks 4–6 (all 4 pipelines: cli, config, typedoc, mcp-gen, mcp-bundle)
- ✅ §3.4 Renderer — Task 7 (renderSeeAlso between NEVER and Troubleshooting)
- ✅ §3.5 Audit D3 sub-check — Task 8 (checkW12 sync, D3 scoring, improvement suggestion)
- ✅ §2 Decisions — Direct deps only (not dev/peer/transitive), path format `node_modules/<dep>/skills/<skill-dir>` (no `./`), description populated from frontmatter

**Async/sync resolution:** `auditSkill` is synchronous. `checkW12` uses `discoverDepSkillsSync` (sync fs APIs) — no breaking change to `auditSkill` signature. TypeDoc plugin handler is synchronous — uses `discoverDepSkillsSync`. All other pipelines are async — use `discoverDepSkills`.

**No placeholders found.**

**Type consistency:** `DepSkillRef` defined in Task 1, used in Tasks 2, 7, 8. `discoverDepSkillsSync` defined in Task 2, used in Tasks 3, 5, 8. `discoverDepSkills` defined in Task 2, used in Tasks 4, 6. All consistent.
