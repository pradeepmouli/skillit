import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type RefineSourceKind = 'cli' | 'mcp' | 'typedoc';
export type DetectedRefineSource = RefineSourceKind | 'ambiguous' | 'none';

/**
 * Read the union of `dependencies` + `devDependencies` from `<cwd>/package.json`.
 * Missing or unreadable `package.json` → `{}` (never throws). Single source of
 * truth for dependency reads across detection helpers.
 */
async function readDeps(cwd: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...(pkg['dependencies'] as Record<string, string> | undefined),
      ...(pkg['devDependencies'] as Record<string, string> | undefined)
    };
  } catch {
    return {};
  }
}

/** Map an installed package name to its refine source kind, if any. */
function packageToSource(dep: string): RefineSourceKind | undefined {
  if (dep === '@to-skills/cli') return 'cli';
  if (dep === '@to-skills/mcp') return 'mcp';
  if (dep === 'typedoc-plugin-to-skills' || dep === '@to-skills/typedoc') return 'typedoc';
  return undefined;
}

/** Stable, canonical ordering for reported candidate lists. */
const SOURCE_ORDER: readonly RefineSourceKind[] = ['cli', 'mcp', 'typedoc'];

/**
 * Detect the raw, deduped list of refine source kinds installed in `cwd`'s
 * `package.json` (union of `dependencies` + `devDependencies`), in stable
 * order (`cli`, `mcp`, `typedoc`).
 *
 * Missing or unreadable `package.json` → `[]` (never throws). This is the
 * single place the package→source mapping lives; {@link detectRefineSource}
 * is derived from it.
 */
export async function detectInstalledSources(cwd: string): Promise<RefineSourceKind[]> {
  const deps = await readDeps(cwd);

  const sources = new Set<RefineSourceKind>();
  for (const dep of Object.keys(deps)) {
    const source = packageToSource(dep);
    if (source) sources.add(source);
  }
  return SOURCE_ORDER.filter((s) => sources.has(s));
}

/**
 * Collapse an installed-source list into the {@link DetectedRefineSource}
 * verdict: empty → `'none'`, single → that source, many → `'ambiguous'`.
 */
export function classifyRefineSources(sources: readonly RefineSourceKind[]): DetectedRefineSource {
  if (sources.length === 0) return 'none';
  if (sources.length === 1) return sources[0]!;
  return 'ambiguous';
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
  return classifyRefineSources(await detectInstalledSources(cwd));
}

/**
 * Detect the nature of the project at `cwd` from its `package.json` deps:
 * - has `commander` or `yargs` → `'cli'`
 * - else has `@modelcontextprotocol/sdk` → `'mcp'`
 * - else → `'typedoc'` (safe default for a plain TS library)
 *
 * Missing or unreadable `package.json` → `'typedoc'` (never throws). The `cli`
 * check is evaluated first, then `mcp`, then the `typedoc` default.
 */
export async function detectProjectNature(cwd: string): Promise<RefineSourceKind> {
  const deps = await readDeps(cwd);
  if ('commander' in deps || 'yargs' in deps) return 'cli';
  if ('@modelcontextprotocol/sdk' in deps) return 'mcp';
  return 'typedoc';
}

/**
 * Detect the package manager for `cwd` by lockfile presence:
 * `pnpm-lock.yaml` → `'pnpm'`, `yarn.lock` → `'yarn'`, else `'npm'`.
 */
export function detectPackageManager(cwd: string): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}
