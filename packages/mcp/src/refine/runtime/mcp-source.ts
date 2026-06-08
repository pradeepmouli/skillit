import {
  findNearestPackageDir,
  readPackageMetadata,
  type ExtractedSkill,
  type AuditContext,
  type DraftedFix,
  type PackageMetadata,
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
  /** Cached metadata loaded during {@link extract} (always called first in the audit/refine loop). */
  private cachedMetadata: PackageMetadata = {};

  constructor(private readonly opts: McpRefineSourceOptions) {}

  async extract(): Promise<ExtractedSkill> {
    const raw = await this.opts.extract();
    const overlay = readOverlay(this.opts.overlayPath);
    const skill = mergeOverlay(raw, overlay);

    // Load package metadata (package.json + README) from cwd and cache it so
    // auditContext() can return it synchronously — mirroring CliRefineSource.
    const pkgDir = await findNearestPackageDir(this.opts.cwd);
    this.cachedMetadata = pkgDir ? await readPackageMetadata(pkgDir) : {};
    if (this.cachedMetadata.readme !== undefined) skill.readme = this.cachedMetadata.readme;

    return skill;
  }

  auditContext(_skill: ExtractedSkill): AuditContext {
    const meta = this.cachedMetadata;
    return {
      ...(meta.packageDescription !== undefined
        ? { packageDescription: meta.packageDescription }
        : {}),
      ...(meta.keywords !== undefined ? { keywords: meta.keywords } : {}),
      ...(meta.repository !== undefined ? { repository: meta.repository } : {}),
      ...(meta.readme !== undefined ? { readme: meta.readme } : {})
    };
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
