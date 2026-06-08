import { Application, TSConfigReader, type ProjectReflection } from 'typedoc';
import { readPackageMetadata, findNearestPackageDir } from '@skillit/core';
import type {
  ExtractedSkill,
  RefineSource,
  AuditContext,
  DraftedFix,
  TargetLocation
} from '@skillit/core';
import { load } from './plugin.js';
import { extractSkills } from './extractor.js';

/**
 * Options for programmatic TypeDoc-driven skill generation/extraction.
 *
 * @category Programmatic
 */
export interface TypeDocRunOptions {
  /** Absolute paths to TypeScript entry-point files. */
  entryPoints: string[];
  /** Absolute path to the project's tsconfig.json. */
  tsconfig: string;
  /**
   * Working directory of the target package.
   *
   * @remarks
   * The **audit** path ({@link extractTypeDocSkills} /
   * {@link createTypeDocRefineSource}) resolves package.json + README metadata
   * from this directory. The **gen** path ({@link generateTypeDocSkills}) runs
   * the skillit TypeDoc plugin, which reads that metadata from `process.cwd()`
   * — so for `gen`, `cwd` must equal `process.cwd()` (the skillit CLI always
   * invokes it from the target package dir). Honoring an arbitrary `cwd` in the
   * gen plugin path is a tracked follow-up.
   */
  cwd: string;
}

/**
 * Bootstrap a TypeDoc Application and convert the project. Uses only the
 * TSConfigReader — skips TypeDoc JSON config files so callers get a clean
 * slate. The optional `register` callback runs after bootstrap and before
 * convert, allowing the caller to add plugins or set option values.
 */
async function convertProject(
  opts: TypeDocRunOptions,
  register?: (app: Application) => void
): Promise<{ app: Application; project: ProjectReflection }> {
  const app = await Application.bootstrap(
    {
      entryPoints: opts.entryPoints,
      tsconfig: opts.tsconfig,
      skipErrorChecking: true,
      logLevel: 'Error'
    },
    // Use only the TSConfigReader so we don't pick up the repo's typedoc.json
    // (which has our plugin options that aren't registered yet).
    [new TSConfigReader()]
  );
  register?.(app);
  const project = await app.convert();
  if (!project) {
    throw new Error(`TypeDoc could not convert entry points: ${opts.entryPoints.join(', ')}`);
  }
  return { app, project };
}

/**
 * GEN path: bootstrap TypeDoc, register the skillit plugin, set the output
 * directory, then run the full convert pipeline. The plugin's EVENT_RESOLVE_END
 * handler performs extract → render → write, producing SKILL.md files under
 * `outDir`.
 *
 * @category Programmatic
 * @useWhen
 * - You want to generate SKILL.md files from TypeScript source without running
 *   the TypeDoc CLI directly
 * - Integrating skillit into a custom build pipeline or programmatic tool
 */
export async function generateTypeDocSkills(
  opts: TypeDocRunOptions & { outDir: string }
): Promise<void> {
  await convertProject(opts, (app) => {
    // load() registers options (skillsOutDir etc.) and the EVENT_RESOLVE_END hook.
    // Must be called before setValue so the declaration exists.
    load(app);
    app.options.setValue('skillsOutDir', opts.outDir);
  });
}

/**
 * AUDIT path: bootstrap TypeDoc, convert the project, then extract structured
 * skill data without writing any files. Returns the extracted skills for
 * downstream audit, scoring, or refine pipelines.
 *
 * @category Programmatic
 * @useWhen
 * - You need `ExtractedSkill[]` for audit or refine without writing SKILL.md
 * - Building a custom pipeline that separates extraction from rendering
 */
export async function extractTypeDocSkills(opts: TypeDocRunOptions): Promise<ExtractedSkill[]> {
  const { project } = await convertProject(opts);
  const pkgDir = (await findNearestPackageDir(opts.cwd)) ?? opts.cwd;
  const meta = await readPackageMetadata(pkgDir);

  // Map PackageMetadata (core) → PackageMetadata (extractor).
  // readPackageMetadata uses `packageName`/`packageDescription`;
  // extractSkills expects `name`/`description`.
  const extractorMeta = {
    ...(meta.packageName !== undefined ? { name: meta.packageName } : {}),
    ...(meta.packageDescription !== undefined ? { description: meta.packageDescription } : {}),
    ...(meta.keywords !== undefined ? { keywords: meta.keywords } : {}),
    ...(meta.repository !== undefined ? { repository: meta.repository } : {})
  };

  return extractSkills(project, false, extractorMeta);
}

/**
 * Build a `RefineSource` for the TypeDoc-driven audit path.
 *
 * The returned source calls `extractTypeDocSkills` on demand and caches the
 * extracted audit context. `applyFixes` is a no-op — TypeDoc extraction is
 * read-only; fixes are applied at the source-file level by the refine CLI.
 *
 * @category Programmatic
 */
export function createTypeDocRefineSource(opts: TypeDocRunOptions): RefineSource {
  let cachedCtx: AuditContext = {};

  return {
    async extract(): Promise<ExtractedSkill> {
      const skills = await extractTypeDocSkills(opts);
      const pkgDir = (await findNearestPackageDir(opts.cwd)) ?? opts.cwd;
      const meta = await readPackageMetadata(pkgDir);

      cachedCtx = {
        ...(meta.packageDescription !== undefined
          ? { packageDescription: meta.packageDescription }
          : {}),
        ...(meta.keywords !== undefined ? { keywords: meta.keywords } : {}),
        ...(meta.repository !== undefined ? { repository: meta.repository } : {}),
        ...(meta.readme !== undefined ? { readme: meta.readme } : {})
      };

      return (
        skills[0] ?? {
          name: '',
          description: '',
          functions: [],
          classes: [],
          types: [],
          enums: [],
          variables: [],
          examples: []
        }
      );
    },

    auditContext(_skill: ExtractedSkill): AuditContext {
      return cachedCtx;
    },

    async applyFixes(_fixes: readonly DraftedFix[]): Promise<void> {
      // No-op: TypeDoc extraction is read-only.
      // Fixes are applied at the source-file level by the refine CLI.
    },

    resolveTargetLocation(target: {
      name: string;
      kind: string;
      file?: string;
    }): TargetLocation | undefined {
      return target.file ? { file: target.file, declName: target.name } : undefined;
    }
  };
}
