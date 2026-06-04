#!/usr/bin/env node
// packages/client/src/bin.ts
import { Command } from 'commander';
import { buildMcpCommand, reportMcpErrorAndExit } from '@skillit/mcp';
import { buildInitCommand } from './commands/init.js';
import { buildRefineCommand } from './commands/refine.js';

const program = new Command('skillit').description('skillit CLI').version('0.1.0');

program.addCommand(buildRefineCommand());
program.addCommand(buildInitCommand());
program.addCommand(buildMcpCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  // Preserve the mcp exit-code contract for the `skillit mcp …` path; other
  // errors keep the prior generic behavior (stderr message + exit 1).
  reportMcpErrorAndExit(err);
});
