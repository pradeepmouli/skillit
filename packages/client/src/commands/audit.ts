// packages/client/src/commands/audit.ts
import { isAbsolute, join } from 'node:path';
import { Command } from 'commander';
import {
  auditSkill,
  ConfigRefineSource,
  estimateSkillJudgeScore,
  type ActionableImprovement,
  type AuditResult,
  type ExtractedSkill,
  type RefineSource,
  type SkillJudgeEstimate,
  type TargetLocation
} from '@skillit/core';
import { CliRefineSource, loadProgram } from '@skillit/cli';
import {
  classifyRefineSources,
  detectInstalledSources,
  detectProjectNature,
  type RefineSourceKind
} from '../detect-source.js';
import { parseConfigTypeSpec, resolveRefineSource, type RefineCommandOpts } from './refine.js';
import { resolveTypeDocEntry } from '../typedoc-entry.js';

/** An improvement with each of its targets resolved to a concrete location (or null). */
export interface AuditReportImprovement extends ActionableImprovement {
  /** One entry per `targets[]`, in order; `null` when the source can't resolve it. */
  resolvedLocations: Array<TargetLocation | null>;
}

/** The full JSON report emitted by `skillit audit --json`. */
export interface AuditReport {
  audit: AuditResult;
  estimate: SkillJudgeEstimate;
  improvements: AuditReportImprovement[];
}

/**
 * Pure report builder: audit + score the skill, then resolve every improvement
 * target to its on-disk location via the source's optional resolveTargetLocation.
 */
export async function buildAuditReport(
  source: RefineSource,
  skill: ExtractedSkill
): Promise<AuditReport> {
  const audit = auditSkill(skill, source.auditContext(skill));
  const estimate = estimateSkillJudgeScore(audit, skill);

  const improvements: AuditReportImprovement[] = [];
  for (const imp of estimate.improvements) {
    const targets = imp.targets ?? [];
    const resolvedLocations: Array<TargetLocation | null> = [];
    for (const target of targets) {
      const loc = source.resolveTargetLocation
        ? await source.resolveTargetLocation(target)
        : undefined;
      resolvedLocations.push(loc ?? null);
    }
    improvements.push({ ...imp, resolvedLocations });
  }

  return { audit, estimate, improvements };
}

/** Parsed options for the `audit` action. */
export interface AuditCommandOpts {
  source?: string;
  program?: string;
  configType?: string;
  mcp?: string;
  json?: boolean;
}

export async function runAuditCommand(opts: AuditCommandOpts): Promise<void> {
  const cwd = process.cwd();

  // Short-circuit an explicitly requested mcp source with a clear message
  // BEFORE routing through refine's resolver — that resolver applies
  // refine-specific validation (e.g. requiring --mcp) and emits refine-flavored
  // errors that would mislead here.
  if (opts.source === 'mcp') {
    console.error(
      `skillit audit does not yet support the mcp source; cli, config, and typedoc are supported in this release.`
    );
    process.exitCode = 1;
    return;
  }

  // typedoc: explicit, or auto-detected as a plain TS library.
  const isTypedoc =
    opts.source === 'typedoc' ||
    (opts.source === undefined && (await detectProjectNature(cwd)) === 'typedoc');

  let source: RefineSource;
  if (isTypedoc) {
    // Lazy import: keeps `@skillit/typedoc` (and its `typedoc` peer) off the CLI
    // startup path so non-typedoc commands run without TypeDoc installed.
    const { createTypeDocRefineSource } = await import('@skillit/typedoc');
    const { entryPoints, tsconfig } = resolveTypeDocEntry(cwd);
    source = createTypeDocRefineSource({ entryPoints, tsconfig, cwd });
  } else {
    const candidates = await detectInstalledSources(cwd);
    const detected = classifyRefineSources(candidates);
    const resolution = resolveRefineSource(opts as RefineCommandOpts, detected, candidates);
    if ('error' in resolution) {
      console.error(resolution.error);
      process.exitCode = 1;
      return;
    }

    if (resolution.kind === 'cli') {
      const program = await loadProgram({ program: opts.program, cwd });
      source = new CliRefineSource({ program, sourceGlob: join(cwd, '**', '*.ts'), cwd });
    } else if (resolution.kind === 'config') {
      const parsed = parseConfigTypeSpec(opts.configType!, cwd);
      if ('error' in parsed) {
        console.error(parsed.error);
        process.exitCode = 1;
        return;
      }
      // No explicit name: ConfigRefineSource derives it from the package nearest
      // the config file (→ typeName), matching what `skillit gen` writes for the
      // same source.
      source = new ConfigRefineSource({
        configFile: isAbsolute(parsed.configFile)
          ? parsed.configFile
          : join(cwd, parsed.configFile),
        typeName: parsed.typeName
      });
    } else {
      console.error(
        `skillit audit does not yet support the ${resolution.kind} source; cli, config, and typedoc are supported in this release.`
      );
      process.exitCode = 1;
      return;
    }
  }

  const skill = await source.extract();
  const report = await buildAuditReport(source, skill);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`Grade ${report.estimate.grade} (${report.estimate.total}/120)`);
    console.log(
      `Fatal ${report.audit.summary.fatal}, Error ${report.audit.summary.error}, Warning ${report.audit.summary.warning}, Alert ${report.audit.summary.alert}`
    );
  }
}

export function buildAuditCommand(): Command {
  return new Command('audit')
    .description('Audit + judge the generated skill; emit findings (with target locations) as JSON')
    .option('--source <kind>', 'cli | mcp | typedoc | config (auto-detected if omitted)')
    .option('--program <file#export>', 'commander program entry (cli source)')
    .option('--config-type <file#export>', 'config type entry (config source)')
    .option('--mcp <path>', 'path to mcp.json or MCP config file')
    .option('--json', 'emit the full AuditResult + SkillJudgeEstimate as JSON')
    .action((opts: AuditCommandOpts) => runAuditCommand(opts));
}

// `RefineSourceKind` re-exported for callers that key off the resolved kind.
export type { RefineSourceKind };
