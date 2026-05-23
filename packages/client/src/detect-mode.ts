import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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

export async function detectRefineMode(cwd: string): Promise<'build' | 'runtime' | 'ambiguous'> {
  const [hasBuild, hasRuntime] = await Promise.all([hasMcpSdkDep(cwd), hasMcpConfig(cwd)]);
  if (hasBuild && !hasRuntime) return 'build';
  if (hasRuntime && !hasBuild) return 'runtime';
  return 'ambiguous';
}
