/**
 * Integration test (T090): `bundle --invocation cli:mcpc` against the
 * fake-server-package fixture.
 *
 * Asserts:
 *   1. Exit code 0.
 *   2. `<tmpdir>/skills/my-server/SKILL.md` exists (single-target run, so no
 *      `-cli-mcpc` disambiguating suffix).
 *   3. SKILL.md frontmatter has a `generated-by:` block (with adapter +
 *      version) and NO `mcp:` block.
 *   4. The Setup section is present (mcpc adapter prepends install + connect
 *      commands as a bodyPrefix).
 *   5. `references/tools.md` exists (cli:mcpc emits its own tools.md, NOT
 *      the default `references/functions.md`).
 *   6. `package.json` byte-identical before/after (FR-035 — never mutate
 *      the host package.json).
 *
 * Reuses the bundle-basic fixture pattern (cpSync + symlinked node_modules)
 * so the fixture's compiled MCP server can resolve `@modelcontextprotocol/sdk`
 * from the parent package's installed dependencies.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
 */
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInstallTargets } from './install-target-fixtures.js';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'fake-server-package');
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

describe.skipIf(!RUN)('bundle integration: cli:mcpc target', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'to-skills-mcp-bundle-cli-it-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('writes generated-by frontmatter, no mcp: block, references/tools.md, leaves package.json untouched', async () => {
    const pkgPath = join(workDir, 'package.json');
    const pkgBefore = readFileSync(pkgPath);

    const { stdout } = await exec(
      'node',
      [
        BIN_PATH,
        'bundle',
        '--package-root',
        workDir,
        '--out',
        'skills',
        '--invocation',
        'cli:mcpc'
      ],
      { timeout: 60_000 }
    );
    expect(stdout).toMatch(/Wrote .*my-server.*SKILL\.md/);

    // 2. Single-target run → plain `<skillName>` directory shape.
    const skillDir = join(workDir, 'skills', 'my-server');
    const skillPath = join(skillDir, 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    // 3. generated-by present, mcp: absent.
    const content = readFileSync(skillPath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).toBeTruthy();
    const frontmatter = YAML.parse(fmMatch![1]!) as {
      mcp?: unknown;
      'generated-by'?: { adapter?: string; version?: string };
    };
    expect(frontmatter['generated-by']).toBeTruthy();
    expect(frontmatter['generated-by']!.adapter).toBe('@to-skills/target-mcpc');
    expect(typeof frontmatter['generated-by']!.version).toBe('string');
    expect(frontmatter.mcp).toBeUndefined();

    // 4. Setup section — mcpc bodyPrefix.
    expect(content).toMatch(/^##\s+Setup/m);
    // The adapter's install command is the canonical signal of a Setup
    // section emitted by the mcpc adapter.
    expect(content).toContain('npm install -g mcpc');

    // 5. references/tools.md (NOT functions.md).
    const toolsRef = join(skillDir, 'references', 'tools.md');
    expect(existsSync(toolsRef)).toBe(true);
    const toolsContent = readFileSync(toolsRef, 'utf-8');
    expect(toolsContent).toContain('echo');
    // The mcpc command-shape line uses the bundled skill name.
    expect(toolsContent).toMatch(/mcpc\s+my-server\s+tools-call\s+echo/);
    // The default functions.md should not be emitted alongside tools.md
    // for the cli:mcpc adapter.
    expect(existsSync(join(skillDir, 'references', 'functions.md'))).toBe(false);

    // 6. package.json byte-identical (FR-035).
    const pkgAfter = readFileSync(pkgPath);
    expect(pkgAfter.equals(pkgBefore)).toBe(true);
  }, 90_000);

  it('installs bundled guidance into agent discovery targets during bundle runs', async () => {
    const { installA } = createInstallTargets(workDir);

    await exec(
      'node',
      [
        BIN_PATH,
        'bundle',
        '--package-root',
        workDir,
        '--out',
        'skills',
        '--invocation',
        'cli:mcpc',
        '--install-target',
        installA
      ],
      { timeout: 60_000 }
    );

    expect(existsSync(join(workDir, 'skills', 'my-server', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(workDir, 'skills', 'to-skills-mcp-docs', 'SKILL.md'))).toBe(false);
    expect(existsSync(join(installA, 'my-server', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(installA, 'to-skills-mcp-docs', 'SKILL.md'))).toBe(true);
  }, 90_000);
});
