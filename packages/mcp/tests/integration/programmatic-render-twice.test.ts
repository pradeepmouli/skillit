/**
 * Integration test (T097) — SC-011: same IR → distinct adapter outputs.
 *
 * Calls `extractMcpSkill` ONCE against `@modelcontextprotocol/server-filesystem`
 * and then renders that single IR through TWO different adapters
 * (`mcp-protocol` and `cli:mcpc`) via direct `renderSkill` invocations.
 *
 * Asserts:
 *   1. The same IR object is reused for both renders (identity check).
 *   2. Both reference files (`functions.md` for mcp-protocol, `tools.md` for
 *      cli:mcpc) document the same tool names — proving the IR is target-
 *      agnostic and only rendering differs.
 *   3. Frontmatter differs — mcp-protocol carries an `mcp:` block, cli:mcpc
 *      carries `generated-by:` and NO `mcp:` block.
 *   4. Setup section appears only in the cli:mcpc render (proxy adapters
 *      emit Setup; native MCP does not).
 *   5. Invocation-shape differs — cli:mcpc embeds `mcpc … tools-call`; the
 *      mcp-protocol output does not.
 *   6. `writeSkills` succeeds against two separate output directories.
 *
 * Mirrors `multi-target.test.ts` but exercises the programmatic API directly
 * (no CLI subprocess) — this is the contract US6 build-pipeline consumers rely
 * on when they want to call extract once and emit multiple targets.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSkill, writeSkills } from '@skillit/core';
import type { ExtractedSkill, RenderedSkill } from '@skillit/core';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractMcpSkill, loadAdapterAsync } from '../../src/index.js';

const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!RUN)('programmatic render twice — SC-011', () => {
  let outMcp: string;
  let outCli: string;

  beforeEach(() => {
    outMcp = mkdtempSync(join(tmpdir(), 'to-skills-render-twice-mcp-'));
    outCli = mkdtempSync(join(tmpdir(), 'to-skills-render-twice-cli-'));
  });

  afterEach(() => {
    rmSync(outMcp, { recursive: true, force: true });
    rmSync(outCli, { recursive: true, force: true });
  });

  it('same IR rendered through mcp-protocol and cli:mcpc yields distinct outputs', async () => {
    // 1. Extract ONCE.
    const skill: ExtractedSkill = await extractMcpSkill({
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
      },
      skillName: 'filesystem'
    });
    expect(skill.functions.length).toBeGreaterThan(0);

    // 2. Render twice — identity preserved across both calls.
    const mcpAdapter = await loadAdapterAsync('mcp-protocol');
    const cliAdapter = await loadAdapterAsync('cli:mcpc');

    const mcpRendered: RenderedSkill = await renderSkill(skill, {
      invocation: mcpAdapter
    });
    const cliRendered: RenderedSkill = await renderSkill(skill, {
      invocation: cliAdapter
    });

    // 3. Both writes succeed against separate output dirs.
    writeSkills([mcpRendered], { outDir: outMcp });
    writeSkills([cliRendered], { outDir: outCli });

    const mcpSkillPath = join(outMcp, 'filesystem', 'SKILL.md');
    const cliSkillPath = join(outCli, 'filesystem', 'SKILL.md');
    expect(existsSync(mcpSkillPath)).toBe(true);
    expect(existsSync(cliSkillPath)).toBe(true);

    // 4. Reference files exist (adapter-specific filenames). We enumerate the
    //    references/ directory rather than hardcoding `functions.md` /
    //    `tools.md` so a future filename refactor produces a clear assertion
    //    failure rather than a misleading ENOENT from readFileSync.
    const mcpRefsDir = join(outMcp, 'filesystem', 'references');
    const cliRefsDir = join(outCli, 'filesystem', 'references');
    const mcpRefFiles = readdirSync(mcpRefsDir);
    const cliRefFiles = readdirSync(cliRefsDir);
    expect(mcpRefFiles.length).toBeGreaterThan(0);
    expect(cliRefFiles.length).toBeGreaterThan(0);

    // 5. Same tool names appear in EACH adapter's primary tool-listing file
    //    (target-agnostic IR drives both renders). Concatenate all reference
    //    files per adapter so the tool-name assertion doesn't depend on
    //    knowing which file the adapter chose.
    const mcpRef = mcpRefFiles.map((f) => readFileSync(join(mcpRefsDir, f), 'utf-8')).join('\n');
    const cliRef = cliRefFiles.map((f) => readFileSync(join(cliRefsDir, f), 'utf-8')).join('\n');
    for (const tool of ['list_directory', 'read_file']) {
      expect(mcpRef).toContain(tool);
      expect(cliRef).toContain(tool);
    }

    // 6. Frontmatter differs — mcp: vs generated-by:.
    const mcpContent = readFileSync(mcpSkillPath, 'utf-8');
    const cliContent = readFileSync(cliSkillPath, 'utf-8');

    const mcpFmMatch = mcpContent.match(/^---\n([\s\S]*?)\n---/);
    const cliFmMatch = cliContent.match(/^---\n([\s\S]*?)\n---/);
    expect(mcpFmMatch).toBeTruthy();
    expect(cliFmMatch).toBeTruthy();
    const mcpFm = YAML.parse(mcpFmMatch![1]!) as {
      mcp?: Record<string, unknown>;
      'generated-by'?: unknown;
    };
    const cliFm = YAML.parse(cliFmMatch![1]!) as {
      mcp?: unknown;
      'generated-by'?: { adapter?: string };
    };
    expect(mcpFm.mcp).toBeTruthy();
    expect(mcpFm['generated-by']).toBeUndefined();
    expect(cliFm['generated-by']).toBeTruthy();
    expect(cliFm['generated-by']!.adapter).toBe('@skillit/target-mcpc');
    expect(cliFm.mcp).toBeUndefined();

    // 7. Setup section — present in cli:mcpc body, absent from mcp-protocol.
    expect(cliContent).toMatch(/^##\s+Setup/m);
    expect(mcpContent).not.toMatch(/^##\s+Setup/m);

    // 8. Invocation-shape differs — cli:mcpc embeds the proxy command line.
    expect(cliRef).toMatch(/mcpc\s+filesystem\s+tools-call/);
    expect(mcpRef).not.toMatch(/mcpc\s+\S+\s+tools-call/);
  }, 120_000);
});
