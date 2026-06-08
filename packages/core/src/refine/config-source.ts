// packages/core/src/refine/config-source.ts
import { existsSync } from 'node:fs';
import { glob, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { extractConfigSurface } from '../config-extract.js';
import { truncateToTokenBudget } from '../tokens.js';
import type { AuditContext, ParsedReadme } from '../audit-types.js';
import type { ExtractedConfigSurface } from '../config-types.js';
import type { ExtractedSkill } from '../types.js';
import { stripRefineTags, upsertPropertyJsDocTag } from './ast-edit.js';
import { readPackageMetadata } from './package-metadata.js';
import type { DraftedFix, RefineSource, TargetLocation } from './types.js';

export interface ConfigRefineSourceOptions {
  /** Path to the TypeScript file declaring the config type. */
  configFile: string;
  /** Name of the exported interface or object-type alias to document. */
  typeName: string;
  /** Skill name (defaults to the package name, then `typeName`). */
  name?: string;
  /** Skill description (defaults to the package.json description). */
  description?: string;
  /**
   * Globs pointing at the code that CONSUMES this config (e.g. the CLI/filter
   * logic). Their contents are fed to the draft model as an implementation
   * reference so it can state CORRECT runtime behavior instead of guessing it
   * from the type alone. Token-capped. Without grounding the model is told not
   * to assert unverifiable runtime semantics.
   */
  groundingGlobs?: string[];
}

/** Token cap for the implementation-reference grounding fed to the model. */
const GROUNDING_TOKEN_CAP = 8000;

const EXCLUDED_GROUNDING_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

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
  /** Cached implementation-reference grounding, populated by {@link extract}. */
  private grounding = '';

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
    this.grounding = await this.loadGrounding();

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
   * Map an improvement target to its on-disk location. Config targets carry the
   * option's dot-path `configKey` as `name` (kind `config-option`); the config
   * type holds them, so the file is always the config file and the declName is
   * the type. A `config-example` target points at the same file with no path.
   */
  resolveTargetLocation(target: {
    name: string;
    kind: string;
    file?: string;
  }): TargetLocation | undefined {
    if (target.kind === 'config-example') {
      return { file: this.opts.configFile, declName: this.opts.typeName };
    }
    return {
      file: this.opts.configFile,
      declName: this.opts.typeName,
      propertyPath: target.name
    };
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
   * routing tag to the single named option, constrains claims to what the type
   * and provided context can support (the model sees the type, NOT the code that
   * consumes the config, so unconstrained drafting invents wrong runtime
   * semantics), and tells it how to draft the `@example` config file. Built from
   * the cached surface that {@link extract} populates first.
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
      this.grounding
        ? `GROUND every runtime-behavior claim in the IMPLEMENTATION REFERENCE below (the actual code that consumes this config) and the option's type. State behavior the code actually exhibits — e.g. what an empty array/object means, whether an invalid value throws or is silently ignored, what a flag toggles, how options interact. Do NOT contradict the reference, and do NOT assert behavior absent from both the reference and the type; omit it instead. A confidently wrong "NEVER" is worse than no pitfall.`
        : `GROUND every claim in the option's TYPE and the documentation provided to you. You can see the type, not the code that reads this config — so do NOT assert runtime behavior you cannot verify: whether an empty array/object means "all" or "none", whether an invalid value throws or is silently ignored, what a boolean flag actually toggles, or how two options interact at runtime. If a behavior is not evidenced by the type or the docs, omit it or phrase it as a type-level fact ("\`mode\` accepts 'submit' | 'auto-save'"). A confidently wrong "NEVER" is worse than no pitfall — prefer fewer, verifiable points over speculative ones.`,
      `For @example: output a COMPLETE, type-correct example configuration FILE — import statements plus a default export — saved verbatim as a sibling \`*.config.example.ts\` that must compile. Import \`defineConfig\`/\`${typeName}\` from the package by its published name ONLY if the example lives outside that package; if it sits inside the package's own \`src\`, import from the local source entrypoint (a relative path) so the self-import does not resolve to an unbuilt \`dist\`. Use realistic values for required options and a few common optional ones. Output ONLY the file source: no prose, no markdown, no code fences.`,
      `Options (key: type):\n${optionList}`,
      ...(this.grounding
        ? [
            `IMPLEMENTATION REFERENCE (the code that consumes this config — ground runtime-behavior claims in it):\n${this.grounding}`
          ]
        : [])
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

    const meta = await readPackageMetadata(pkgDir);

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

  /**
   * Read the grounding globs into a single token-capped implementation
   * reference. Prepends the config module's own declarations (refine tags
   * stripped — see {@link stripRefineTags}) so preset tables/defaults/validation
   * ground the model, then appends the matched glob files (skipping `.d.ts`,
   * excluded dirs, and the already-included config file). Returns `''` when no
   * globs are configured or nothing matches — never throws.
   */
  private async loadGrounding(): Promise<string> {
    const globs = this.opts.groundingGlobs;
    if (!globs?.length) return '';

    const configAbs = resolve(this.opts.configFile);
    const seen = new Set<string>([configAbs]);
    const parts: string[] = [];

    // The config module itself often holds non-type declarations the model
    // needs to be accurate — preset tables, defaults, `defineConfig`/validation
    // (e.g. z2f's `SHADCN_OVERRIDES`). Include it, but strip ONLY the routing
    // tags this source writes back across iterations (so our own accumulated
    // annotations aren't fed back as "implementation"); hand-authored prose —
    // the real runtime-behavior grounding — is preserved.
    const configSource = await readFile(this.opts.configFile, 'utf8').catch(() => '');
    const configDecls = stripRefineTags(configSource).trim();
    if (configDecls)
      parts.push(`// ${this.opts.configFile} (config module declarations)\n${configDecls}`);

    for (const pattern of globs) {
      let matches: AsyncIterable<string>;
      try {
        matches = glob(pattern, {
          exclude: (f) =>
            f.endsWith('.d.ts') || f.split(/[\\/]/).some((seg) => EXCLUDED_GROUNDING_DIRS.has(seg))
        });
      } catch {
        continue; // bad pattern — skip
      }
      for await (const file of matches) {
        const abs = resolve(file);
        if (seen.has(abs)) continue; // config file is pre-seeded above
        seen.add(abs);
        const content = await readFile(file, 'utf8').catch(() => '');
        if (content.trim()) parts.push(`// ${file}\n${content.trim()}`);
      }
    }
    if (parts.length === 0) return '';
    return truncateToTokenBudget(parts.join('\n\n'), GROUNDING_TOKEN_CAP);
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
