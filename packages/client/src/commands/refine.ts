// packages/client/src/commands/refine.ts
import { Command } from 'commander';
import {
  McpRefineSource,
  TypeScriptMcpRefineSource,
  extractMcpSkill,
  readMcpConfigFile
} from '@skillit/mcp';
import { CliRefineSource, loadProgram } from '@skillit/cli';
import {
  ConfigRefineSource,
  refineSkill,
  type ModelClient,
  type RefineSource
} from '@skillit/core';
import { createModelClient } from '../model/model-client-factory.js';
import { detectRefineMode } from '../detect-mode.js';
import {
  classifyRefineSources,
  detectInstalledSources,
  type DetectedRefineSource,
  type RefineSourceKind
} from '../detect-source.js';
import { isAbsolute, join } from 'node:path';

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
  configType?: string;
}

/** Result of resolving the refine source: a concrete kind or an actionable error. */
export type RefineSourceResolution = { kind: 'cli' | 'mcp' | 'config' } | { error: string };

// `config` is an explicit-only source: it never auto-detects (no installed
// `@skillit/*` package implies it), so the ambiguous/none guidance keeps
// pointing at the detectable sources while `--source config` is still accepted.
const VALID_SOURCES = ['cli', 'mcp', 'typedoc', 'config'] as const;
const SOURCE_FORM = '--source <cli|mcp|typedoc>';
const INVALID_SOURCE_FORM = '--source <cli|mcp|typedoc|config>';

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
  let kind: RefineSourceKind | 'config';
  if (opts.source !== undefined) {
    if (!VALID_SOURCES.includes(opts.source as (typeof VALID_SOURCES)[number])) {
      return { error: `Invalid --source value: ${opts.source}. Use ${INVALID_SOURCE_FORM}.` };
    }
    kind = opts.source as RefineSourceKind | 'config';
  } else if (detected === 'ambiguous') {
    return {
      error: `Cannot determine refine source: multiple @skillit sources installed (found: ${candidates.join(', ')}).
Pass ${SOURCE_FORM} to choose one.`
    };
  } else if (detected === 'none') {
    return {
      error: `Cannot determine refine source: no @skillit source package detected.
Pass ${SOURCE_FORM} to choose one.`
    };
  } else {
    kind = detected;
  }

  if (kind === 'typedoc') {
    return { error: 'typedoc refine not yet supported; use --source cli|mcp|config.' };
  }
  if (kind === 'config' && opts.configType === undefined) {
    return {
      error:
        'The config source requires --config-type <file#export> (e.g. ./src/config.ts#MyConfig).'
    };
  }
  if (kind === 'mcp' && opts.mcp === undefined) {
    return { error: 'The mcp source requires --mcp <path> (path to mcp.json or MCP config file).' };
  }
  return { kind };
}

/**
 * Parsed options for the `refine` action / {@link runRefineCommand}.
 * @pitfalls - **`introspectCommander`** — Never pass a Commander program before its subcommands have been registered; the result will be an empty array with no warning, silently producing a skill with no commands.
 * - **`introspectCommander`** — Never use with yargs, oclif, minimist, or other non-Commander frameworks; it reads Commander's internal `.commands` array which does not exist on other program objects.
 * - **`parseHelpOutput`** — Never use when you have access to the Commander program object; help-text parsing is lossy — default values, variadic flags, and required/optional distinctions are inferred heuristically and may be wrong.
 * - **`parseHelpOutput`** — Never expect multi-line option descriptions to be captured; the parser treats the first indented line as the full description and silently discards continuation lines.
 * - **`correlateFlags`** — Never rely on option name matching when pairing `parseHelpOutput` output with a typed config interface; help parsing preserves raw kebab-case names (e.g. `output-dir`) while TypeDoc extracts camelCase properties (`outputDir`) — correlation will silently produce no enrichment.
 * - **`extractCliSkill`** — Never pass both `program` and `helpTexts`; `program` silently takes precedence and the entire `helpTexts` map is ignored without any warning or error.
 * - **`extractCliSkill`** — Never call from a file that invokes `program.parse(process.argv)` at import time; Commander will consume `process.argv` (and may exit) before the skill extraction pipeline can run.
 * - **`loadProgram`** — Never omit the `#exportName` separator in `opts.program` (e.g. pass `"./cli.js"` instead of `"./cli.js#buildProgram"`); the function throws immediately without attempting auto-discovery from `package.json`.
 * @useWhen - Your Commander `.description()` reads as a bare verb or repeats the command name with no behavioral context (e.g., `"run"` instead of `"Run the build pipeline and emit artifacts to dist/"`)
 * - An `.option()` description states what the flag is named but not what it changes — the `--help` output leaves the caller guessing at the effect
 * - A positional argument added via `.argument()` has no expected-format hint, leaving callers unsure whether to pass a file path, a glob, a semver string, or a named identifier
 * - An option that accepts an environment-variable override has no mention of that env var in its description, so the config surface is invisible in `--help` output
 * @avoidWhen - `introspectCommander` — the Commander `program` object is unavailable at runtime; use `parseHelpOutput` with raw `--help` text instead
 * - `parseHelpOutput` — you have direct access to the Commander `program` object; `introspectCommander` captures default values, variadic flags, and required/optional distinctions that help-text parsing misses
 * - `correlateFlags` — no TypeDoc-extracted `configSurfaces` are available; without a matching config surface the call is a no-op and no JSDoc metadata is merged into CLI options
 */
