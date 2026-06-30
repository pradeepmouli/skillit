import { glob, readFile } from 'node:fs/promises';
import type { RefineTag } from '@skillit/core';
import { readOptionsTags } from './options-jsdoc.js';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.cache']);

/**
 * Generates candidate option-interface names for a command, in priority order.
 *
 * The documented convention is `<Command>Options` (e.g. `add-remote` →
 * `AddRemoteOptions`, `db:migrate` → `DbMigrateOptions`), but consumers
 * commonly use `<Command>Opts` or `<Command>CommandOpts` as well. All three
 * are probed so non-conventional names still get matched.
 */
export function interfaceNameCandidates(command: string): string[] {
  const pascal = command
    .split(/[-_:.\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return [`${pascal}Options`, `${pascal}Opts`, `${pascal}CommandOpts`];
}

/**
 * Returns whether `src` declares the interface named exactly `iface`.
 *
 * Matches on identifier boundaries so probing for `GenOptions` does not
 * spuriously match `interface GenOptionsExtra`.
 */
export function fileDeclaresInterface(src: string, iface: string): boolean {
  const escaped = iface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return src.match(new RegExp(String.raw`\binterface\s+${escaped}\b`)) !== null;
}

/**
 * Reads JSDoc routing tags for the first matching candidate interface across
 * all provided source files. Candidates are tried in priority order
 * (`<Command>Options` > `<Command>Opts` > `<Command>CommandOpts`).
 *
 * Returns an empty object when no match is found or no tags are present.
 */
export function readTagsAcross(
  candidates: string[],
  sources: Map<string, string>
): Partial<Record<RefineTag, string>> {
  for (const iface of candidates) {
    for (const src of sources.values()) {
      if (!fileDeclaresInterface(src, iface)) continue;
      const tags = readOptionsTags(iface, src);
      if (Object.keys(tags).length > 0) return tags;
    }
  }
  return {};
}

/**
 * Reads all source files matching the given glob pattern into a `file → contents` map.
 * Excludes `.d.ts` files and common build/dependency directories.
 */
export async function readSources(sourceGlob: string): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for await (const file of glob(sourceGlob, {
    exclude: (f) => f.endsWith('.d.ts') || f.split(/[\\/]/).some((seg) => EXCLUDED_DIRS.has(seg))
  })) {
    sources.set(file, await readFile(file, 'utf8'));
  }
  return sources;
}
