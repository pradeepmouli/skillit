/**
 * CLI Extraction
 * Extract skill documentation from a commander program and correlate with typed options.
 */

import { extractCliSkill } from '@skillit/cli';
import { renderSkill, writeSkills } from '@skillit/core';
import { Command } from 'commander';

// Define your CLI
const program = new Command().name('my-tool');

program
  .command('build')
  .description('Build the project')
  .requiredOption('--config <path>', 'Path to config file')
  .option('--watch', 'Watch mode', false)
  .option('--out <dir>', 'Output directory', './dist')
  .action(() => {});

// Extract skill from CLI definition
const skill = await extractCliSkill({
  program,
  metadata: {
    name: 'my-tool',
    description: 'A build tool for TypeScript projects',
    keywords: ['build', 'typescript', 'bundler']
  }
});

// Render and write
const rendered = renderSkill(skill);
writeSkills([rendered], { outDir: 'skills' });
