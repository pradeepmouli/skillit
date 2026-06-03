import type { ExtractedConfigSurface, ExtractedConfigOption } from '@to-skills/core';

/**
 * Merges JSDoc tag metadata from a typed config interface surface into CLI
 * option metadata extracted from commander/--help output.
 *
 * The CLI surface is treated as authoritative for structural fields (flags,
 * description, required, defaultValue). The config surface contributes rich
 * JSDoc metadata (remarks, useWhen, avoidWhen, pitfalls, category) that the
 * CLI help text does not capture.
 *
 * @param cliSurface   - The surface extracted from CLI introspection/help parsing
 * @param configSurface - The surface extracted from a typed config interface (optional)
 * @returns A new ExtractedConfigSurface combining both sources
 *
 * @category Correlation
 * @useWhen
 * - You have both CLI surfaces (from introspection/help) and typed config interfaces (from TypeDoc)
 * - You want JSDoc @useWhen/@avoidWhen/@never tags to appear on CLI options in the generated skill
 */
export function correlateFlags(
  cliSurface: ExtractedConfigSurface,
  configSurface: ExtractedConfigSurface | undefined
): ExtractedConfigSurface {
  if (!configSurface) return cliSurface;

  // Build lookup: lowercase property name → config option
  const configLookup = new Map<string, ExtractedConfigOption>();
  for (const opt of configSurface.options) {
    configLookup.set(opt.name.toLowerCase(), opt);
  }

  // Merge each CLI option with matching config property
  const mergedOptions: ExtractedConfigOption[] = cliSurface.options.map((cliOpt) => {
    const configOpt = configLookup.get(cliOpt.name.toLowerCase());
    if (!configOpt) return cliOpt;

    return {
      // CLI is authoritative for structural/presentation fields
      ...cliOpt,
      // Use config description as fallback when CLI description is empty
      description: cliOpt.description || configOpt.description,
      // Config provides JSDoc-enriched metadata
      remarks: cliOpt.remarks ?? configOpt.remarks,
      useWhen: cliOpt.useWhen ?? configOpt.useWhen,
      avoidWhen: cliOpt.avoidWhen ?? configOpt.avoidWhen,
      pitfalls: cliOpt.pitfalls ?? configOpt.pitfalls,
      category: cliOpt.category ?? configOpt.category
    };
  });

  // Merge command-level tags from config surface into CLI surface
  return {
    ...cliSurface,
    options: mergedOptions,
    useWhen: cliSurface.useWhen ?? configSurface.useWhen,
    avoidWhen: cliSurface.avoidWhen ?? configSurface.avoidWhen,
    pitfalls: cliSurface.pitfalls ?? configSurface.pitfalls,
    remarks: cliSurface.remarks ?? configSurface.remarks,
    // A config-provided usage example (e.g. from JSDoc @example) is preferred
    // over commander's synthesized boilerplate (`[options]`, `[options] <args>`).
    usage: isBoilerplateUsage(cliSurface.usage)
      ? (configSurface.usage ?? cliSurface.usage)
      : (cliSurface.usage ?? configSurface.usage)
  };
}

/**
 * Whether a usage string is commander's synthesized default (no authored
 * example), e.g. `[options]`, `[options] [command]`, `[options] <file>`.
 */
function isBoilerplateUsage(usage: string | undefined): boolean {
  if (usage === undefined) return true;
  return usage.match(/^\[options\]([\s]+[<[].*)?$/) !== null;
}
