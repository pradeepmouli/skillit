import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type SkillitPluginName = 'cli' | 'config' | 'mcp' | 'typedoc';

export type SkillitContentType =
  | 'skill'
  | 'functions'
  | 'classes'
  | 'types'
  | 'variables'
  | 'commands'
  | 'config'
  | 'docs'
  | 'resources'
  | 'prompts'
  | 'examples';

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

export function defineSkillitConfig(config: SkillitConfig): SkillitConfig {
  return config;
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
  const transformed = source
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/m, 'return ');
  if (!/\breturn\b/.test(transformed)) {
    throw new Error(
      `Unsupported ${path}: expected a default export (for example: export default defineSkillitConfig({...})).`
    );
  }
  try {
    const factory = new Function('defineSkillitConfig', transformed) as (
      define: typeof defineSkillitConfig
    ) => unknown;
    return factory(defineSkillitConfig);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to evaluate ${path}: ${reason}`);
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
        for (const contentType of [
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
        ] as const) {
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
