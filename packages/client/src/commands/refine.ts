// packages/client/src/commands/refine.ts
import { Command } from 'commander';
import {
  McpRefineSource,
  TypeScriptMcpRefineSource,
  extractMcpSkill,
  readMcpConfigFile
} from '@to-skills/mcp';
import { CliRefineSource, loadProgram } from '@to-skills/cli';
import { refineSkill, type RefineSource } from '@to-skills/core';
import { AnthropicModelClient } from '../model/anthropic.js';
import { detectRefineMode } from '../detect-mode.js';
import {
  classifyRefineSources,
  detectInstalledSources,
  type DetectedRefineSource,
  type RefineSourceKind
} from '../detect-source.js';
import { join } from 'node:path';

function parsePositiveInt(raw: string, flag: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${flag} must be a positive integer, got: ${raw}`);
  }
  return n;
}

/** Options consulted by {@link resolveRefineSource}. */
export interface RefineSourceResolveOpts {
  source?: string;
  mcp?: string;
}

/** Result of resolving the refine source: a concrete kind or an actionable error. */
export type RefineSourceResolution = { kind: 'cli' | 'mcp' } | { error: string };

const VALID_SOURCES = ['cli', 'mcp', 'typedoc'] as const;
const SOURCE_FORM = '--source <cli|mcp|typedoc>';

/**
 * Resolve the refine source from explicit `--source` (wins) or detection,
 * then validate per-source flag requirements. Pure and unit-testable: it does
 * not read the filesystem or invoke the model.
 *
 * @param opts - parsed `--source` / `--mcp` flags
 * @param detected - result of {@link detectRefineSource} for the cwd
 * @param candidates - the raw installed source kinds (from
 *   {@link detectInstalledSources}); named in the ambiguous error
 */
export function resolveRefineSource(
  opts: RefineSourceResolveOpts,
  detected: DetectedRefineSource,
  candidates: readonly RefineSourceKind[] = []
): RefineSourceResolution {
  let kind: RefineSourceKind;
  if (opts.source !== undefined) {
    if (!VALID_SOURCES.includes(opts.source as RefineSourceKind)) {
      return { error: `Invalid --source value: ${opts.source}. Use ${SOURCE_FORM}.` };
    }
    kind = opts.source as RefineSourceKind;
  } else if (detected === 'ambiguous') {
    return {
      error: `Cannot determine refine source: multiple @to-skills sources installed (found: ${candidates.join(', ')}).
Pass ${SOURCE_FORM} to choose one.`
    };
  } else if (detected === 'none') {
    return {
      error: `Cannot determine refine source: no @to-skills source package detected.
Pass ${SOURCE_FORM} to choose one.`
    };
  } else {
    kind = detected;
  }

  if (kind === 'typedoc') {
    return { error: 'typedoc refine not yet supported; use --source cli|mcp.' };
  }
  if (kind === 'mcp' && opts.mcp === undefined) {
    return { error: 'The mcp source requires --mcp <path> (path to mcp.json or MCP config file).' };
  }
  return { kind };
}

/** Parsed options for the `refine` action / {@link runRefineCommand}. */
export interface RefineCommandOpts {
  source?: string;
  program?: string;
  mcp?: string;
  server?: string;
  overlay?: string;
  mode?: string;
  sourceGlob?: string;
  maxIterations: string;
  items: string;
}

/**
 * The body of the `refine` command action, extracted so it can be reused
 * programmatically (e.g. by `to-skills init`) without argv gymnastics. Sets
 * `process.exitCode` and writes progress/errors to the console exactly as the
 * CLI does.
 */
export async function runRefineCommand(opts: RefineCommandOpts): Promise<void> {
  const cwd = process.cwd();
  const maxIterations = parsePositiveInt(opts.maxIterations, '--max-iterations');
  const itemsPerIteration = parsePositiveInt(opts.items, '--items');

  const candidates = await detectInstalledSources(cwd);
  const detected = classifyRefineSources(candidates);
  const resolution = resolveRefineSource(opts, detected, candidates);
  if ('error' in resolution) {
    console.error(resolution.error);
    process.exitCode = 1;
    return;
  }

  let source: RefineSource;
  let reportInPlace = false;

  if (resolution.kind === 'cli') {
    const program = await loadProgram({ program: opts.program, cwd });
    const sourceGlob = opts.sourceGlob ?? join(cwd, '**', '*.ts');
    source = new CliRefineSource({ program, sourceGlob, cwd });
    reportInPlace = true;
  } else {
    // mcp source: --mcp guaranteed present by resolveRefineSource.
    const mcpPath = opts.mcp!;
    const overlayPath = opts.overlay ?? join(cwd, '.to-skills-overlay.json');

    let mode: 'build' | 'runtime';
    if (opts.mode === 'build' || opts.mode === 'runtime') {
      mode = opts.mode;
    } else if (opts.mode !== undefined) {
      console.error(`Invalid --mode value: ${opts.mode}. Use 'build' or 'runtime'.`);
      process.exitCode = 1;
      return;
    } else {
      const detectedMode = await detectRefineMode(cwd, mcpPath);
      if (detectedMode === 'ambiguous') {
        console.error(`Cannot determine refine mode.
Use --mode build  (TypeScript MCP server you own)
     --mode runtime  (consuming project, any MCP server)`);
        process.exitCode = 1;
        return;
      }
      mode = detectedMode;
    }

    if (mode === 'build') {
      console.log('Refining in build mode (TypeScript MCP)');
    } else {
      console.log('Refining in runtime mode (overlay)');
    }

    const entries = await readMcpConfigFile(mcpPath);
    const entry = opts.server
      ? entries.find((e) => e.name === opts.server)
      : entries.find((e) => !e.disabled);
    if (!entry) {
      const name = opts.server ? `"${opts.server}"` : 'any enabled server';
      throw new Error(`Could not find ${name} in ${mcpPath}`);
    }

    if (mode === 'build') {
      const sourceGlob = opts.sourceGlob ?? join(cwd, '**', '*.ts');
      source = new TypeScriptMcpRefineSource({
        transport: entry.transport,
        sourceGlob
      });
      reportInPlace = true;
    } else {
      source = new McpRefineSource({
        overlayPath,
        extract: () => extractMcpSkill({ transport: entry.transport })
      });
    }

    const result = await runRefine(source, maxIterations, itemsPerIteration);
    reportResult(result, { reportInPlace, overlayPath });
    process.exitCode = result.passed ? 0 : 1;
    return;
  }

  const result = await runRefine(source, maxIterations, itemsPerIteration);
  reportResult(result, { reportInPlace });
  process.exitCode = result.passed ? 0 : 1;
}

export function buildRefineCommand(): Command {
  return new Command('refine')
    .description('Autonomously improve a skill via the audit→draft→review loop')
    .option('--source <kind>', 'cli | mcp | typedoc (auto-detected if omitted)')
    .option('--program <file#export>', 'commander program entry (cli source)')
    .option('--mcp <path>', 'path to mcp.json or MCP config file')
    .option('--server <name>', 'server name within the config (defaults to first enabled)')
    .option('--overlay <path>', 'path to overlay JSON file (runtime mode only)')
    .option('--mode <mode>', 'refine mode: build or runtime (auto-detected if omitted)')
    .option('--source-glob <glob>', 'glob pattern for TypeScript source files')
    .option('--max-iterations <n>', 'iteration cap (default 5)', '5')
    .option('--items <n>', 'work items per iteration (default 5)', '5')
    .action((opts: RefineCommandOpts) => runRefineCommand(opts));
}

function runRefine(
  source: RefineSource,
  maxIterations: number,
  itemsPerIteration: number
): ReturnType<typeof refineSkill> {
  return refineSkill({
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
}

function reportResult(
  result: Awaited<ReturnType<typeof refineSkill>>,
  opts: { reportInPlace: boolean; overlayPath?: string }
): void {
  console.log(`\nDone. Reason: ${result.stoppedReason}`);
  console.log(`Final grade: ${result.finalEstimate.grade} (${result.finalEstimate.total}/120)`);
  if (opts.reportInPlace) {
    console.log(`Source files updated in place.`);
  } else if (opts.overlayPath && result.iterations.length > 0) {
    console.log(`Overlay: ${opts.overlayPath}`);
  }
}
