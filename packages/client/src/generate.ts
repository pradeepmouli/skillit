// packages/client/src/generate.ts
import { extractCliSkill, loadProgram, writeCliSkill } from '@skillit/cli';
import { ConfigRefineSource, renderSkills, writeSkills } from '@skillit/core';
import type { RefineSourceKind } from './detect-source.js';

/** Options for CLI-path skill generation. */
export interface GenerateSkillOpts {
  /** Project root being generated for. */
  cwd: string;
  /** Resolved project nature. */
  nature: RefineSourceKind;
  /** Skill name (consumer package name, scope stripped). */
  name: string;
  /** Absolute output directory (`<cwd>/<out>`). */
  outDir: string;
  /** `--program <file#export>` entry, if provided. */
  program?: string;
}

/** Options for config-path skill generation. */
export interface GenerateConfigSkillOpts {
  /** Absolute path to the TypeScript file declaring the config type. */
  configFile: string;
  /** Exported interface / type-alias name to document. */
  typeName: string;
  /**
   * Explicit skill name. Optional — when omitted, `ConfigRefineSource` derives
   * it from the package nearest the config file (scope-stripped), falling back
   * to `typeName`. Pass this only to override that (e.g. a forced skill name).
   */
  name?: string;
  /** Absolute output directory (`<cwd>/<out>`). */
  outDir: string;
}

/** CLI-path skill generation: loadProgram → extractCliSkill → writeCliSkill. */
export async function generateCliSkill(opts: GenerateSkillOpts): Promise<void> {
  const program = await loadProgram({ program: opts.program, cwd: opts.cwd });
  const skill = await extractCliSkill({ program, metadata: { name: opts.name } });
  writeCliSkill(skill, { outDir: opts.outDir });
}

/** Config-path skill generation: extract the surface → render → write. */
export async function generateConfigSkill(opts: GenerateConfigSkillOpts): Promise<void> {
  const skill = await new ConfigRefineSource({
    configFile: opts.configFile,
    typeName: opts.typeName,
    // Only pass an explicit name when provided; otherwise let ConfigRefineSource
    // derive it (package nearest the config file → typeName).
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    // A config-specific description so the rendered skill describes the config
    // surface, not the package blurb (which is about the whole package).
    description: `Configuration options for ${opts.typeName}.`
  }).extract();
  // Config skills are content-rich (per-option routing + example); raise the
  // per-reference token budget so a multi-option surface isn't truncated.
  const rendered = renderSkills([skill], { outDir: opts.outDir, maxTokens: 16000 });
  writeSkills(rendered, { outDir: opts.outDir });
}
