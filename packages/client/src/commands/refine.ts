// packages/client/src/commands/refine.ts
import { Command } from 'commander';
import {
  McpRefineSource,
  TypeScriptMcpRefineSource,
  extractMcpSkill,
  readMcpConfigFile
} from '@to-skills/mcp';
import { refineSkill } from '@to-skills/core';
import { AnthropicModelClient } from '../model/anthropic.js';
import { detectRefineMode } from '../detect-mode.js';
import { join } from 'node:path';

function parsePositiveInt(raw: string, flag: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${flag} must be a positive integer, got: ${raw}`);
  }
  return n;
}

export function buildRefineCommand(): Command {
  return new Command('refine')
    .description('Autonomously improve a skill via the audit→draft→review loop')
    .requiredOption('--mcp <path>', 'path to mcp.json or MCP config file')
    .option('--server <name>', 'server name within the config (defaults to first enabled)')
    .option('--overlay <path>', 'path to overlay JSON file (runtime mode only)')
    .option('--mode <mode>', 'refine mode: build or runtime (auto-detected if omitted)')
    .option('--source-glob <glob>', 'glob pattern for TypeScript source files (build mode)')
    .option('--max-iterations <n>', 'iteration cap (default 5)', '5')
    .option('--items <n>', 'work items per iteration (default 5)', '5')
    .action(
      async (opts: {
        mcp: string;
        server?: string;
        overlay?: string;
        mode?: string;
        sourceGlob?: string;
        maxIterations: string;
        items: string;
      }) => {
        const maxIterations = parsePositiveInt(opts.maxIterations, '--max-iterations');
        const itemsPerIteration = parsePositiveInt(opts.items, '--items');
        const overlayPath = opts.overlay ?? join(process.cwd(), '.to-skills-overlay.json');

        // Determine mode
        let mode: 'build' | 'runtime';
        if (opts.mode === 'build' || opts.mode === 'runtime') {
          mode = opts.mode;
        } else if (opts.mode !== undefined) {
          console.error(`Invalid --mode value: ${opts.mode}. Use 'build' or 'runtime'.`);
          process.exitCode = 1;
          return;
        } else {
          const detected = await detectRefineMode(process.cwd());
          if (detected === 'ambiguous') {
            console.error(`Cannot determine refine mode.
Use --mode build  (TypeScript MCP server you own)
     --mode runtime  (consuming project, any MCP server)`);
            process.exitCode = 1;
            return;
          }
          mode = detected;
        }

        if (mode === 'build') {
          console.log('Refining in build mode (TypeScript MCP)');
        } else {
          console.log('Refining in runtime mode (overlay)');
        }

        const entries = await readMcpConfigFile(opts.mcp);
        const entry = opts.server
          ? entries.find((e) => e.name === opts.server)
          : entries.find((e) => !e.disabled);
        if (!entry) {
          const name = opts.server ? `"${opts.server}"` : 'any enabled server';
          throw new Error(`Could not find ${name} in ${opts.mcp}`);
        }

        let source: McpRefineSource | TypeScriptMcpRefineSource;
        if (mode === 'build') {
          const sourceGlob = opts.sourceGlob ?? join(process.cwd(), '**', '*.ts');
          source = new TypeScriptMcpRefineSource({
            transport: entry.transport,
            sourceGlob
          });
        } else {
          source = new McpRefineSource({
            overlayPath,
            extract: () => extractMcpSkill({ transport: entry.transport })
          });
        }

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
        if (mode === 'build') {
          console.log(`Source files updated in place.`);
        } else {
          if (result.iterations.length > 0) {
            console.log(`Overlay: ${overlayPath}`);
          }
        }

        process.exitCode = result.passed ? 0 : 1;
      }
    );
}
