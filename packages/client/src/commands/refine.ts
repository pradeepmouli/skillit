// packages/client/src/commands/refine.ts
import { Command } from 'commander';
import { McpRefineSource, extractMcpSkill, readMcpConfigFile } from '@to-skills/mcp';
import { refineSkill } from '@to-skills/core';
import { AnthropicModelClient } from '../model/anthropic.js';
import { join } from 'node:path';

export function buildRefineCommand(): Command {
  return new Command('refine')
    .description('Autonomously improve a skill via the audit→draft→review loop')
    .requiredOption('--mcp <path>', 'path to mcp.json or MCP config file')
    .option('--server <name>', 'server name within the config (defaults to first)')
    .option('--overlay <path>', 'path to write the _meta.toSkills overlay JSON')
    .option('--max-iterations <n>', 'iteration cap (default 5)', '5')
    .option('--items <n>', 'work items per iteration (default 5)', '5')
    .action(
      async (opts: {
        mcp: string;
        server?: string;
        overlay?: string;
        maxIterations: string;
        items: string;
      }) => {
        const maxIterations = parseInt(opts.maxIterations, 10);
        const itemsPerIteration = parseInt(opts.items, 10);
        const overlayPath = opts.overlay ?? join(process.cwd(), '.to-skills-overlay.json');

        const entries = await readMcpConfigFile(opts.mcp);
        const entry = opts.server ? entries.find((e) => e.name === opts.server) : entries[0];
        if (!entry) {
          const name = opts.server ? `"${opts.server}"` : 'any server';
          throw new Error(`Could not find ${name} in ${opts.mcp}`);
        }

        const source = new McpRefineSource({
          overlayPath,
          extract: () => extractMcpSkill({ transport: entry.transport })
        });

        const result = await refineSkill({
          source,
          model: new AnthropicModelClient(),
          maxIterations,
          itemsPerIteration,
          onIteration: (iter) => {
            const { grade, total } = iter.estimate;
            console.log(
              `  Iteration ${iter.iteration}: grade ${grade} (${total}/120), ${iter.fixes.length} fix(es) applied`
            );
          }
        });

        console.log(`\nDone. Reason: ${result.stoppedReason}`);
        console.log(
          `Final grade: ${result.finalEstimate.grade} (${result.finalEstimate.total}/120)`
        );
        if (result.passed) {
          console.log(`Overlay written to ${overlayPath}`);
        }

        process.exit(result.passed ? 0 : 1);
      }
    );
}
