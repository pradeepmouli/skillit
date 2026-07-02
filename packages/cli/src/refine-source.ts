import { readFileSync } from 'node:fs';
import { glob, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  findNearestPackageDir,
  readPackageMetadata,
  upsertJsDocTag,
  type DraftedFix,
  type ExtractedConfigSurface,
  type ExtractedSkill,
  type PackageMetadata,
  type RefineSource,
  type RefineTag,
  type TargetLocation
} from '@skillit/core';
import { Command } from 'commander';
import { extractCliSkill } from './extract.js';
import { introspectCommander } from './introspect-commander.js';
import { applyNpxMode, type CliInvocationMode } from './npx-mode.js';
import { readOptionsTags } from './options-jsdoc.js';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.cache']);

export interface CliRefineSourceOptions {
  /** Commander program to introspect. */
  program: Command;
  /** Glob for the consumer's TypeScript source files to read/edit. */
  sourceGlob: string;
  /** Working directory (reserved for future relative-path resolution). */
  cwd: string;
  /**
   * Override the invocation mode used in generated command examples.
   * Defaults to `npx` for public packages with a `bin` field, `global` otherwise.
   */
  invocationMode?: CliInvocationMode;
}

/**
 * {@link RefineSource} for `@skillit/cli` consumers.
 *
 * Extracts a skill from a commander program, returns the bundled CLI
 * documentation conventions as guidance, and writes routing tags as JSDoc
 * onto the correlated `<Command>Options` interface.
 */
export class CliRefineSource implements RefineSource {
  /** Cached metadata loaded during {@link extract} (always called first in the audit/refine loop). */
  private cachedMetadata: PackageMetadata = {};

  constructor(private readonly opts: CliRefineSourceOptions) {}

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
  private interfaceNameCandidates(command: string): string[] {
    const pascal = command
      .split(/[-_:.\s]+/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return [`${pascal}Options`, `${pascal}Opts`, `${pascal}CommandOpts`];
  }

  async extract(): Promise<ExtractedSkill> {
    const surfaces = introspectCommander(this.opts.program);
    const sources = await this.readSources();

    // Load package metadata (package.json + README) from cwd; its fields are
    // written onto the IR below so the audit reads them directly from the skill.
    const pkgDir = await findNearestPackageDir(this.opts.cwd);
    this.cachedMetadata = pkgDir ? await readPackageMetadata(pkgDir) : {};

    const configSurfaces: ExtractedConfigSurface[] = [];
    for (const surface of surfaces) {
      const candidates = this.interfaceNameCandidates(surface.name);
      const tags = this.readTagsAcross(candidates, sources);

      // Key the correlation-input surface by the COMMAND name (not the
      // interface name) so `extractCliSkill`'s `<command>`/`<command>options`
      // lookup matches colon-namespaced commands (e.g. `db:migrate`). Mark it
      // `cli` so it is correlated onto the command surface rather than emitted
      // as a separate 0-option `config` surface.
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

      // Only emit a surface when at least one consumed field is populated;
      // a truly-empty read contributes nothing but noise.
      if (hasContent) {
        configSurfaces.push(configSurface);
      }
    }

    const meta = this.cachedMetadata;
    const skill = await extractCliSkill({
      program: this.opts.program,
      configSurfaces,
      metadata: {
        ...(meta.packageName !== undefined ? { name: meta.packageName } : {}),
        ...(meta.packageDescription !== undefined ? { description: meta.packageDescription } : {}),
        ...(meta.keywords !== undefined ? { keywords: meta.keywords } : {}),
        ...(meta.repository !== undefined ? { repository: meta.repository } : {})
      }
    });
    // Write the audit-read project metadata onto the IR (the audit reads it
    // directly from the skill — no separate context channel). extractCliSkill
    // maps `description` onto the skill body but not these audit fields.
    if (meta.packageDescription !== undefined) skill.packageDescription = meta.packageDescription;
    if (meta.keywords !== undefined) skill.keywords = meta.keywords;
    if (meta.repository !== undefined) skill.repository = meta.repository;
    if (meta.readme !== undefined) skill.readme = meta.readme;
    applyNpxMode(skill, meta, this.opts.invocationMode);
    return skill;
  }

  guidance(): string {
    const skillPath = fileURLToPath(
      new URL('../skills/skillit-cli-docs/SKILL.md', import.meta.url)
    );
    return readFileSync(skillPath, 'utf8');
  }

  async resolveTargetLocation(target: {
    name: string;
    kind: string;
    file?: string;
  }): Promise<TargetLocation | undefined> {
    const sources = await this.readSources();
    const candidates = this.interfaceNameCandidates(target.name);
    for (const iface of candidates) {
      const file = this.findInterfaceFile(iface, sources);
      if (file) return { file, declName: iface };
    }
    return undefined;
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    const sources = await this.readSources();

    for (const fix of fixes) {
      const candidates = this.interfaceNameCandidates(fix.toolName);
      let iface: string | undefined;
      let file: string | undefined;
      for (const candidate of candidates) {
        const found = this.findInterfaceFile(candidate, sources);
        if (found) {
          iface = candidate;
          file = found;
          break;
        }
      }
      if (file === undefined || iface === undefined) {
        process.stderr.write(
          `[skillit] no options interface (${candidates.join(', ')}) for command '${fix.toolName}'; skipped ${fix.tag}\n`
        );
        continue;
      }
      const src = sources.get(file)!;
      const next = upsertJsDocTag(src, iface, fix.tag, fix.value);
      if (next !== src) {
        await writeFile(file, next, 'utf8');
        // Keep the in-memory map current so subsequent fixes targeting the
        // same file build on this edit instead of clobbering it.
        sources.set(file, next);
      }
    }
  }

  /**
   * Reads tags for the first candidate interface that a globbed source file
   * declares with at least one tag. Candidates are tried in priority order so
   * the documented `<Command>Options` name wins over the `Opts`/`CommandOpts`
   * fallbacks when more than one is present.
   */
  private readTagsAcross(
    candidates: string[],
    sources: Map<string, string>
  ): Partial<Record<RefineTag, string>> {
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

  /** Globs the source files once and returns a file → contents map. */
  private async readSources(): Promise<Map<string, string>> {
    const sources = new Map<string, string>();
    for await (const file of glob(this.opts.sourceGlob, {
      exclude: (f) => f.endsWith('.d.ts') || f.split(/[\\/]/).some((seg) => EXCLUDED_DIRS.has(seg))
    })) {
      sources.set(file, await readFile(file, 'utf8'));
    }
    return sources;
  }

  private findInterfaceFile(iface: string, sources: Map<string, string>): string | undefined {
    for (const [file, contents] of sources) {
      if (fileDeclaresInterface(contents, iface)) {
        return file;
      }
    }
    return undefined;
  }
}

/**
 * Returns whether `src` declares the interface named exactly `iface`.
 *
 * Matches on identifier boundaries so the probe for `GenOptions` does not
 * spuriously match `interface GenOptionsExtra`. Shared by file-selection
 * (`findInterfaceFile`) and tag-reading (`readTagsAcross`) so both agree on
 * what counts as the interface.
 */
function fileDeclaresInterface(src: string, iface: string): boolean {
  const escaped = iface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return src.match(new RegExp(String.raw`\binterface\s+${escaped}\b`)) !== null;
}
