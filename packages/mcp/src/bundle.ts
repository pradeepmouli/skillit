/**
 * Bundle-mode orchestrator.
 *
 * `bundleMcpSkill(options)` reads `skillit.mcp` from the host package's
 * `package.json`, then for each declared server it:
 *   1. spawns the server (stdio) and runs the existing extract pipeline,
 *   2. renders SKILL.md for each requested invocation target with
 *      {@link AdapterRenderContext.packageName} set to the host package name
 *      (so the emitted skill instructs MCP harnesses to launch via
 *      `npx -y <packageName>` per FR-033),
 *   3. writes the rendered files under `<packageRoot>/skills/<skillName>/`.
 *
 * Batch semantics: a single server's failure is recorded on
 * {@link BundleResult.failures} and the loop continues with the remaining
 * entries. The CLI maps the worst code in the failures map to an exit code.
 *
 * Multi-target rendering — one server → multiple `invocation` entries →
 * multiple skill directories with disambiguated names — produces one
 * `WrittenSkill` per (entry, target) tuple keyed by
 * `<skillName>` (single-target) or `<skillName>-<targetSuffix>` (multi-target,
 * matching the FR-IT-009 disambiguation rule the CLI uses for extract mode).
 *
 * @module bundle
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverDepSkills, renderSkill, writeSkills } from '@skillit/core';
import type { ExtractedSkill, RenderedSkill } from '@skillit/core';
import { loadAdapterAsync } from './adapter/loader.js';
import { runMcpAudit, worstSeverityOf } from './audit/rules.js';
import { loadBundledMcpGuidanceSkill } from './bundled-skills.js';
import { type NormalizedBundleEntry, readBundleConfig } from './bundle/config.js';
import { McpError } from './errors.js';
import { extractMcpSkill } from './extract.js';
import { renderLlmsTxt } from './render/llms-txt.js';
import type { AuditIssue, BundleResult, McpBundleOptions, WrittenSkill } from './types.js';
import type { InvocationTarget } from './adapter/types.js';

/**
 * Run bundle mode against the host package at `options.packageRoot`.
 *
 * @param options bundle-mode options. `packageRoot` defaults to `process.cwd()`,
 *   `outDir` defaults to `<packageRoot>/skills`.
 * @returns a {@link BundleResult} keyed by `skillName` for both successful
 *   writes (`skills`) and per-server failures (`failures`). The
 *   `packageJsonWarnings` array carries non-fatal `files`-field hints
 *   (FR-035).
 *
 * @public
 */
