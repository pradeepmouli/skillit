import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type RefineSourceKind = 'cli' | 'mcp' | 'typedoc';
export type DetectedRefineSource = RefineSourceKind | 'ambiguous' | 'none';

/** Map an installed package name to its refine source kind, if any. */
function packageToSource(dep: string): RefineSourceKind | undefined {
  if (dep === '@to-skills/cli') return 'cli';
  if (dep === '@to-skills/mcp') return 'mcp';
  if (dep === 'typedoc-plugin-to-skills' || dep === '@to-skills/typedoc') return 'typedoc';
  return undefined;
}

/**
 * Detect the refine source from `@to-skills/*` packages installed in `cwd`'s
 * `package.json` (union of `dependencies` + `devDependencies`).
 *
 * - 0 matching packages → `'none'`
 * - exactly 1 distinct source → that source
 * - more than 1 distinct source → `'ambiguous'`
 * - missing or unreadable `package.json` → `'none'` (never throws)
 */
export async function detectRefineSource(cwd: string): Promise<DetectedRefineSource> {
  let deps: Record<string, string>;
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    deps = {
      ...(pkg['dependencies'] as Record<string, string> | undefined),
      ...(pkg['devDependencies'] as Record<string, string> | undefined)
    };
  } catch {
    return 'none';
  }

  const sources = new Set<RefineSourceKind>();
  for (const dep of Object.keys(deps)) {
    const source = packageToSource(dep);
    if (source) sources.add(source);
  }

  if (sources.size === 0) return 'none';
  if (sources.size === 1) return [...sources][0]!;
  return 'ambiguous';
}
