// packages/typedoc/src/refine/typedoc-source.ts
import { readFile, writeFile } from 'node:fs/promises';
import type { ExtractedSkill, AuditContext, DraftedFix, RefineSource } from '@skillit/core';
import { insertJsDocTag } from '@skillit/core';

interface TypeDocRefineSourceOptions {
  extract: () => Promise<ExtractedSkill>;
  resolveSourceFile: (exportName: string) => string | undefined;
}

export class TypeDocRefineSource implements RefineSource {
  constructor(private readonly opts: TypeDocRefineSourceOptions) {}

  extract(): Promise<ExtractedSkill> {
    return this.opts.extract();
  }

  auditContext(_skill: ExtractedSkill): AuditContext {
    return {};
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    const byFile = new Map<string, DraftedFix[]>();
    for (const fix of fixes) {
      const file = this.opts.resolveSourceFile(fix.toolName);
      if (!file) continue;
      const group = byFile.get(file) ?? [];
      group.push(fix);
      byFile.set(file, group);
    }
    for (const [file, fileFixes] of byFile) {
      let source = await readFile(file, 'utf8');
      for (const fix of fileFixes) {
        source = insertJsDocTag(source, fix.toolName, fix.tag, fix.value);
      }
      await writeFile(file, source, 'utf8');
    }
  }
}
