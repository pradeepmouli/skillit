// packages/client/src/bin.ts
import { Command } from 'commander';
import { buildRefineCommand } from './commands/refine.js';

const program = new Command('to-skills').description('to-skills CLI').version('0.1.0');

program.addCommand(buildRefineCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
