/**
 * Integration test (T098a) — SC-007: programmatic and bundle paths converge.
 *
 * Runs the same skill production through TWO paths against the same fixture:
 *
 *   Path A — programmatic:
 *     `extractMcpSkill` + `loadAdapterAsync('mcp-protocol')` + `renderSkill` +
 *     `writeSkills`. We pass `invocationPackageName: '@fixture/my-mcp-server'`
 *     so the rendered `mcp:` block uses the npx-by-name self-reference, exactly
 *     as the bundle path would.
 *
 *   Path B — bundle:
 *     `bundleMcpSkill({ packageRoot })` against a copy of the fake-server
 *     fixture. Bundle internally derives `command: node`, `args: [bin path]`
 *     from `package.json#bin`, then renders with `invocationPackageName` set
 *     from `package.json#name`.
 *
 * Asserts the resulting SKILL.md and every references/*.md are byte-identical
 * after canonicalization (SC-007). Canonicalization is mandatory because:
 *   - YAML frontmatter key order is not guaranteed across runs (the canonical
 *     pass sorts keys),
 *   - blank-line collapsing differs subtly when adapters insert section
 *     boundaries in slightly different orders.
 *
 * Both paths write into the same fixture's `skills/` directory tree (per task
 * description), one after the other, with a clean rmSync between them.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize, renderSkill, writeSkills } from '@skillit/core';
import type { RenderedFile, RenderedSkill } from '@skillit/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bundleMcpSkill, extractMcpSkill, loadAdapterAsync } from '../../src/index.js';

const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'fake-server-package');
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

/**
 * Read every file under `dir` and return a sorted-by-filename list of
 * canonicalized RenderedFile records (skill + references).
 */
function readSkillTree(skillDir: string): { skill: RenderedFile; references: RenderedFile[] } {
  const skillPath = join(skillDir, 'SKILL.md');
  const skillFile: RenderedFile = {
    filename: 'SKILL.md',
    content: readFileSync(skillPath, 'utf-8'),
    tokens: 0
  };
  const refsDir = join(skillDir, 'references');
  const references: RenderedFile[] = [];
  if (existsSync(refsDir)) {
    const refNames = readdirSync(refsDir).sort();
    for (const name of refNames) {
      references.push({
        filename: name,
        content: readFileSync(join(refsDir, name), 'utf-8'),
        tokens: 0
      });
    }
  }
  return { skill: skillFile, references };
}

function canonicalizeTree(tree: {
  skill: RenderedFile;
  references: RenderedFile[];
}): RenderedSkill {
  return canonicalize({ skill: tree.skill, references: tree.references });
}

describe.skipIf(!RUN)('programmatic vs bundle — byte-identical output (SC-007)', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'to-skills-prog-vs-bundle-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('produces canonical-equivalent SKILL.md + references via both paths', async () => {
    const skillsDir = join(workDir, 'skills');
    const skillName = 'my-server';
    const packageName = '@fixture/my-mcp-server';
    const binPath = join(workDir, 'dist', 'server.js');

    // -----------------------------------------------------------------------
    // Path A — programmatic extract + render + write.
    // -----------------------------------------------------------------------
    const skill = await extractMcpSkill({
      transport: { type: 'stdio', command: 'node', args: [binPath] },
      skillName
    });
    const adapter = await loadAdapterAsync('mcp-protocol');
    const rendered = await renderSkill(skill, {
      invocation: adapter,
      invocationPackageName: packageName
    });
    writeSkills([rendered], { outDir: skillsDir });

    expect(existsSync(join(skillsDir, skillName, 'SKILL.md'))).toBe(true);
    const programmaticTree = readSkillTree(join(skillsDir, skillName));
    const canonicalProgrammatic = canonicalizeTree(programmaticTree);

    // Wipe between paths so we observe the bundle's writes in isolation.
    rmSync(skillsDir, { recursive: true, force: true });

    // -----------------------------------------------------------------------
    // Path B — bundleMcpSkill against the same fixture.
    // -----------------------------------------------------------------------
    const result = await bundleMcpSkill({ packageRoot: workDir });
    expect(result.failures).toEqual({});
    expect(result.skills[skillName]).toBeDefined();

    expect(existsSync(join(skillsDir, skillName, 'SKILL.md'))).toBe(true);
    const bundleTree = readSkillTree(join(skillsDir, skillName));
    const canonicalBundle = canonicalizeTree(bundleTree);

    // -----------------------------------------------------------------------
    // Compare canonical outputs.
    // -----------------------------------------------------------------------
    expect(canonicalProgrammatic.skill.content).toBe(canonicalBundle.skill.content);

    const progRefs = canonicalProgrammatic.references;
    const bundleRefs = canonicalBundle.references;
    expect(progRefs.map((r) => r.filename).sort()).toEqual(
      bundleRefs.map((r) => r.filename).sort()
    );

    const bundleByName = new Map(bundleRefs.map((r) => [r.filename, r.content]));
    for (const ref of progRefs) {
      expect(bundleByName.get(ref.filename)).toBe(ref.content);
    }
  }, 120_000);
});
