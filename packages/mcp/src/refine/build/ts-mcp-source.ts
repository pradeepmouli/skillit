import { glob } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import type {
  AuditContext,
  DraftedFix,
  ExtractedSkill,
  RefineSource,
  TargetLocation
} from '@skillit/core';
import { extractMcpSkill } from '../../extract.js';
import type { McpExtractOptions } from '../../types.js';
import { applyMetaEdit } from './meta-edit.js';
import { discoverTools } from './tool-discovery.js';

interface TypeScriptMcpRefineSourceOptions {
  /** stdio transport options to spawn the server */
  transport: McpExtractOptions['transport'];
  /** glob pattern for TypeScript source files to edit */
  sourceGlob: string;
}

export class TypeScriptMcpRefineSource implements RefineSource {
  constructor(private readonly opts: TypeScriptMcpRefineSourceOptions) {}

  async extract(): Promise<ExtractedSkill> {
    return extractMcpSkill({ transport: this.opts.transport });
  }

  auditContext(_skill: ExtractedSkill): AuditContext {
    return {};
  }

  /**
   * Iterate the project's TypeScript source files (excluding declaration files
   * and build output), yielding each file's path alongside its discovered MCP
   * tools and warnings. Shared by {@link applyFixes} (which aggregates tools
   * across all files) and {@link resolveTargetLocation} (which short-circuits on
   * the first file declaring the target tool).
   */
  private async *iterDiscoveredTools(): AsyncGenerator<
    { file: string } & ReturnType<typeof discoverTools>
  > {
    const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.cache']);
    for await (const file of glob(this.opts.sourceGlob, {
      exclude: (f) => f.endsWith('.d.ts') || f.split(/[\\/]/).some((seg) => EXCLUDED_DIRS.has(seg))
    })) {
      const source = await readFile(file, 'utf8');
      yield { file, ...discoverTools(file, source) };
    }
  }

  async resolveTargetLocation(target: {
    name: string;
    kind: string;
    file?: string;
  }): Promise<TargetLocation | undefined> {
    for await (const { file, tools } of this.iterDiscoveredTools()) {
      if (tools.has(target.name)) {
        return { file, declName: target.name };
      }
    }
    return undefined;
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    const allTools = new Map<string, { file: string; line: number }>();
    const seenNames = new Set<string>();
    const allWarnings: string[] = [];

    for await (const { tools, warnings } of this.iterDiscoveredTools()) {
      for (const [name, loc] of tools) {
        if (seenNames.has(name)) {
          allWarnings.push(
            `tool '${name}' found in multiple source files; skipping to avoid ambiguity.`
          );
          allTools.delete(name);
        } else {
          seenNames.add(name);
          allTools.set(name, loc);
        }
      }
      allWarnings.push(...warnings);
    }

    for (const warning of allWarnings) {
      process.stderr.write(`[skillit] ${warning}\n`);
    }

    const byFile = new Map<string, DraftedFix[]>();
    for (const fix of fixes) {
      const loc = allTools.get(fix.toolName);
      if (!loc) {
        process.stderr.write(
          `[skillit] tool '${fix.toolName}' not found in source files; skipping.\n`
        );
        continue;
      }
      const group = byFile.get(loc.file) ?? [];
      group.push(fix);
      byFile.set(loc.file, group);
    }

    for (const [file, fileFixes] of byFile) {
      let source = await readFile(file, 'utf8');
      for (const fix of fileFixes) {
        const loc = allTools.get(fix.toolName)!;
        source = applyMetaEdit(source, fix.toolName, loc.line, fix.tag, fix.value);
      }
      await writeFile(file, source, 'utf8');
    }
  }
}
