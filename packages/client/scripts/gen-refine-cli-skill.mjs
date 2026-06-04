// Dogfood: generate a skill for the `skillit` CLI binary (the `refine` command)
// using @skillit/cli's own commander introspection.
//
// Run via the package script (builds first):  pnpm --filter @skillit/client gen-cli-skill
// Or directly, after building @skillit/client:  node packages/client/scripts/gen-refine-cli-skill.mjs
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { extractCliSkill, writeCliSkill } from '@skillit/cli';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

// This script reads the refine command from build output. `dist/` is not in the
// repo by default, so fail with an actionable message rather than a raw
// ERR_MODULE_NOT_FOUND when it is missing or stale.
const refineDist = resolve(here, '../dist/commands/refine.js');
if (!existsSync(refineDist)) {
  console.error(
    `Cannot find ${refineDist}.\nBuild @skillit/client first:  pnpm --filter @skillit/client build`
  );
  process.exit(1);
}
const { buildRefineCommand } = await import(refineDist);

// Reconstruct the same program shape that packages/client/src/bin.ts ships.
const program = new Command('skillit').description('skillit CLI').version('0.1.0');
program.addCommand(buildRefineCommand());

const skill = await extractCliSkill({
  program,
  metadata: {
    name: 'skillit-refine',
    description:
      'Autonomously improve an MCP skill via the skillit audit→draft→review loop (build or runtime mode)',
    keywords: ['skillit', 'refine', 'mcp', 'skill-generation', 'cli', 'audit', 'overlay'],
    repository: 'https://github.com/pradeepmouli/skillit'
  }
});

writeCliSkill(skill, { outDir: resolve(repoRoot, 'skills') });

const issues = skill.audit?.issues ?? [];
console.log(`Generated skills/skillit-refine/ — ${issues.length} audit finding(s).`);
for (const i of issues) {
  console.log(`  [${i.severity ?? '?'}] ${i.code ?? ''} ${i.message ?? ''}`.trimEnd());
}
