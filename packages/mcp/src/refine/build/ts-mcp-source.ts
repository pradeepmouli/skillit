import { glob } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import type { AuditContext, DraftedFix, ExtractedSkill, RefineSource } from '@to-skills/core';
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

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    const sourceFiles: string[] = [];
    for await (const file of glob(this.opts.sourceGlob)) {
      sourceFiles.push(file);
    }

    const allTools = new Map<string, { file: string; line: number }>();
    const allWarnings: string[] = [];

    for (const file of sourceFiles) {
      const source = await readFile(file, 'utf8');
      const { tools, warnings } = discoverTools(file, source);
      for (const [name, loc] of tools) allTools.set(name, loc);
      allWarnings.push(...warnings);
    }

    for (const warning of allWarnings) {
      process.stderr.write(`[to-skills] ${warning}\n`);
    }

    const byFile = new Map<string, DraftedFix[]>();
    for (const fix of fixes) {
      const loc = allTools.get(fix.toolName);
      if (!loc) {
        process.stderr.write(
          `[to-skills] tool '${fix.toolName}' not found in source files; skipping.\n`
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
