import { readFileSync } from 'node:fs';
import { glob, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  upsertJsDocTag,
  type AuditContext,
  type DraftedFix,
  type ExtractedConfigSurface,
  type ExtractedSkill,
  type RefineSource,
  type RefineTag
} from '@skillit/core';
import { Command } from 'commander';
import { extractCliSkill } from './extract.js';
import { introspectCommander } from './introspect-commander.js';
import { readOptionsTags } from './options-jsdoc.js';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.cache']);

export interface CliRefineSourceOptions {
  /** Commander program to introspect. */
  program: Command;
  /** Glob for the consumer's TypeScript source files to read/edit. */
  sourceGlob: string;
  /** Working directory (reserved for future relative-path resolution). */
  cwd: string;
}

/**
 * {@link RefineSource} for `@skillit/cli` consumers.
 *
 * Extracts a skill from a commander program, returns the bundled CLI
 * documentation conventions as guidance, and writes routing tags as JSDoc
 * onto the correlated `<Command>Options` interface.
 */
export class CliRefineSource implements RefineSource {
  constructor(private readonly opts: CliRefineSourceOptions) {}

  /** Maps a command name to its options-interface name, e.g. `add-remote` → `AddRemoteOptions`, `db:migrate` → `DbMigrateOptions`. */
  private interfaceName(command: string): string {
    const pascal = command
      .split(/[-_:.\s]+/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return `${pascal}Options`;
  }

  async extract(): Promise<ExtractedSkill> {
    const surfaces = introspectCommander(this.opts.program);
    const sources = await this.readSources();

    const configSurfaces: ExtractedConfigSurface[] = [];
    for (const surface of surfaces) {
      const iface = this.interfaceName(surface.name);
      const tags = this.readTagsAcross(iface, sources);

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
      if (tags.pitfalls !== undefined) {
        configSurface.pitfalls = [tags.pitfalls];
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

    return extractCliSkill({ program: this.opts.program, configSurfaces });
  }

  guidance(): string {
    const skillPath = fileURLToPath(
      new URL('../skills/to-skills-cli-docs/SKILL.md', import.meta.url)
    );
    return readFileSync(skillPath, 'utf8');
  }

  auditContext(_skill: ExtractedSkill): AuditContext {
    return {};
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    const sources = await this.readSources();

    for (const fix of fixes) {
      const iface = this.interfaceName(fix.toolName);
      const file = this.findInterfaceFile(iface, sources);
      if (!file) {
        process.stderr.write(
          `[to-skills] no ${iface} interface for command '${fix.toolName}'; skipped ${fix.tag}\n`
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

  /** Reads tags for an interface across every globbed source file, first match wins. */
  private readTagsAcross(
    iface: string,
    sources: Map<string, string>
  ): Partial<Record<RefineTag, string>> {
    for (const src of sources.values()) {
      if (!fileDeclaresInterface(src, iface)) {
        continue;
      }
      const tags = readOptionsTags(iface, src);
      if (Object.keys(tags).length > 0) {
        return tags;
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
