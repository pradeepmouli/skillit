import type { ExtractedSkill, AuditContext, DraftedFix, RefineSource } from '@to-skills/core';
import { readOverlay, writeOverlay, applyFixToOverlay } from './overlay.js';
import { mergeOverlay } from './merge-overlay.js';

interface McpRefineSourceOptions {
  overlayPath: string;
  extract: () => Promise<ExtractedSkill>;
}

export class McpRefineSource implements RefineSource {
  constructor(private readonly opts: McpRefineSourceOptions) {}

  async extract(): Promise<ExtractedSkill> {
    const raw = await this.opts.extract();
    const overlay = readOverlay(this.opts.overlayPath);
    return mergeOverlay(raw, overlay);
  }

  auditContext(_skill: ExtractedSkill): AuditContext {
    return {};
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    let overlay = readOverlay(this.opts.overlayPath);
    for (const fix of fixes) {
      overlay = applyFixToOverlay(overlay, fix);
    }
    writeOverlay(this.opts.overlayPath, overlay);
  }
}
