// packages/core/src/refine/config-source.ts
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { extractConfigSurface } from '../config-extract.js';
import { parseReadme } from '../readme-parser.js';
import type { AuditContext, ParsedReadme } from '../audit-types.js';
import type { ExtractedConfigSurface } from '../config-types.js';
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
  /** Cached surface, populated by {@link extract}; read by {@link guidance}. */
  private surface: ExtractedConfigSurface | undefined;

  constructor(private readonly opts: ConfigRefineSourceOptions) {}

  async extract(): Promise<ExtractedSkill> {
    const source = await readFile(this.opts.configFile, 'utf8');
    const surface = extractConfigSurface(source, this.opts.typeName);
    if (!surface) {
      throw new Error(
        `[skillit] config type '${this.opts.typeName}' not found in ${this.opts.configFile}`
      );
    }
    this.surface = surface;

    const meta = await this.loadMetadata();

    // An explicit description wins for BOTH fields: the renderer uses
    // packageDescription for the body, so without this a config skill would show
    // the package blurb (which describes the package, not the config surface)
    // even when the caller supplied a config-specific description. The audit's
    // F1 check still reads the real package description from auditContext().
    const description = this.opts.description ?? meta.packageDescription ?? '';
    const skill: ExtractedSkill = {
      name: this.opts.name ?? meta.packageName ?? this.opts.typeName,
      description,
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
    if (description) skill.packageDescription = description;

    // A sibling `<config>.example.ts` (if present) is the skill's usage example
    // — clears E4 and feeds the rendered Examples section. The refine loop
    // drafts it once when absent; reading it back here surfaces it thereafter.
    // Read directly and tolerate ENOENT (no existsSync precheck — that is a
    // check-then-use race).
    try {
      const example = (await readFile(this.exampleFilePath(), 'utf8')).trim();
      if (example) skill.examples = [example];
    } catch {
      // No/unreadable example — leave examples empty (E4 stays a gap).
    }
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
    // An `@example` fix is the drafted config-example FILE, not a JSDoc tag:
    // write it to the sibling `<config>.example.ts` — but only if one does not
    // already exist, so a hand-authored example is never clobbered.
    const exampleFix = fixes.find((fix) => fix.tag === 'example');
    if (exampleFix) {
      // Write-if-absent atomically with the `wx` flag (create, fail if exists)
      // rather than existsSync-then-write — the latter is a TOCTOU race, and the
      // atomic flag enforces the no-clobber intent at the syscall.
      try {
        await writeFile(this.exampleFilePath(), normalizeExampleFile(exampleFix.value), {
          encoding: 'utf8',
          flag: 'wx'
        });
      } catch (error) {
        // EEXIST = an example already exists; preserve it. Re-throw anything else.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }

    let source = await readFile(this.opts.configFile, 'utf8');
    let changed = false;

    for (const fix of fixes) {
      if (fix.tag === 'example') continue; // handled above (separate file)
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
   * Drafting conventions passed to the model each iteration. Scopes every
   * routing tag to the single named option (so the model writes option-specific
   * guidance instead of whole-config advice repeated across keys), and tells it
   * how to draft the `@example` config file. Built from the cached surface that
   * {@link extract} populates first.
   */
  guidance(): string {
    const optionList = (this.surface?.options ?? [])
      .map((o) => `- \`${o.configKey ?? o.name}\`: ${o.type}`)
      .join('\n');
    const typeName = this.opts.typeName;
    return [
      `You are documenting the individual options of the TypeScript configuration object \`${typeName}\`.`,
      `Each work item's "Tool" is ONE option, named by its dot-path key (e.g. \`outDir\`, \`components.prefix\`) — except an @example work item, whose "Tool" is the config type \`${typeName}\` itself.`,
      `For @useWhen / @avoidWhen / @pitfalls: write guidance SPECIFIC to that single option — when to set it (and to what kind of value), when to leave it unset, and footguns unique to its value or interactions. Do NOT describe the configuration type as a whole, the annotate-vs-\`defineConfig()\` choice, or anything that applies to every option; never repeat the same point across options.`,
      `For @example: output a COMPLETE, type-correct example configuration FILE — import statements plus a default export — saved verbatim as a sibling \`*.config.example.ts\` that must compile. Prefer the project's \`defineConfig()\` helper if one exists, otherwise annotate the export with \`${typeName}\`. Use realistic values for required options and a few common optional ones. Output ONLY the file source: no prose, no markdown, no code fences.`,
      `Options (key: type):\n${optionList}`
    ].join('\n\n');
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

  /**
   * Sibling example path for the config file: same directory, the config file's
   * base name with any `.ts`/`.tsx`/`.mts`/`.cts` extension replaced by
   * `.example.ts` (e.g. `z2f.config.ts` → `z2f.config.example.ts`,
   * `config.ts` → `config.example.ts`).
   */
  private exampleFilePath(): string {
    const dir = dirname(this.opts.configFile);
    const base = basename(this.opts.configFile).replace(/\.[cm]?tsx?$/, '');
    return join(dir, `${base}.example.ts`);
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

/**
 * Normalize model-drafted example content into a clean source file: strip a
 * surrounding markdown code fence if the model added one, and ensure a trailing
 * newline. The draft is instructed to omit fences, but a chatty backend may add
 * them anyway.
 */
function normalizeExampleFile(raw: string): string {
  let body = raw.trim();
  const fenced = body.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fenced?.[1] !== undefined) body = fenced[1].trim();
  return `${body}\n`;
}
