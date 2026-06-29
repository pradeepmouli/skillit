// packages/client/src/generate.ts
import {
  applyNpxMode,
  extractCliSkill,
  loadProgram,
  writeCliSkill,
  type CliInvocationMode
} from '@skillit/cli';
import {
  ConfigRefineSource,
  discoverDepSkills,
  findNearestPackageDir,
  readPackageMetadata,
  renderSkills,
  truncateToTokenBudget,
  writeSkills
} from '@skillit/core';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { SKILLIT_CONTENT_TYPES, type SkillitContentType } from './config.js';
export type { CliInvocationMode } from '@skillit/cli';
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
  /**
   * Override the invocation mode for command examples.
   * Defaults to `npx` for public packages with a `bin` field, `global` otherwise.
   */
  invocationMode?: CliInvocationMode;
  /** Optional render token cap override. */
  maxTokens?: number;
  /** Optional per-content-type reference token overrides. */
  contentTypeMaxTokens?: Partial<Record<SkillitContentType, number>>;
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
  /** Optional render token cap override. */
  maxTokens?: number;
  /** Optional per-content-type reference token overrides. */
  contentTypeMaxTokens?: Partial<Record<SkillitContentType, number>>;
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
  /** Optional render token cap override. */
  maxTokens?: number;
  /** Optional per-content-type reference token overrides. */
  contentTypeMaxTokens?: Partial<Record<SkillitContentType, number>>;
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
    outDir: opts.outDir,
    ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {})
  });
  await applyContentTypeTokenOverrides(opts.outDir, opts.contentTypeMaxTokens);
}

/** Options for mcp-path skill generation. */
export interface GenerateMcpSkillOpts {
  /** Path to mcp.json / MCP config file. */
  mcpPath: string;
  /** Server entry to select; defaults to the first enabled entry. */
  server?: string;
  /** Absolute output directory. */
  outDir: string;
  /** Optional render token cap override. */
  maxTokens?: number;
  /** Optional per-content-type reference token overrides. */
  contentTypeMaxTokens?: Partial<Record<SkillitContentType, number>>;
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
    outDir: opts.outDir,
    ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {})
  });
  await applyContentTypeTokenOverrides(opts.outDir, opts.contentTypeMaxTokens);
}

/** CLI-path skill generation: loadProgram → extractCliSkill → applyNpxMode → writeCliSkill. */
export async function generateCliSkill(opts: GenerateSkillOpts): Promise<void> {
  const program = await loadProgram({ program: opts.program, cwd: opts.cwd });
  const skill = await extractCliSkill({ program, metadata: { name: opts.name } });
  const pkgDir = await findNearestPackageDir(opts.cwd);
  const meta = pkgDir ? await readPackageMetadata(pkgDir) : {};
  applyNpxMode(skill, meta, opts.invocationMode);
  if (pkgDir) {
    skill.rootDir = pkgDir;
    skill.seeAlso = await discoverDepSkills(pkgDir);
  }
  writeCliSkill(skill, {
    outDir: opts.outDir,
    ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {})
  });
  await applyContentTypeTokenOverrides(opts.outDir, opts.contentTypeMaxTokens);
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
  const pkgDir = await findNearestPackageDir(dirname(opts.configFile));
  if (pkgDir) {
    skill.rootDir = pkgDir;
    skill.seeAlso = await discoverDepSkills(pkgDir);
  }
  // Config skills are content-rich (per-option routing + example); raise the
  // per-reference token budget so a multi-option surface isn't truncated.
  const rendered = renderSkills([skill], {
    outDir: opts.outDir,
    maxTokens: opts.maxTokens ?? 16000
  });
  writeSkills(rendered, { outDir: opts.outDir });
  await applyContentTypeTokenOverrides(opts.outDir, opts.contentTypeMaxTokens);
}

async function applyContentTypeTokenOverrides(
  outDir: string,
  contentTypeMaxTokens: Partial<Record<SkillitContentType, number>> | undefined
): Promise<void> {
  if (!contentTypeMaxTokens || Object.keys(contentTypeMaxTokens).length === 0) return;
  const files = await collectMarkdownFiles(outDir);
  for (const file of files) {
    const contentType = contentTypeFromFile(file, outDir);
    if (!contentType) continue;
    const maxTokens = contentTypeMaxTokens[contentType];
    if (maxTokens === undefined || maxTokens < 1) continue;
    const raw = await readFile(file, 'utf8');
    const next = truncateToTokenBudget(raw, maxTokens);
    if (next !== raw) {
      await writeFile(file, next, 'utf8');
    }
  }
}

async function collectMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, out);
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) out.push(path);
  }
}

function contentTypeFromFile(file: string, outDir: string): SkillitContentType | undefined {
  const normalized = relative(outDir, file).replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.length < 2) return undefined;
  if (segments[segments.length - 1] === 'SKILL.md') return 'skill';
  if (segments[1] !== 'references') return undefined;
  const bucket = segments[2];
  if (!bucket) return undefined;
  if (bucket === 'docs') return 'docs';
  if (SKILLIT_CONTENT_TYPES.includes(bucket as SkillitContentType)) {
    return bucket as SkillitContentType;
  }
  return undefined;
}
