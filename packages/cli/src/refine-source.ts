import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  findNearestPackageDir,
  readPackageMetadata,
  upsertJsDocTag,
  type DraftedFix,
  type ExtractedSkill,
  type PackageMetadata,
  type RefineSource,
  type TargetLocation
} from '@skillit/core';
import { Command } from 'commander';
import {
  correlateConfigSurfaces,
  fileDeclaresInterface,
  interfaceNameCandidates,
  readSources
} from './config-surface-correlation.js';
import { extractCliSkill } from './extract.js';
import { introspectCommander } from './introspect-commander.js';
import { applyNpxMode, type CliInvocationMode } from './npx-mode.js';

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

  async extract(): Promise<ExtractedSkill> {
    const surfaces = introspectCommander(this.opts.program);

    // Load package metadata (package.json + README) from cwd; its fields are
    // written onto the IR below so the audit reads them directly from the skill.
    const pkgDir = await findNearestPackageDir(this.opts.cwd);
    this.cachedMetadata = pkgDir ? await readPackageMetadata(pkgDir) : {};

    // Key the correlation-input surfaces by the COMMAND name (not the
    // interface name) so `extractCliSkill`'s `<command>`/`<command>options`
    // lookup matches colon-namespaced commands (e.g. `db:migrate`). Marked
    // `cli` (inside correlateConfigSurfaces) so each is correlated onto the
    // command surface rather than emitted as a separate 0-option `config`
    // surface.
    const configSurfaces = await correlateConfigSurfaces(surfaces, this.opts.sourceGlob);

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
    const sources = await readSources(this.opts.sourceGlob);
    const candidates = interfaceNameCandidates(target.name);
    for (const iface of candidates) {
      const file = this.findInterfaceFile(iface, sources);
      if (file) return { file, declName: iface };
    }
    return undefined;
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    const sources = await readSources(this.opts.sourceGlob);

    for (const fix of fixes) {
      const candidates = interfaceNameCandidates(fix.toolName);
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

  private findInterfaceFile(iface: string, sources: Map<string, string>): string | undefined {
    for (const [file, contents] of sources) {
      if (fileDeclaresInterface(contents, iface)) {
        return file;
      }
    }
    return undefined;
  }
}
