// packages/client/src/generate.ts
import { extractCliSkill, loadProgram, writeCliSkill } from '@skillit/cli';
import { ConfigRefineSource, renderSkills, writeSkills } from '@skillit/core';
import type { RefineSourceKind } from './detect-source.js';

/** Options for CLI-path skill generation. */
export interface GenerateSkillOpts {
  /** Project root being generated for. */
  cwd: string;
  /** Resolved project nature. */
  nature: RefineSourceKind;
  /** Skill name (consumer package name, scope stripped). */
  name: string;
  /** Absolute output directory (`<cwd>/<out>`). */
  outDir: string;
  /** `--program <file#export>` entry, if provided. */
  program?: string;
}

/** Options for config-path skill generation. */
export interface GenerateConfigSkillOpts {
  /** Absolute path to the TypeScript file declaring the config type. */
  configFile: string;
  /** Exported interface / type-alias name to document. */
  typeName: string;
  /**
   * Explicit skill name. Optional — when omitted, `ConfigRefineSource` derives
   * it from the package nearest the config file (scope-stripped), falling back
   * to `typeName`. Pass this only to override that (e.g. a forced skill name).
   */
  name?: string;
  /** Absolute output directory (`<cwd>/<out>`). */
  outDir: string;
}

/** Options for typedoc-path skill generation. */
export interface GenerateTypeDocSkillOpts {
  /** Package root. */
  cwd: string;
  /** Entry-point source files (absolute). */
  entryPoints: string[];
  /** Path to tsconfig.json. */
  tsconfig: string;
  /** Absolute output directory. */
  outDir: string;
}

/**
 * TypeDoc-path skill generation — delegates to the plugin pipeline.
 *
 * `@skillit/typedoc` (and its `typedoc` peer) is imported lazily so the CLI
 * does not load TypeDoc at startup: only the typedoc source path pays that
 * cost, and cli/config/mcp consumers need not install the `typedoc` peer.
 */
export async function generateTypeDocSkill(opts: GenerateTypeDocSkillOpts): Promise<void> {
  const { generateTypeDocSkills } = await import('@skillit/typedoc');
  await generateTypeDocSkills({
    entryPoints: opts.entryPoints,
    tsconfig: opts.tsconfig,
    cwd: opts.cwd,
    outDir: opts.outDir
  });
}

/** Options for mcp-path skill generation. */
export interface GenerateMcpSkillOpts {
  /** Path to mcp.json / MCP config file. */
  mcpPath: string;
  /** Server entry to select; defaults to the first enabled entry. */
  server?: string;
  /** Absolute output directory. */
  outDir: string;
}

/**
 * MCP-path skill generation — lazily imports `@skillit/mcp` so the CLI does not
 * load the MCP stack (and its SDK) at startup for non-mcp commands.
 */
export async function generateMcpSkill(opts: GenerateMcpSkillOpts): Promise<void> {
  const { generateMcpSkill: run } = await import('@skillit/mcp');
  await run({
    mcpPath: opts.mcpPath,
    ...(opts.server !== undefined ? { serverName: opts.server } : {}),
    outDir: opts.outDir
  });
}

/** CLI-path skill generation: loadProgram → extractCliSkill → writeCliSkill. */
export async function generateCliSkill(opts: GenerateSkillOpts): Promise<void> {
  const program = await loadProgram({ program: opts.program, cwd: opts.cwd });
  const skill = await extractCliSkill({ program, metadata: { name: opts.name } });
  writeCliSkill(skill, { outDir: opts.outDir });
}

/** Config-path skill generation: extract the surface → render → write. */
export async function generateConfigSkill(opts: GenerateConfigSkillOpts): Promise<void> {
  const skill = await new ConfigRefineSource({
    configFile: opts.configFile,
    typeName: opts.typeName,
    // Only pass an explicit name when provided; otherwise let ConfigRefineSource
    // derive it (package nearest the config file → typeName).
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    // A config-specific description so the rendered skill describes the config
    // surface, not the package blurb (which is about the whole package).
    description: `Configuration options for ${opts.typeName}.`
  }).extract();
  // Config skills are content-rich (per-option routing + example); raise the
  // per-reference token budget so a multi-option surface isn't truncated.
  const rendered = renderSkills([skill], { outDir: opts.outDir, maxTokens: 16000 });
  writeSkills(rendered, { outDir: opts.outDir });
}
