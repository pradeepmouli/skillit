// packages/client/src/commands/gen.ts
import { isAbsolute, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import {
  classifyRefineSources,
  detectInstalledSources,
  detectProjectNature,
  type RefineSourceKind
} from '../detect-source.js';
import {
  generateCliSkill as defaultGenerateCliSkill,
  generateConfigSkill as defaultGenerateConfigSkill,
  generateMcpSkill as defaultGenerateMcpSkill,
  generateTypeDocSkill as defaultGenerateTypeDocSkill,
  type CliInvocationMode,
  type GenerateConfigSkillOpts,
  type GenerateMcpSkillOpts,
  type GenerateSkillOpts,
  type GenerateTypeDocSkillOpts
} from '../generate.js';
import { parseConfigTypeSpec, resolveRefineSource } from './refine.js';
import { resolveTypeDocEntry } from '../typedoc-entry.js';
import {
  SKILLIT_CONTENT_TYPES,
  loadSkillitConfig,
  type SkillitConfig,
  type SkillitContentType,
  type SkillitPluginConfig,
  type SkillitPluginName
} from '../config.js';

/** Injectable generators (test seam, mirrors InitDeps). */
export interface GenDeps {
  generateCliSkill?(opts: GenerateSkillOpts): Promise<void>;
  generateConfigSkill?(opts: GenerateConfigSkillOpts): Promise<void>;
  generateTypeDocSkill?(opts: GenerateTypeDocSkillOpts): Promise<void>;
  generateMcpSkill?(opts: GenerateMcpSkillOpts): Promise<void>;
}

/** Parsed options for the `gen` action. */
export interface GenCommandOpts {
  source?: string;
  program?: string;
  configType?: string;
  mcp?: string;
  server?: string;
  out?: string;
  invocation?: string;
}

interface ResolvedPluginOverrides {
  out: string;
  maxTokens?: number;
  contentTypeMaxTokens?: Partial<Record<SkillitContentType, number>>;
}

/**
 * Derive a collision-safe skill name from a package name.
 * `@scope/name` → `scope-name`, `name` → `name`.
 */
function skillNameFrom(packageName: string): string {
  return packageName.replace(/^@/, '').replace(/\//g, '-');
}

async function readPackageName(cwd: string): Promise<string> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg.name ?? 'skill';
  } catch {
    return 'skill';
  }
}

