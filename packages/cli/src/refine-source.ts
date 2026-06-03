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
} from '@to-skills/core';
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
 * {@link RefineSource} for `@to-skills/cli` consumers.
 *
 * Extracts a skill from a commander program, returns the bundled CLI
 * documentation conventions as guidance, and writes routing tags as JSDoc
 * onto the correlated `<Command>Options` interface.
 */
export class CliRefineSource implements RefineSource {
  constructor(private readonly opts: CliRefineSourceOptions) {}

  /** Maps a command name to its options-interface name, e.g. `add-remote` → `AddRemoteOptions`. */
  private interfaceName(command: string): string {
    const pascal = command
      .split(/[-_\s]+/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return `${pascal}Options`;
  }

  async extract(): Promise<ExtractedSkill> {
    const surfaces = introspectCommander(this.opts.program);
    const files = await this.sourceFiles();

    const sources = new Map<string, string>();
    for (const file of files) {
      sources.set(file, await readFile(file, 'utf8'));
    }

    const configSurfaces: ExtractedConfigSurface[] = [];
    for (const surface of surfaces) {
      const iface = this.interfaceName(surface.name);
      const tags = this.readTagsAcross(iface, sources);
      if (Object.keys(tags).length === 0) {
        continue;
      }

      const configSurface: ExtractedConfigSurface = {
        name: iface,
        description: '',
        sourceType: 'config',
        options: []
      };
      if (tags.useWhen !== undefined) configSurface.useWhen = [tags.useWhen];
      if (tags.avoidWhen !== undefined) configSurface.avoidWhen = [tags.avoidWhen];
      if (tags.pitfalls !== undefined) configSurface.pitfalls = [tags.pitfalls];
      if (tags.remarks !== undefined) configSurface.remarks = tags.remarks;

      configSurfaces.push(configSurface);
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
    const files = await this.sourceFiles();

    for (const fix of fixes) {
      const iface = this.interfaceName(fix.toolName);
      const file = await this.findInterfaceFile(iface, files);
      if (!file) {
        process.stderr.write(
          `[to-skills] no ${iface} interface for command '${fix.toolName}'; skipped ${fix.tag}\n`
        );
        continue;
      }
      const src = await readFile(file, 'utf8');
      const next = upsertJsDocTag(src, iface, fix.tag, fix.value);
      if (next !== src) {
        await writeFile(file, next, 'utf8');
      }
    }
  }

  /** Reads tags for an interface across every globbed source file, first match wins. */
  private readTagsAcross(
    iface: string,
    sources: Map<string, string>
  ): Partial<Record<RefineTag, string>> {
    for (const src of sources.values()) {
      if (!src.includes(`interface ${iface}`)) {
        continue;
      }
      const tags = readOptionsTags(iface, src);
      if (Object.keys(tags).length > 0) {
        return tags;
      }
    }
    return {};
  }

  private async sourceFiles(): Promise<string[]> {
    const files: string[] = [];
    for await (const file of glob(this.opts.sourceGlob, {
      exclude: (f) => f.endsWith('.d.ts') || f.split(/[\\/]/).some((seg) => EXCLUDED_DIRS.has(seg))
    })) {
      files.push(file);
    }
    return files;
  }

  private async findInterfaceFile(iface: string, files: string[]): Promise<string | undefined> {
    for (const file of files) {
      const contents = await readFile(file, 'utf8');
      if (contents.includes(`interface ${iface}`)) {
        return file;
      }
    }
    return undefined;
  }
}
