import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

async function hasMcpSdkDep(cwd: string): Promise<boolean> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = {
      ...(pkg['dependencies'] as Record<string, string> | undefined),
      ...(pkg['devDependencies'] as Record<string, string> | undefined)
    };
    return Object.keys(deps).some(
      (dep) => dep.startsWith('@modelcontextprotocol/') || dep === 'fastmcp'
    );
  } catch {
    return false;
  }
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

const RUNTIME_CONFIG_BASENAMES = new Set(['mcp.json', 'claude_desktop_config.json']);

/**
 * Detect refine mode from project context.
 *
 * @param cwd - directory to inspect for build/runtime signals
 * @param mcpConfigPath - optional path to the --mcp config file; if its
 *   basename is a known runtime config filename the file itself is treated
 *   as an additional runtime signal, allowing detection to work when the
 *   config lives outside the cwd ancestor chain (e.g. a desktop config dir).
 */
export async function detectRefineMode(
  cwd: string,
  mcpConfigPath?: string
): Promise<'build' | 'runtime' | 'ambiguous'> {
  const mcpFileIsRuntime =
    mcpConfigPath !== undefined && RUNTIME_CONFIG_BASENAMES.has(basename(mcpConfigPath));
  const [hasBuild, hasRuntimeFromCwd] = await Promise.all([hasMcpSdkDep(cwd), hasMcpConfig(cwd)]);
  const hasRuntime = hasRuntimeFromCwd || mcpFileIsRuntime;
  if (hasBuild && !hasRuntime) return 'build';
  if (hasRuntime && !hasBuild) return 'runtime';
  return 'ambiguous';
}