export async function bundleMcpSkill(options: McpBundleOptions = {}): Promise<BundleResult> {
  const packageRoot = path.resolve(options.packageRoot ?? process.cwd());
  const outDir = path.resolve(packageRoot, options.outDir ?? 'skills');

  const rawEntries = await readBundleConfig(packageRoot);

  // `options.invocation` overrides the per-entry `invocation` declared in
  // package.json. Normalize string-or-array → readonly array, then apply.
  const override = normalizeInvocationOverride(options.invocation);
  const entries: NormalizedBundleEntry[] = override
    ? rawEntries.map((e) => ({ ...e, invocation: override }))
    : rawEntries;

  // Read package.json once more for the package-name self-reference and the
  // files-field warning. readBundleConfig() already validated this file is
  // parseable, so a parse error here would be a TOCTOU race we don't care
  // about — let it propagate.
  const pkgRaw = await readFile(path.join(packageRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw) as {
    name?: string;
    files?: string[];
  };
  const packageName = pkg.name;

  const result: BundleResult = {
    skills: {},
    failures: {},
    packageJsonWarnings: []
  };
  const bundledSkillWritten = { value: false };

  for (const entry of entries) {
    await processEntry(entry, {
      packageRoot,
      outDir,
      packageName,
      result,
      installTargets: options.installTargets,
      skipAudit: options.skipAudit === true,
      llmsTxt: options.llmsTxt === true,
      bundledSkillWritten
    });
  }

  // Files-field check runs after writes so we only nag the user when there's
  // something to publish.
  result.packageJsonWarnings = checkFilesField(
    pkg,
    existsSync(path.join(packageRoot, 'dist')),
    path.relative(packageRoot, outDir) || 'skills'
  );
  for (const w of result.packageJsonWarnings) {
    process.stderr.write(`[skillit-mcp] ${w}\n`);
  }

  return result;
}

/**
 * Per-entry pipeline: extract → render → write. Failures are recorded on
 * `result.failures` and the function returns; the caller continues with the
 * next entry.
 */
async function processEntry(
  entry: NormalizedBundleEntry,
  ctx: {
    packageRoot: string;
    outDir: string;
    packageName: string | undefined;
    result: BundleResult;
    installTargets: readonly string[] | undefined;
    skipAudit: boolean;
    llmsTxt: boolean;
    bundledSkillWritten: { value: boolean };
  }
): Promise<void> {
  const { outDir, packageName, result, installTargets, skipAudit, llmsTxt, bundledSkillWritten } =
    ctx;

  // 1. Extract via stdio transport. The IR is target-agnostic, so a single
  //    extract feeds the whole multi-target render loop below.
  //
  //    Pass `audit.skip: true` through to the extractor regardless of the
  //    bundle-side `skipAudit` setting — bundle mode runs the audit ITSELF
  //    below (so it can populate `WrittenSkill.audit` and record
  //    AUDIT_FAILED), and we don't want extract to also log the same issues
  //    to stderr a second time.
  let skill: import('@skillit/core').ExtractedSkill;
  try {
    const env = entry.env ? Object.fromEntries(Object.entries(entry.env)) : undefined;
    skill = await extractMcpSkill({
      transport: env
        ? {
            type: 'stdio',
            command: entry.command,
            args: [...entry.args],
            env
          }
        : {
            type: 'stdio',
            command: entry.command,
            args: [...entry.args]
          },
      skillName: entry.skillName,
      audit: { skip: true }
    });
  } catch (err) {
    recordFailure(result, entry.skillName, err);
    return;
  }

  skill.rootDir = ctx.packageRoot;
  skill.seeAlso = await discoverDepSkills(ctx.packageRoot);

  // Run the audit ONCE per entry — the IR is target-agnostic so M1–M4 are
  // identical across targets. (M5 freshness is per-target but isn't checkable
  // here without an embedded fingerprint, so we skip it for now.)
  const auditIssues: readonly AuditIssue[] = skipAudit ? [] : runMcpAudit(skill);
  const worst = worstSeverityOf(auditIssues);

  // 2. Per-target render+write loop. Each tuple gets its own WrittenSkill in
  //    `result.skills`, keyed by the disambiguated directory name (so
  //    multi-target entries don't collide). Failures during a single target's
  //    render/write are recorded against the entry's skillName and the loop
  //    continues with the next target — partial-success semantics match the
  //    per-entry policy already used by the surrounding bundleMcpSkill loop.
  const targets = entry.invocation;
  const multi = targets.length > 1;
  for (const target of targets) {
    const dirName = multi ? `${entry.skillName}-${target.replace(/:/g, '-')}` : entry.skillName;

    let rendered: RenderedSkill;
    try {
      const adapter = await loadAdapterAsync(target);
      const renderOptions: Parameters<typeof renderSkill>[1] = {
        invocation: adapter,
        // Multi-target runs disambiguate the output directory by passing
        // namePrefix; single-target keeps today's <outDir>/<skillName>/ shape.
        ...(multi ? { namePrefix: dirName } : {}),
        ...(packageName !== undefined ? { invocationPackageName: packageName } : {}),
        ...(packageName !== undefined && entry.binName !== undefined
          ? { invocationBinName: entry.binName }
          : {})
      };
      rendered = await renderSkill(skill, renderOptions);
      if (llmsTxt) {
        // Append before writeSkills so the writer persists llms.txt alongside
        // SKILL.md. Per-target — each disambiguated directory gets its
        // own index file.
        rendered.references.push(renderLlmsTxt(rendered, skill));
      }
    } catch (err) {
      recordFailure(result, dirName, err);
      continue;
    }

    try {
      writeGeneratedSkill(rendered, outDir, installTargets, dirName);
      if (installTargets && installTargets.length > 0 && bundledSkillWritten.value === false) {
        writeBundledGuidance(outDir, installTargets);
        bundledSkillWritten.value = true;
      }
    } catch (err) {
      recordFailure(result, dirName, err);
      continue;
    }

    const skillDir = path.join(outDir, dirName);
    // The renderer emits filenames relative to outDir, so the absolute path of
    // each rendered file is `path.join(outDir, file.filename)`. Relativize against
    // skillDir so `WrittenSkill.files` is always relative to its `dir`, regardless
    // of whether the adapter prefixes with skillName or emits at the root.
    const toRelative = (filename: string): string =>
      path.relative(skillDir, path.join(outDir, filename));
    const written: WrittenSkill = {
      dir: skillDir,
      files: [
        toRelative(rendered.skill.filename),
        ...rendered.references.map((r) => toRelative(r.filename))
      ],
      target,
      audit: { issues: [...auditIssues], worstSeverity: worst }
    };
    result.skills[dirName] = written;
  }

  // Audit-failure recording (FR-041). When the audit produced fatal/error
  // severity AND the operator did NOT pass --skip-audit, record a parallel
  // BundleFailure so the CLI's worst-code mapper raises the exit code
  // alongside any sibling extract/render failures. We key the failure with
  // an `audit:` prefix so it doesn't collide with target-level extract/write
  // failures keyed by `dirName` — both can co-exist on the same entry.
  if (!skipAudit && (worst === 'fatal' || worst === 'error')) {
    const summary = summarizeAuditFailure(auditIssues);
    result.failures[`audit:${entry.skillName}`] = {
      code: 'AUDIT_FAILED',
      message: `Audit failed for ${entry.skillName}: ${summary}`
    };
  }
}

/**
 * One-line summary of the fatal/error issues that triggered an AUDIT_FAILED.
 * Used in the BundleFailure message so stderr surfaces actionable detail
 * without dumping the full issue list (the `audit` field on WrittenSkill
 * carries the structured copy for programmatic consumers).
 */
function summarizeAuditFailure(issues: readonly AuditIssue[]): string {
  const blocking = issues.filter((i) => i.severity === 'fatal' || i.severity === 'error');
  if (blocking.length === 0) return 'unknown';
  const first = blocking[0]!;
  const rest = blocking.length - 1;
  const tail = rest > 0 ? ` (+ ${rest} more)` : '';
  return `[${first.code} ${first.severity}] ${first.message}${tail}`;
}

/**
 * Normalize the public `McpBundleOptions.invocation` override (string-or-array)
 * into a readonly array. Returns undefined when no override was supplied — the
 * caller then preserves each entry's per-package `invocation`.
 */
function normalizeInvocationOverride(
  invocation: McpBundleOptions['invocation']
): readonly InvocationTarget[] | undefined {
  if (invocation === undefined) return undefined;
  return Array.isArray(invocation) ? invocation : [invocation];
}

/**
 * Convert an unknown thrown value into a {@link BundleFailure} record on
 * `result.failures`. Preserves the McpError code where possible; install-path
 * filesystem/package failures are wrapped earlier as `LOCAL_IO_FAILED`, while
 * truly unknown non-McpError throws fall through as `TRANSPORT_FAILED`.
 */
function recordFailure(result: BundleResult, skillName: string, err: unknown): void {
  if (err instanceof McpError) {
    result.failures[skillName] = { code: err.code, message: err.message };
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  result.failures[skillName] = { code: 'TRANSPORT_FAILED', message };
}

/**
 * Render an extracted MCP skill and write SKILL.md + references under `outDir`.
 *
 * This is the deterministic render+write core shared by `generateMcpSkill`
 * (the `skillit gen --source mcp` primitive) and {@link bundleMcpSkill} so both
 * emit byte-identical output for the no-adapter, no-install case. It performs
 * the plain (invocation-agnostic) render — bundle mode layers its own
 * adapter/namePrefix/packageName/llms.txt/installTargets orchestration on top
 * via {@link writeGeneratedSkill} and the per-target render loop.
 *
 * @param skill - the extracted skill IR.
 * @param outDir - absolute output directory.
 * @returns the write-result records returned by `writeSkills`.
 *
 * @public
 */
export function renderAndWriteMcpSkill(skill: ExtractedSkill, outDir: string, maxTokens?: number) {
  const rendered = renderSkill(skill, maxTokens !== undefined ? { maxTokens } : undefined);
  return writeBundledSkill([rendered], { outDir });
}

/**
 * Shared `writeSkills` invocation with bundle's `LOCAL_IO_FAILED` error
 * mapping. Centralised so {@link renderAndWriteMcpSkill}, the per-target
 * bundle loop, and the bundled-guidance writer all funnel write failures
 * through the same {@link McpError} translation.
 */
function writeBundledSkill(
  skills: RenderedSkill[],
  options: Parameters<typeof writeSkills>[1]
): ReturnType<typeof writeSkills> {
  try {
    return writeSkills(skills, options);
  } catch (error) {
    throw new McpError(
      `Failed to write skill output: ${messageOf(error)}`,
      'LOCAL_IO_FAILED',
      error
    );
  }
}

function writeGeneratedSkill(
  rendered: RenderedSkill,
  outDir: string,
  installTargets: readonly string[] | undefined,
  dirName: string
): void {
  try {
    writeSkills([rendered], { outDir, installTargets });
  } catch (error) {
    throw new McpError(
      `Failed to write bundled output for ${dirName}: ${messageOf(error)}`,
      'LOCAL_IO_FAILED',
      error
    );
  }
}

function writeBundledGuidance(outDir: string, installTargets: readonly string[]): void {
  try {
    writeSkills([loadBundledMcpGuidanceSkill()], {
      outDir,
      installTargets,
      includeOutDir: false
    });
  } catch (error) {
    throw new McpError(
      `Failed to install bundled MCP guidance: ${messageOf(error)}`,
      'LOCAL_IO_FAILED',
      error
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * FR-035: warn when the host's `package.json` declares a `files` array that
 * would exclude the generated skill from `npm publish`. We never mutate
 * `package.json` — the warning is appended to stderr and to
 * {@link BundleResult.packageJsonWarnings}.
 *
 * Implicit-include semantics: if `files` is absent, npm includes everything by
 * default and we stay quiet.
 */
function checkFilesField(pkg: { files?: string[] }, hasDist: boolean, outDirRel: string): string[] {
  const warnings: string[] = [];
  if (!pkg.files) return warnings; // implicit-include: no warning

  const filesGlobs = pkg.files;
  const matches = (entry: string): boolean =>
    filesGlobs.some(
      (g) => g === entry || g === `${entry}/` || g.startsWith(`${entry}/**`) || g === `${entry}/**`
    );

  if (hasDist && !matches('dist')) {
    warnings.push(`Add "dist" to package.json "files" array so the server binary is published.`);
  }
  if (!matches(outDirRel)) {
    warnings.push(
      `Add "${outDirRel}" to package.json "files" array so the generated skill is published.`
    );
  }
  return warnings;
}