export interface RefineCommandOpts {
  source?: string;
  program?: string;
  configType?: string;
  mcp?: string;
  server?: string;
  overlay?: string;
  mode?: string;
  sourceGlob?: string;
  maxIterations: string;
  items: string;
  modelClient?: string;
  modelCliTimeout?: string;
}

/** The model backend to use; defaults to the API client. */
export function resolveModelClientKind(raw: string | undefined): string {
  return raw ?? 'api';
}

/**
 * Parse a `--config-type <file#export>` spec (e.g. `./src/config.ts#MyConfig`)
 * into its file and exported type name. Pure and unit-testable. The `#` is the
 * required separator; both sides must be non-empty (mirrors `--program`'s
 * `file#export` form). `cwd` resolves a relative file to an absolute path.
 */
export function parseConfigTypeSpec(
  spec: string,
  cwd: string
): { configFile: string; typeName: string } | { error: string } {
  const hashIdx = spec.lastIndexOf('#');
  if (hashIdx <= 0 || hashIdx === spec.length - 1) {
    return {
      error: `--config-type must be <file>#<ExportName> (e.g. ./src/config.ts#MyConfig), got: ${spec}`
    };
  }
  const file = spec.slice(0, hashIdx);
  const typeName = spec.slice(hashIdx + 1);
  return { configFile: isAbsolute(file) ? file : join(cwd, file), typeName };
}

/**
 * The body of the `refine` command action, extracted so it can be reused
 * programmatically (e.g. by `skillit init`) without argv gymnastics. Sets
 * `process.exitCode` and writes progress/errors to the console exactly as the
 * CLI does.
 */
export async function runRefineCommand(opts: RefineCommandOpts): Promise<void> {
  const cwd = process.cwd();
  const maxIterations = parsePositiveInt(opts.maxIterations, '--max-iterations');
  const itemsPerIteration = parsePositiveInt(opts.items, '--items');

  const timeoutMs =
    opts.modelCliTimeout !== undefined
      ? parsePositiveInt(opts.modelCliTimeout, '--model-cli-timeout')
      : undefined;
  let model: ModelClient;
  try {
    model = createModelClient(
      resolveModelClientKind(opts.modelClient),
      timeoutMs !== undefined ? { timeoutMs } : {}
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

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
  } else if (resolution.kind === 'config') {
    // --config-type guaranteed present by resolveRefineSource.
    const parsed = parseConfigTypeSpec(opts.configType!, cwd);
    if ('error' in parsed) {
      console.error(parsed.error);
      process.exitCode = 1;
      return;
    }
    source = new ConfigRefineSource({
      configFile: parsed.configFile,
      typeName: parsed.typeName,
      name: parsed.typeName
    });
    reportInPlace = true;
  } else {
    // mcp source: --mcp guaranteed present by resolveRefineSource.
    const mcpPath = opts.mcp!;
    const overlayPath = opts.overlay ?? join(cwd, '.skillit-overlay.json');

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

    const result = await runRefine(source, model, maxIterations, itemsPerIteration);
    reportResult(result, { reportInPlace, overlayPath });
    process.exitCode = result.passed ? 0 : 1;
    return;
  }

  const result = await runRefine(source, model, maxIterations, itemsPerIteration);
  reportResult(result, { reportInPlace });
  process.exitCode = result.passed ? 0 : 1;
}

export function buildRefineCommand(): Command {
  return new Command('refine')
    .description('Autonomously improve a skill via the audit→draft→review loop')
    .option('--source <kind>', 'cli | mcp | typedoc | config (auto-detected if omitted)')
    .option('--program <file#export>', 'commander program entry (cli source)')
    .option('--config-type <file#export>', 'config type entry (config source)')
    .option('--mcp <path>', 'path to mcp.json or MCP config file')
    .option('--server <name>', 'server name within the config (defaults to first enabled)')
    .option('--overlay <path>', 'path to overlay JSON file (runtime mode only)')
    .option('--mode <mode>', 'refine mode: build or runtime (auto-detected if omitted)')
    .option('--source-glob <glob>', 'glob pattern for TypeScript source files')
    .option('--max-iterations <n>', 'iteration cap (default 5)', '5')
    .option('--items <n>', 'work items per iteration (default 5)', '5')
    .option('--model-client <kind>', 'model backend: api | claude | codex | copilot', 'api')
    .option('--model-cli-timeout <ms>', 'per-call timeout for cli model backends (ms)')
    .action((opts: RefineCommandOpts) => runRefineCommand(opts));
}

function runRefine(
  source: RefineSource,
  model: ModelClient,
  maxIterations: number,
  itemsPerIteration: number
): ReturnType<typeof refineSkill> {
  return refineSkill({
    source,
    model,
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
