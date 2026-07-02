import { readFile, glob } from 'node:fs/promises';
import type { ExtractedConfigSurface } from '@skillit/core';
import { readOptionsTags } from './options-jsdoc.js';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.cache']);

/**
 * Candidate option-interface names for a command, in priority order.
 *
 * The documented convention is `<Command>Options` (e.g. `add-remote` →
 * `AddRemoteOptions`, `db:migrate` → `DbMigrateOptions`), but real consumers —
 * including skillit's own CLI — commonly name these `<Command>Opts` or
 * `<Command>CommandOpts` (e.g. `init` → `InitOpts`, `refine` →
 * `RefineCommandOpts`). We probe all three and use the first that a source
 * file actually declares, so a non-conventional consumer still gets matched
 * instead of silently skipped (or colliding with an unrelated `XOptions`).
 */
export function interfaceNameCandidates(command: string): string[] {
  const pascal = command
    .split(/[-_:.\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return [`${pascal}Options`, `${pascal}Opts`, `${pascal}CommandOpts`];
}

/** Globs the source files once and returns a file → contents map. */
export async function readSources(sourceGlob: string): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for await (const file of glob(sourceGlob, {
    exclude: (f) => f.endsWith('.d.ts') || f.split(/[\\/]/).some((seg) => EXCLUDED_DIRS.has(seg))
  })) {
    sources.set(file, await readFile(file, 'utf8'));
  }
  return sources;
}

/**
 * Returns whether `src` declares the interface named exactly `iface`.
 *
 * Matches on identifier boundaries so the probe for `GenOptions` does not
 * spuriously match `interface GenOptionsExtra`. Shared by file-selection
 * and tag-reading so both agree on what counts as the interface.
 */
export function fileDeclaresInterface(src: string, iface: string): boolean {
  const escaped = iface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\binterface\\s+${escaped}\\b`);
  return pattern.test(src);
}

/**
 * Reads tags for the first candidate interface that a globbed source file
 * declares with at least one tag. Candidates are tried in priority order so
 * the documented `<Command>Options` name wins over the `Opts`/`CommandOpts`
 * fallbacks when more than one is present.
 */
function readTagsAcross(
  candidates: string[],
  sources: Map<string, string>
): Partial<Record<'useWhen' | 'avoidWhen' | 'never' | 'remarks' | 'example', string>> {
  for (const iface of candidates) {
    for (const src of sources.values()) {
      if (!fileDeclaresInterface(src, iface)) {
        continue;
      }
      const tags = readOptionsTags(iface, src);
      if (Object.keys(tags).length > 0) {
        return tags;
      }
    }
  }
  return {};
}

/**
 * Correlate JSDoc routing tags (`@useWhen`/`@avoidWhen`/`@never`/`@remarks`/
 * `@example`) from `<Command>Options`-style interfaces in the consumer's TS
 * source onto CLI command surfaces, so they flow into the generated skill's
 * `## When to Use` / `## NEVER` sections.
 *
 * Used by both `skillit gen --source cli` (via `generateCliSkill`) and
 * `skillit refine --source cli` (via `CliRefineSource`) so the two paths
 * produce symmetric output — closes skillit#87.
 *
 * @useWhen
 * - You have introspected CLI command surfaces and a glob of the consumer's
 *   TypeScript source, and need `ExtractedConfigSurface[]` with JSDoc-derived
 *   routing content correlated onto each command
 * @never
 * - NEVER call this with a glob that resolves zero files and expect a warning — it silently returns empty ExtractedConfigSurface[] for every surface, same as "no JSDoc tags found"
 */
export async function correlateConfigSurfaces(
  surfaces: readonly { name: string }[],
  sourceGlob: string
): Promise<ExtractedConfigSurface[]> {
  const sources = await readSources(sourceGlob);
  const configSurfaces: ExtractedConfigSurface[] = [];

  for (const surface of surfaces) {
    const candidates = interfaceNameCandidates(surface.name);
    const tags = readTagsAcross(candidates, sources);

    const configSurface: ExtractedConfigSurface = {
      name: surface.name,
      description: '',
      sourceType: 'cli',
      options: []
    };
    let hasContent = false;
    if (tags.useWhen !== undefined) {
      configSurface.useWhen = [tags.useWhen];
      hasContent = true;
    }
    if (tags.avoidWhen !== undefined) {
      configSurface.avoidWhen = [tags.avoidWhen];
      hasContent = true;
    }
    if (tags.never !== undefined) {
      configSurface.never = [tags.never];
      hasContent = true;
    }
    if (tags.remarks !== undefined) {
      configSurface.remarks = tags.remarks;
      hasContent = true;
    }
    if (tags.example !== undefined) {
      configSurface.usage = tags.example;
      hasContent = true;
    }

    if (hasContent) {
      configSurfaces.push(configSurface);
    }
  }

  return configSurfaces;
}
