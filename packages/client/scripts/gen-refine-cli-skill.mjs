// Dogfood: generate a skill for the `to-skills` CLI binary (the `refine` command)
// using @to-skills/cli's own commander introspection.
//
// Run from the repo root:  node packages/client/scripts/gen-refine-cli-skill.mjs
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { extractCliSkill, writeCliSkill } from '@to-skills/cli';
import { buildRefineCommand } from '../dist/commands/refine.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

// Reconstruct the same program shape that packages/client/src/bin.ts ships.
const program = new Command('to-skills').description('to-skills CLI').version('0.1.0');
program.addCommand(buildRefineCommand());

const skill = await extractCliSkill({
  program,
  metadata: {
    name: 'to-skills-refine',
    description:
      'Autonomously improve an MCP skill via the to-skills audit→draft→review loop (build or runtime mode)',
    keywords: ['to-skills', 'refine', 'mcp', 'skill-generation', 'cli', 'audit', 'overlay'],
    repository: 'https://github.com/pradeepmouli/to-skills'
  }
});

writeCliSkill(skill, { outDir: resolve(repoRoot, 'skills') });

const issues = skill.audit?.issues ?? [];
console.log(`Generated skills/to-skills-refine/ — ${issues.length} audit finding(s).`);
for (const i of issues) {
  console.log(`  [${i.severity ?? '?'}] ${i.code ?? ''} ${i.message ?? ''}`.trimEnd());
}
