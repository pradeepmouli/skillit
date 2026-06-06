// packages/core/src/refine/config-source.ts
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { extractConfigSurface } from '../config-extract.js';
import { parseReadme } from '../readme-parser.js';
import type { AuditContext, ParsedReadme } from '../audit-types.js';
import type { ExtractedSkill } from '../types.js';
import { upsertPropertyJsDocTag } from './ast-edit.js';
import type { DraftedFix, RefineSource } from './types.js';

export interface ConfigRefineSourceOptions {
  /** Path to the TypeScript file declaring the config type. */
  configFile: string;
  /** Name of the exported interface or object-type alias to document. */
  typeName: string;
  /** Skill name (defaults to the package name, then `typeName`). */
  name?: string;
  /** Skill description (defaults to the package.json description). */
  description?: string;
}

/** Package metadata + parsed README discovered alongside the config file. */
interface ConfigMetadata {
  packageDescription?: string;
  keywords?: string[];
  repository?: string;
  readme?: ParsedReadme;
}

/** Maximum directories to walk upward from the config file seeking package.json. */
const MAX_PACKAGE_LOOKUP_DEPTH = 8;

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
 *
 * It also enriches the skill from the package.json nearest the config file (its
 * description, keywords, repository) and a sibling README, supplying the audit
 * context the metadata checks (F1/F2/F3/E5/W4/W5/W6) score against — without it
 * a config skill forfeits those points even when the package already carries
 * the data.
 */
export class ConfigRefineSource implements RefineSource {
  /** Cached metadata, populated by {@link extract} (which the loop runs first). */
  private metadata: ConfigMetadata = {};

  constructor(private readonly opts: ConfigRefineSourceOptions) {}

  async extract(): Promise<ExtractedSkill> {
    const source = await readFile(this.opts.configFile, 'utf8');
    const surface = extractConfigSurface(source, this.opts.typeName);
    if (!surface) {
      throw new Error(
        `[skillit] config type '${this.opts.typeName}' not found in ${this.opts.configFile}`
      );
    }

    const meta = await this.loadMetadata();

    const skill: ExtractedSkill = {
      name: this.opts.name ?? meta.packageName ?? this.opts.typeName,
      description: this.opts.description ?? meta.packageDescription ?? '',
      functions: [],
      classes: [],
      types: [],
      enums: [],
      variables: [],
      examples: [],
      configSurfaces: [surface]
    };
    if (meta.keywords?.length) skill.keywords = meta.keywords;
    if (meta.repository) skill.repository = meta.repository;
    if (meta.packageDescription) skill.packageDescription = meta.packageDescription;
    return skill;
  }

  /**
   * Audit context from the discovered package.json + README. Synchronous per the
   * {@link RefineSource} contract; reads the cache that {@link extract} fills (the
   * refine loop always calls `extract()` before scoring). Empty until then.
   */
  auditContext(_skill: ExtractedSkill): AuditContext {
    const ctx: AuditContext = {};
    if (this.metadata.packageDescription) ctx.packageDescription = this.metadata.packageDescription;
    if (this.metadata.keywords?.length) ctx.keywords = this.metadata.keywords;
    if (this.metadata.repository) ctx.repository = this.metadata.repository;
    if (this.metadata.readme) ctx.readme = this.metadata.readme;
    return ctx;
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

  /**
   * Discover and parse the package.json nearest the config file (walking up to
   * {@link MAX_PACKAGE_LOOKUP_DEPTH} directories) plus a sibling README. Cached
   * so repeated extract/score passes read the filesystem once. Never throws —
   * unreadable or absent files just yield empty fields.
   */
  private async loadMetadata(): Promise<ConfigMetadata & { packageName?: string }> {
    const pkgDir = this.findPackageDir();
    if (!pkgDir) return this.metadata;

    const meta: ConfigMetadata & { packageName?: string } = {};
    try {
      const pkg = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')) as {
        name?: string;
        description?: string;
        keywords?: string[];
        repository?: string | { url?: string };
      };
      if (pkg.name) meta.packageName = stripScope(pkg.name);
      if (pkg.description) meta.packageDescription = pkg.description;
      if (Array.isArray(pkg.keywords)) meta.keywords = pkg.keywords;
      const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
      if (repo) meta.repository = repo;
    } catch {
      // No/invalid package.json — leave metadata fields unset.
    }
    try {
      meta.readme = parseReadme(await readFile(join(pkgDir, 'README.md'), 'utf8'));
    } catch {
      // No README — metadata checks that need it will report the gap.
    }

    this.metadata = {
      ...(meta.packageDescription !== undefined
        ? { packageDescription: meta.packageDescription }
        : {}),
      ...(meta.keywords !== undefined ? { keywords: meta.keywords } : {}),
      ...(meta.repository !== undefined ? { repository: meta.repository } : {}),
      ...(meta.readme !== undefined ? { readme: meta.readme } : {})
    };
    return meta;
  }

  /** Nearest ancestor directory of the config file that holds a package.json. */
  private findPackageDir(): string | undefined {
    let dir = dirname(this.opts.configFile);
    for (let i = 0; i < MAX_PACKAGE_LOOKUP_DEPTH; i++) {
      if (existsSync(join(dir, 'package.json'))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return undefined;
  }
}

/** Strip a leading `@scope/` from a package name. */
function stripScope(name: string): string {
  const slash = name.indexOf('/');
  return name.startsWith('@') && slash !== -1 ? name.slice(slash + 1) : name;
}
