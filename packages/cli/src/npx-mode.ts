import type { ExtractedSkill, PackageMetadata } from '@skillit/core';

export type CliInvocationMode = 'npx' | 'global';

/**
 * Determine the invocation mode for a CLI skill.
 *
 * Defaults to `npx` for public packages that advertise a `bin` entry;
 * `global` otherwise. An explicit `override` always wins.
 */
export function resolveInvocationMode(
  meta: PackageMetadata,
  override?: CliInvocationMode
): CliInvocationMode {
  if (override) return override;
  if (meta.bin && Object.keys(meta.bin).length > 0 && !meta.isPrivate) return 'npx';
  return 'global';
}

/**
 * Populate `skill.cliInvocationPrefix`, `skill.readmeFeatures`,
 * `skill.readmeTroubleshooting`, and `skill.examples` from package metadata.
 *
 * For public packages with a `bin` field, README content has the bare binary
 * name substituted with `npx <fullPackageName>` so the skill works without
 * a global install.
 */
export function applyNpxMode(
  skill: ExtractedSkill,
  meta: PackageMetadata,
  invocationMode?: CliInvocationMode
): void {
  const mode = resolveInvocationMode(meta, invocationMode);
  const binName = meta.bin ? Object.keys(meta.bin)[0] : undefined;
  const pkgName = meta.fullPackageName;

  const prefix = mode === 'npx' && pkgName ? `npx ${pkgName}` : undefined;
  if (prefix) skill.cliInvocationPrefix = prefix;

  const sub = (s: string): string => (prefix && binName ? s.replaceAll(binName, prefix) : s);

  if (meta.readme?.features) skill.readmeFeatures = sub(meta.readme.features);
  if (meta.readme?.troubleshooting) skill.readmeTroubleshooting = sub(meta.readme.troubleshooting);
  if (meta.readme?.quickStart) skill.examples = [sub(meta.readme.quickStart), ...skill.examples];
}
