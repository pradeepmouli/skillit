import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

function isMcpServerDep(dep: string): boolean {
  // Match server-implementation packages only. Excludes purely consumer-side
  // packages such as @modelcontextprotocol/inspector or @modelcontextprotocol/client-*
  // which do not imply the project has editable server source files.
  return (
    dep === '@modelcontextprotocol/sdk' ||
    dep.startsWith('@modelcontextprotocol/server-') ||
    dep === 'fastmcp'
  );
}

async function hasMcpSdkDep(cwd: string): Promise<boolean> {
  const home = homedir();
  let dir = cwd;
  while (dir !== home && dir !== dirname(dir)) {
    try {
      const raw = await readFile(join(dir, 'package.json'), 'utf8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      const deps = {
        ...(pkg['dependencies'] as Record<string, string> | undefined),
        ...(pkg['devDependencies'] as Record<string, string> | undefined)
      };
      if (Object.keys(deps).some(isMcpServerDep)) return true;
    } catch {
      // no package.json or parse error in this dir; keep walking
    }
    dir = dirname(dir);
  }
  return false;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hasMcpConfig(cwd: string): Promise<boolean> {
  const home = homedir();
  let dir = cwd;
  while (dir !== home && dir !== dirname(dir)) {
    if (
      (await fileExists(join(dir, 'mcp.json'))) ||
      (await fileExists(join(dir, 'claude_desktop_config.json')))
    ) {
      return true;
    }
    dir = dirname(dir);
  }
  return false;
}

const KNOWN_RUNTIME_BASENAMES = new Set(['mcp.json', 'claude_desktop_config.json']);

async function isMcpRuntimeConfigFile(path: string): Promise<boolean> {
  if (KNOWN_RUNTIME_BASENAMES.has(basename(path))) return true;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return 'mcpServers' in parsed;
  } catch {
    return false;
  }
}

/**
 * Detect refine mode from project context.
 *
 * @param cwd - directory to inspect for build/runtime signals
 * @param mcpConfigPath - optional path to the --mcp config file; if its
 *   basename is a known runtime config filename, or its contents contain a
 *   top-level `mcpServers` key, it is treated as an additional runtime signal.
 */
export async function detectRefineMode(
  cwd: string,
  mcpConfigPath?: string
): Promise<'build' | 'runtime' | 'ambiguous'> {
  const [hasBuild, hasRuntimeFromCwd, mcpFileIsRuntime] = await Promise.all([
    hasMcpSdkDep(cwd),
    hasMcpConfig(cwd),
    mcpConfigPath !== undefined ? isMcpRuntimeConfigFile(mcpConfigPath) : Promise.resolve(false)
  ]);
  const hasRuntime = hasRuntimeFromCwd || mcpFileIsRuntime;
  if (hasBuild && !hasRuntime) return 'build';
  if (hasRuntime && !hasBuild) return 'runtime';
  return 'ambiguous';
}
