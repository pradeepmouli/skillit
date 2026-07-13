import { access, readFile, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type SkillitPluginName = 'cli' | 'config' | 'mcp' | 'typedoc';

export const SKILLIT_CONTENT_TYPES = [
  'skill',
  'functions',
  'classes',
  'types',
  'variables',
  'commands',
  'config',
  'docs',
  'resources',
  'prompts',
  'examples'
] as const;

export type SkillitContentType = (typeof SKILLIT_CONTENT_TYPES)[number];

export interface SkillitContentTypeOverride {
  maxTokens?: number;
}

export interface SkillitPluginConfig {
  skillDir?: string;
  maxTokens?: number;
  contentTypes?: Partial<Record<SkillitContentType, SkillitContentTypeOverride>>;
}

export interface SkillitConfig {
  skillDir?: string;
  plugins?: Partial<Record<SkillitPluginName, SkillitPluginConfig>>;
}

export interface LoadedSkillitConfig {
  path?: string;
  config: SkillitConfig;
}

const CONFIG_CANDIDATES = [
  'skillit.config.ts',
  'skillit.config.mts',
  'skillit.config.js',
  'skillit.config.mjs',
  'skillit.config.cjs'
] as const;

export function skillitConfigCandidates(): readonly string[] {
  return CONFIG_CANDIDATES;
}

export function defineConfig(config: SkillitConfig): SkillitConfig {
  return config;
}

/** @deprecated Use {@link defineConfig} instead. */
export function defineSkillitConfig(config: SkillitConfig): SkillitConfig {
  return defineConfig(config);
}

export async function loadSkillitConfig(cwd: string): Promise<LoadedSkillitConfig> {
  const path = await findFirstConfigPath(cwd);
  if (!path) return { config: {} };

  const rawConfig =
    path.endsWith('.ts') || path.endsWith('.mts')
      ? await loadTypeScriptLikeConfig(path)
      : await loadJavaScriptConfig(path);

  return { path, config: normalizeConfig(rawConfig) };
}

async function findFirstConfigPath(cwd: string): Promise<string | undefined> {
  for (const name of CONFIG_CANDIDATES) {
    const candidate = join(cwd, name);
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadJavaScriptConfig(path: string): Promise<unknown> {
  const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
  return mod.default ?? {};
}

async function loadTypeScriptLikeConfig(path: string): Promise<unknown> {
  const source = await readFile(path, 'utf8');
  let ts: typeof import('typescript');
  try {
    ts = await import('typescript');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Loading ${path} requires the "typescript" package. Install it and try again. (${reason})`
    );
  }
  try {
    const transpiled = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText;
    const helperName = `.skillit.config.helper-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`;
    const helperPath = join(dirname(path), helperName);
    const runtimePath = join(
      dirname(path),
      `.skillit.config.runtime-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`
    );
    const helperSpecifier = `./${basename(helperPath)}`;
    const rewritten = transpiled
      .replaceAll("'@skillit/client'", `'${helperSpecifier}'`)
      .replaceAll('"@skillit/client"', `"${helperSpecifier}"`);
    await writeFile(
      helperPath,
      `export function defineConfig(config) { return config; }\nexport const defineSkillitConfig = defineConfig;\n`,
      'utf8'
    );
    await writeFile(runtimePath, rewritten, 'utf8');
    try {
      const mod = (await import(pathToFileURL(runtimePath).href)) as { default?: unknown };
      return mod.default ?? {};
    } finally {
      await unlink(helperPath).catch(() => {});
      await unlink(runtimePath).catch(() => {});
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${path}: ${reason}`);
  }
}

function normalizeConfig(raw: unknown): SkillitConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('skillit config must export an object.');
  }
  const input = raw as Record<string, unknown>;
  const output: SkillitConfig = {};

  if (typeof input['skillDir'] === 'string') output.skillDir = input['skillDir'];

  if (
    typeof input['plugins'] === 'object' &&
    input['plugins'] !== null &&
    !Array.isArray(input['plugins'])
  ) {
    const plugins = input['plugins'] as Record<string, unknown>;
    const normalizedPlugins: Partial<Record<SkillitPluginName, SkillitPluginConfig>> = {};
    for (const key of ['cli', 'config', 'mcp', 'typedoc'] as const) {
      const value = plugins[key];
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      const pluginInput = value as Record<string, unknown>;
      const plugin: SkillitPluginConfig = {};
      if (typeof pluginInput['skillDir'] === 'string') plugin.skillDir = pluginInput['skillDir'];
      if (
        typeof pluginInput['maxTokens'] === 'number' &&
        Number.isFinite(pluginInput['maxTokens'])
      ) {
        plugin.maxTokens = pluginInput['maxTokens'];
      }
      if (
        typeof pluginInput['contentTypes'] === 'object' &&
        pluginInput['contentTypes'] !== null &&
        !Array.isArray(pluginInput['contentTypes'])
      ) {
        const contentTypesInput = pluginInput['contentTypes'] as Record<string, unknown>;
        const contentTypes: Partial<Record<SkillitContentType, SkillitContentTypeOverride>> = {};
        for (const contentType of SKILLIT_CONTENT_TYPES) {
          const override = contentTypesInput[contentType];
          if (typeof override !== 'object' || override === null || Array.isArray(override))
            continue;
          const parsed = override as Record<string, unknown>;
          if (typeof parsed['maxTokens'] === 'number' && Number.isFinite(parsed['maxTokens'])) {
            contentTypes[contentType] = { maxTokens: parsed['maxTokens'] };
          }
        }
        if (Object.keys(contentTypes).length > 0) plugin.contentTypes = contentTypes;
      }
      normalizedPlugins[key] = plugin;
    }
    if (Object.keys(normalizedPlugins).length > 0) output.plugins = normalizedPlugins;
  }

  return output;
}
