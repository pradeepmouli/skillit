// packages/client/src/program.ts
import { Command } from 'commander';
import { buildMcpCommand } from '@skillit/mcp';
import { buildInitCommand } from './commands/init.js';
import { buildRefineCommand } from './commands/refine.js';

/**
 * Builds the `skillit` commander program with all subcommands registered.
 *
 * Exported as a zero-arg factory so the program can be introspected by
 * `@skillit/cli`'s program loader (`--program <file#export>` / auto-discovery
 * probes `buildProgram`) — this is what lets skillit generate a skill for its
 * own CLI. The executable entry ({@link file://./bin.ts}) wraps this with
 * argv parsing and the mcp exit-code contract.
 */
export function buildProgram(): Command {
  const program = new Command('skillit').description('skillit CLI').version('0.4.0');

  program.addCommand(buildRefineCommand());
  program.addCommand(buildInitCommand());
  program.addCommand(buildMcpCommand());

  return program;
}