export function buildGenCommand(deps: GenDeps = {}): Command {
  const generateCliSkill = deps.generateCliSkill ?? defaultGenerateCliSkill;
  const generateConfigSkill = deps.generateConfigSkill ?? defaultGenerateConfigSkill;
  const generateTypeDocSkill = deps.generateTypeDocSkill ?? defaultGenerateTypeDocSkill;
  const generateMcpSkill = deps.generateMcpSkill ?? defaultGenerateMcpSkill;

  return new Command('gen')
    .description(
      'Deterministically (re)generate the skill from current source — no model, no install'
    )
    .option('--source <kind>', 'cli | mcp | typedoc | config (auto-detected if omitted)')
    .option('--program <file#export>', 'commander program entry (cli source)')
    .option('--config-type <file#export>', 'config type entry (config source)')
    .option('--mcp <path>', 'path to mcp.json or MCP config file (mcp source)')
    .option('--server <name>', 'MCP server entry to select (mcp source)')
    .option(
      '--out <dir>',
      'output directory for the generated skill (defaults to skillit.config.ts skillDir or "skills")'
    )
    .option(
      '--invocation <mode>',
      'invocation mode for CLI command examples: npx (zero-install) or global (bare binary)'
    )
    .action(async (opts: GenCommandOpts) => {
      const cwd = process.cwd();
      const loadedConfig = await loadSkillitConfig(cwd);

      // Detect the project nature at most once (it can spawn the project's CLI
      // bin). Only needed to auto-route when --source is omitted.
      const nature = opts.source === undefined ? await detectProjectNature(cwd) : undefined;

      if (opts.source === 'config') {
        const plugin = resolvePluginOverrides(opts, loadedConfig.config, 'config');
        const outDir = join(cwd, plugin.out);
        if (opts.configType === undefined) {
          throw new Error(
            'The config source requires --config-type <file#export> (e.g. ./src/config.ts#MyConfig).'
          );
        }
        const parsed = parseConfigTypeSpec(opts.configType, cwd);
        if ('error' in parsed) throw new Error(parsed.error);
        // No explicit name: ConfigRefineSource derives it from the package
        // nearest the config file (→ typeName), which is more correct in a
        // monorepo than this command's cwd.
        await generateConfigSkill({
          configFile: parsed.configFile,
          typeName: parsed.typeName,
          outDir,
          ...(plugin.maxTokens !== undefined ? { maxTokens: plugin.maxTokens } : {}),
          ...(plugin.contentTypeMaxTokens !== undefined
            ? { contentTypeMaxTokens: plugin.contentTypeMaxTokens }
            : {})
        });
        return;
      }

      // mcp: explicit --source, an explicit --mcp path (which only the mcp
      // source consumes), or auto-detected via @modelcontextprotocol/sdk.
      const isMcp =
        opts.source === 'mcp' ||
        (opts.source === undefined && (opts.mcp !== undefined || nature === 'mcp'));
      if (isMcp) {
        const plugin = resolvePluginOverrides(opts, loadedConfig.config, 'mcp');
        const outDir = join(cwd, plugin.out);
        if (opts.mcp === undefined) {
          throw new Error(
            'The mcp source requires --mcp <path> (path to mcp.json or MCP config file).'
          );
        }
        const mcpPath = isAbsolute(opts.mcp) ? opts.mcp : join(cwd, opts.mcp);
        await generateMcpSkill({
          mcpPath,
          ...(opts.server !== undefined ? { server: opts.server } : {}),
          outDir,
          ...(plugin.maxTokens !== undefined ? { maxTokens: plugin.maxTokens } : {}),
          ...(plugin.contentTypeMaxTokens !== undefined
            ? { contentTypeMaxTokens: plugin.contentTypeMaxTokens }
            : {})
        });
        return;
      }

      // typedoc: explicit, or auto-detected as a plain TS library.
      const isTypedoc = opts.source === 'typedoc' || nature === 'typedoc';
      if (isTypedoc) {
        const plugin = resolvePluginOverrides(opts, loadedConfig.config, 'typedoc');
        const outDir = join(cwd, plugin.out);
        const { entryPoints, tsconfig } = resolveTypeDocEntry(cwd);
        await generateTypeDocSkill({
          cwd,
          entryPoints,
          tsconfig,
          outDir,
          ...(plugin.maxTokens !== undefined ? { maxTokens: plugin.maxTokens } : {}),
          ...(plugin.contentTypeMaxTokens !== undefined
            ? { contentTypeMaxTokens: plugin.contentTypeMaxTokens }
            : {})
        });
        return;
      }

      // Resolve the cli source the same way refine does (handles auto-detection
      // and the ambiguous/none guidance).
      const candidates = await detectInstalledSources(cwd);
      const detected = classifyRefineSources(candidates);
      const resolution = resolveRefineSource(opts, detected, candidates);
      if ('error' in resolution) throw new Error(resolution.error);

      if (resolution.kind === 'cli') {
        const plugin = resolvePluginOverrides(opts, loadedConfig.config, 'cli');
        const outDir = join(cwd, plugin.out);
        const name = skillNameFrom(await readPackageName(cwd));
        const nature: RefineSourceKind = 'cli';
        await generateCliSkill({
          cwd,
          nature,
          name,
          outDir,
          ...(plugin.maxTokens !== undefined ? { maxTokens: plugin.maxTokens } : {}),
          ...(plugin.contentTypeMaxTokens !== undefined
            ? { contentTypeMaxTokens: plugin.contentTypeMaxTokens }
            : {}),
          ...(opts.program !== undefined ? { program: opts.program } : {}),
          ...(opts.invocation !== undefined
            ? { invocationMode: opts.invocation as CliInvocationMode }
            : {})
        });
        return;
      }

      // Auto-detection resolved to a source gen can't generate yet (e.g. mcp).
      throw new Error(
        `skillit gen does not yet support the ${resolution.kind} source; cli and config are supported in this release.`
      );
    });
}

function resolvePluginOverrides(
  opts: GenCommandOpts,
  config: SkillitConfig,
  pluginName: SkillitPluginName
): ResolvedPluginOverrides {
  const plugin = config.plugins?.[pluginName];
  const out = opts.out ?? plugin?.skillDir ?? config.skillDir ?? 'skills';
  const contentTypeMaxTokens = extractContentTypeMaxTokens(plugin);
  return {
    out,
    ...(plugin?.maxTokens !== undefined ? { maxTokens: plugin.maxTokens } : {}),
    ...(contentTypeMaxTokens && Object.keys(contentTypeMaxTokens).length > 0
      ? { contentTypeMaxTokens }
      : {})
  };
}

function extractContentTypeMaxTokens(
  plugin: SkillitPluginConfig | undefined
): Partial<Record<SkillitContentType, number>> | undefined {
  if (!plugin?.contentTypes) return undefined;
  const contentTypeMaxTokens: Partial<Record<SkillitContentType, number>> = {};
  for (const contentType of SKILLIT_CONTENT_TYPES) {
    const value = plugin.contentTypes[contentType]?.maxTokens;
    if (typeof value === 'number') contentTypeMaxTokens[contentType] = value;
  }
  return Object.keys(contentTypeMaxTokens).length > 0 ? contentTypeMaxTokens : undefined;
}
