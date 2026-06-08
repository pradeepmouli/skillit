import {
  findNearestPackageDir,
  readPackageMetadata,
  type ExtractedSkill,
  type DraftedFix,
  type RefineSource,
  type TargetLocation
} from '@skillit/core';
import { readOverlay, writeOverlay, applyFixToOverlay } from './overlay.js';
import { mergeOverlay } from './merge-overlay.js';

interface McpRefineSourceOptions {
  overlayPath: string;
  extract: () => Promise<ExtractedSkill>;
  /** Working directory used to locate package.json + README for audit metadata. */
  cwd: string;
}

export class McpRefineSource implements RefineSource {
  constructor(private readonly opts: McpRefineSourceOptions) {}

  async extract(): Promise<ExtractedSkill> {
    const raw = await this.opts.extract();
    const overlay = readOverlay(this.opts.overlayPath);
    const skill = mergeOverlay(raw, overlay);

    // Load package metadata (package.json + README) from cwd and write the
    // audit-read fields onto the IR (the audit reads them directly from the
    // skill — no separate context channel).
    const pkgDir = await findNearestPackageDir(this.opts.cwd);
    const meta = pkgDir ? await readPackageMetadata(pkgDir) : {};
    if (meta.packageDescription !== undefined) skill.packageDescription = meta.packageDescription;
    if (meta.keywords !== undefined) skill.keywords = meta.keywords;
    if (meta.repository !== undefined) skill.repository = meta.repository;
    if (meta.readme !== undefined) skill.readme = meta.readme;

    return skill;
  }

  resolveTargetLocation(_target: {
    name: string;
    kind: string;
    file?: string;
  }): TargetLocation | undefined {
    // Runtime mode edits an overlay JSON, not source declarations — there is no
    // on-disk symbol to jump to.
    return undefined;
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    let overlay = readOverlay(this.opts.overlayPath);
    for (const fix of fixes) {
      overlay = applyFixToOverlay(overlay, fix);
    }
    writeOverlay(this.opts.overlayPath, overlay);
  }
}
