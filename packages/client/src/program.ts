// packages/client/src/program.ts
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { buildMcpCommand } from '@skillit/mcp';
import { buildInitCommand } from './commands/init.js';
import { buildRefineCommand } from './commands/refine.js';

/**
 * The package version, read from `package.json` at runtime so `skillit
 * --version` stays correct after every release instead of drifting from a
 * hard-coded literal. `../package.json` resolves from the built `dist/` entry
 * to the package root. Falls back to `0.0.0` if the read fails.
 */
function readPackageVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

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
  const program = new Command('skillit').description('skillit CLI').version(readPackageVersion());

  program.addCommand(buildRefineCommand());
  program.addCommand(buildInitCommand());
  program.addCommand(buildMcpCommand());

  return program;
}
