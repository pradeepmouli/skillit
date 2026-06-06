// packages/core/src/refine/config-source.ts
import { readFile, writeFile } from 'node:fs/promises';
import { extractConfigSurface } from '../config-extract.js';
import type { AuditContext } from '../audit-types.js';
import type { ExtractedSkill } from '../types.js';
import { upsertPropertyJsDocTag } from './ast-edit.js';
import type { DraftedFix, RefineSource } from './types.js';

export interface ConfigRefineSourceOptions {
  /** Path to the TypeScript file declaring the config type. */
  configFile: string;
  /** Name of the exported interface or object-type alias to document. */
  typeName: string;
  /** Skill name (defaults to `typeName`). */
  name?: string;
  /** Skill description (defaults to empty). */
  description?: string;
}

/**
 * {@link RefineSource} for a TypeScript configuration surface.
 *
 * Reads the consumer's config type with {@link extractConfigSurface}, exposes it
 * as a single `config` surface in an {@link ExtractedSkill}, and writes routing
 * tags back as JSDoc onto the type's individual property declarations. Unlike
 * the CLI source — whose routing lives at the command (surface) level — a config
 * surface is documented per-OPTION: each fix targets one property by its
 * dot-path `configKey` (e.g. `outDir`, `components.prefix`), routed through
 * {@link upsertPropertyJsDocTag}.
 */
export class ConfigRefineSource implements RefineSource {
  constructor(private readonly opts: ConfigRefineSourceOptions) {}

  async extract(): Promise<ExtractedSkill> {
    const source = await readFile(this.opts.configFile, 'utf8');
    const surface = extractConfigSurface(source, this.opts.typeName);
    if (!surface) {
      throw new Error(
        `[skillit] config type '${this.opts.typeName}' not found in ${this.opts.configFile}`
      );
    }

    return {
      name: this.opts.name ?? this.opts.typeName,
      description: this.opts.description ?? '',
      functions: [],
      classes: [],
      types: [],
      enums: [],
      variables: [],
      examples: [],
      configSurfaces: [surface]
    };
  }

  auditContext(_skill: ExtractedSkill): AuditContext {
    return {};
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    let source = await readFile(this.opts.configFile, 'utf8');
    let changed = false;

    for (const fix of fixes) {
      // `fix.toolName` is the option's dot-path configKey (set by the
      // audit-score config-option target). Route it to the matching property.
      const next = upsertPropertyJsDocTag(
        source,
        this.opts.typeName,
        fix.toolName,
        fix.tag,
        fix.value
      );
      if (next !== source) {
        source = next;
        changed = true;
      }
    }

    if (changed) {
      await writeFile(this.opts.configFile, source, 'utf8');
    }
  }
}
