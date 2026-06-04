/**
 * Commander-based CLI wiring for `@skillit/mcp`.
 *
 * Exposes `buildProgram()`, which constructs a `Command` tree with:
 * - `extract` — connects to a running MCP server (stdio via `--command`,
 *   HTTP via `--url`, or batch via `--config`), renders a SKILL.md per
 *   `--invocation` target, and writes it under the configured output dir.
 * - `bundle` — reads `to-skills.mcp` from the host package's `package.json`,
 *   runs extract per declared server, and writes self-referential skills
 *   into `<packageRoot>/skills/` for dual-consumption packages.
 *
 * The action bodies throw `McpError` on failure; `bin.ts` catches and maps
 * to exit codes (1–5, plus 130 for SIGINT). Flag parsing uses commander's
 * built-in `InvalidArgumentError` for shape-level validation (non-integer
 * `--max-tokens`, malformed `KEY=VALUE` pairs) so usage output stays
 * consistent with commander's style.
 *
 * Header parser format: `--header` uses the same `KEY=VALUE` syntax as
 * `--env`, NOT the `KEY: VALUE` colon notation that raw HTTP uses. Rationale:
 * keeps the parser uniform with `--env`, avoids bifurcating the `collectKv`
 * helper, and works with shell quoting: `--header "Authorization=Bearer X"`.
 *
 * @module cli
 */

import { existsSync } from 'node:fs';
import path, { join } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { readInstalledSkillMetadata, renderSkill, writeSkills } from '@skillit/core';
import { loadAdapterAsync } from './adapter/loader.js';
import type { InvocationAdapter } from './adapter/types.js';
import { bundleMcpSkill } from './bundle.js';
import { loadBundledMcpGuidanceSkill } from './bundled-skills.js';
// Internal import: the bundle CLI does its own pre-flight DUPLICATE_SKILL_NAME
// check (so --force semantics fire BEFORE bundleMcpSkill calls writeSkills,
// which always rmSyncs the destination). readBundleConfig is the cleanest
// hook — it returns normalized entries with skillName resolved, and we want
// to short-circuit on collision without re-implementing config parsing. This
// is an internal-only import; readBundleConfig stays out of the public API.
import { readBundleConfig } from './bundle/config.js';
import { readMcpConfigFile } from './config/file-reader.js';
import type { BundleFailure, ConfigEntry, McpBundleOptions, McpExtractOptions } from './types.js';
import type { InvocationTarget } from './adapter/types.js';
import { McpError, type McpErrorCode } from './errors.js';
import { extractMcpSkill } from './extract.js';
import { renderLlmsTxt } from './render/llms-txt.js';
import { PACKAGE_VERSION } from './version.js';

const BUNDLED_MCP_GUIDANCE_NAME = 'to-skills-mcp-docs';

/**
 * Build the top-level commander program for `to-skills-mcp`.
 *
 * Consumers that want to embed the CLI into a parent program (e.g. a
 * monorepo-wide `to-skills` wrapper) can call this and attach the returned
 * `Command` as a subcommand.
 *
 * @public
 */
export function buildProgram(): Command {
  const program = new Command()
    .name('to-skills-mcp')
    .description('Extract or bundle MCP servers as Agent Skills')
    .version(PACKAGE_VERSION);

  program
    .command('extract')
    .description('Extract a SKILL.md from a running MCP server')
    .option('--command <cmd>', 'Stdio launch command (mutually exclusive with --url, --config)')
    .option('--arg <a>', 'Arg to pass to the server command (repeatable)', collect, [])
    .option('--env <KEY=VALUE>', 'Environment variable for the server (repeatable)', collectKv, {})
    .option('--url <url>', 'HTTP/SSE endpoint (mutually exclusive with --command, --config)')
    .option(
      '--header <K=V>',
      'HTTP header in KEY=VALUE form (repeatable; e.g. --header "Authorization=Bearer X")',
      collectKv,
      {}
    )
    .option(
      '--config <path>',
      'Path to mcp.json / claude_desktop_config.json (batch extract over mcpServers)'
    )
    .option('-o, --out <dir>', 'Output directory', 'skills')
    .option(
      '--install-target <dir>',
      'Install skills to agent discovery directory (repeatable)',
      collect,
      [] as string[]
    )
    .option('--max-tokens <n>', 'Per reference-file token budget', parsePositiveInt, 4000)
    .option('--llms-txt', 'Emit llms.txt alongside SKILL.md')
    .option('--force', 'Overwrite existing skill directory')
    .option('--skip-audit', 'Skip audit rules')
    .option(
      '--audit-alerts',
      'Include severity:alert audit findings (e.g. M4 generic tool names) in stderr'
    )
    .option('--canonicalize', 'Run canonicalization pass on output (default true)', true)
    .option('--no-canonicalize', 'Disable canonicalization pass')
    .option('--skill-name <name>', 'Override skill directory name (default: derived from server)')
    .option(
      '--invocation <target>',
      'Render with this invocation target (repeatable). Default: mcp-protocol',
      collect,
      [] as string[]
    )
    .action(runExtract);

  program
    .command('bundle')
    .description('Bundle an MCP server into its host package as a generated skill')
    .option('--package-root <dir>', 'Path to the host package (default: cwd)')
    .option('-o, --out <dir>', 'Output directory (default: <packageRoot>/skills)')
    .option(
      '--install-target <dir>',
      'Install skills to agent discovery directory (repeatable)',
      collect,
      [] as string[]
    )
    .option('--max-tokens <n>', 'Per reference-file token budget', parsePositiveInt, 4000)
    .option('--llms-txt', 'Emit llms.txt alongside SKILL.md')
    .option('--force', 'Overwrite existing skill directories')
    .option('--skip-audit', 'Skip audit rules')
    .option(
      '--audit-alerts',
      'Include severity:alert audit findings (e.g. M4 generic tool names) in stderr'
    )
    .option('--canonicalize', 'Run canonicalization pass on output (default true)', true)
    .option('--no-canonicalize', 'Disable canonicalization pass')
    .option(
      '--invocation <target>',
      'Override per-entry invocation target (repeatable)',
      collect,
      [] as string[]
    )
    .action(runBundle);

  return program;
}

/**
 * Commander `option()` collector — pushes each `--arg foo` occurrence onto a
 * growing array. Used for the repeatable `--arg` flag.
 * @internal
 */
function collect(value: string, prev: string[]): string[] {
  return [...prev, value];
}

/**
 * Commander `option()` collector that splits `KEY=VALUE` pairs into a record.
 * Used for the repeatable `--env` and `--header` flags. Throws
 * `InvalidArgumentError` on malformed input so commander emits a consistent
 * usage-style error.
 * @internal
 */
function collectKv(value: string, prev: Record<string, string>): Record<string, string> {
  const idx = value.indexOf('=');
  if (idx === -1) {
    throw new InvalidArgumentError(`Expected KEY=VALUE, got: ${value}`);
  }
  return { ...prev, [value.slice(0, idx)]: value.slice(idx + 1) };
}

/**
 * Commander `option()` parser for positive integer flags. Used by
 * `--max-tokens`. Throws `InvalidArgumentError` on non-integer / non-positive
 * input so commander emits a usage error.
 * @internal
 */
function parsePositiveInt(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0 || String(n) !== value.trim()) {
    throw new InvalidArgumentError(`Expected positive integer, got: ${value}`);
  }
  return n;
}

/** Parsed `extract` subcommand options as produced by commander. @internal */
interface ExtractOpts {
  command?: string;
  arg: string[];
  env: Record<string, string>;
  url?: string;
  header: Record<string, string>;
  config?: string;
  out: string;
  installTarget: string[];
  maxTokens: number;
  llmsTxt?: boolean;
  force?: boolean;
  skipAudit?: boolean;
  auditAlerts?: boolean;
  canonicalize: boolean;
  skillName?: string;
  invocation: string[];
}

/**
 * `extract` action body. Validates flag combinations, runs the extraction
 * pipeline, and writes the rendered skill.
 *
 * @internal
 * @throws {McpError} — on any failure; `bin.ts` maps to an exit code.
 */
async function runExtract(opts: ExtractOpts): Promise<void> {
  // Mutual exclusion + at-least-one validation
  const modes = [opts.command, opts.url, opts.config].filter(Boolean);
  if (modes.length === 0) {
    throw new McpError(
      'extract requires one of --command, --url, or --config.',
      'TRANSPORT_FAILED'
    );
  }
  if (modes.length > 1) {
    throw new McpError(
      '--command, --url, and --config are mutually exclusive.',
      'TRANSPORT_FAILED'
    );
  }

  // Config-file batch mode. Delegates to runConfigExtract,
  // which handles per-entry containment + worst-code aggregation. We dispatch
  // BEFORE the single-entry --canonicalize / --skip-audit notices because
  // those notices fire inside runConfigExtract once per batch instead.
  if (opts.config !== undefined) {
    await runConfigExtract(opts);
    return;
  }

  // Notices for accepted-but-unwired flags.
  // Mirrors the --llms-txt pattern below so users get explicit feedback
  // rather than silent acceptance.
  if (!opts.canonicalize) {
    process.stderr.write(
      '[to-skills-mcp] --no-canonicalize is not yet wired; canonicalization currently always runs.\n'
    );
  }

  // Compute the requested invocation targets — empty `--invocation` means
  // default to the MCP-native adapter. Repeated `--invocation` produces a
  // multi-target run with disambiguated output directories (FR-IT-009).
  const targets: InvocationTarget[] =
    opts.invocation.length > 0
      ? (opts.invocation as InvocationTarget[])
      : (['mcp-protocol'] as InvocationTarget[]);

  // Eager target validation — load every adapter BEFORE we spawn the
  // server, so a typo on `--invocation` exits 5 without paying the spawn
  // cost. The loader's per-process cache makes the subsequent
  // loadAdapterAsync() calls in the render loop free.
  const adapters = await validateTargets(targets);

  // Early collision check — fires BEFORE spawning the server when the user
  // supplied --skill-name (the common fast-feedback case). When the name
  // depends on server introspection, the check repeats post-extract per
  // target directory.
  if (opts.skillName !== undefined) {
    assertNoExistingSkillDirectories({
      outDir: opts.out,
      installTargets: opts.installTarget,
      dirNames: adapters.map((adapter) =>
        dirNameForTarget(opts.skillName!, adapter, adapters.length)
      ),
      force: opts.force === true
    });
  }
  if (opts.installTarget.length > 0) {
    assertNoExistingSkillDirectories({
      outDir: opts.out,
      installTargets: opts.installTarget,
      dirNames: [BUNDLED_MCP_GUIDANCE_NAME],
      includeOutDir: false,
      allowExistingBundledGuidance: true,
      force: opts.force === true
    });
  }

  // Extract once — the IR is target-agnostic, so the loop below renders
  // (and writes) one skill directory per requested target from the same IR.
  const auditOpts =
    opts.skipAudit === true
      ? { audit: { skip: true } }
      : opts.auditAlerts === true
        ? { audit: { includeAlerts: true } }
        : {};
  const skill =
    opts.url !== undefined
      ? await extractMcpSkill({
          transport: {
            type: 'http',
            url: opts.url,
            headers: Object.keys(opts.header).length > 0 ? opts.header : undefined
          },
          skillName: opts.skillName,
          maxTokens: opts.maxTokens,
          installTargets: opts.installTarget,
          ...auditOpts
        })
      : await extractMcpSkill({
          transport: {
            type: 'stdio',
            command: opts.command!,
            args: opts.arg,
            env: Object.keys(opts.env).length > 0 ? opts.env : undefined
          },
          skillName: opts.skillName,
          maxTokens: opts.maxTokens,
          installTargets: opts.installTarget,
          ...auditOpts
        });

  // Per-target render+write loop. Each iteration writes its own directory and
  // emits one stdout line. Collision detection moves into the loop so each
  // target dir is checked independently.
  let wroteBundledGuidance = false;
  for (const adapter of adapters) {
    const dirName = dirNameForTarget(skill.name, adapter, adapters.length);
    const skillDir = join(opts.out, dirName);
    assertNoExistingSkillDirectories({
      outDir: opts.out,
      installTargets: opts.installTarget,
      dirNames: [dirName],
      force: opts.force === true
    });

    const renderOptions: Parameters<typeof renderSkill>[1] = {
      invocation: adapter,
      maxTokens: opts.maxTokens,
      // Multi-target runs disambiguate the output directory by passing
      // namePrefix; single-target keeps today's <outDir>/<skillName>/ shape.
      ...(adapters.length > 1 ? { namePrefix: dirName } : {})
    };
    if (opts.url !== undefined) {
      renderOptions.invocationHttpEndpoint = {
        url: opts.url,
        ...(Object.keys(opts.header).length > 0 ? { headers: opts.header } : {})
      };
    } else {
      renderOptions.invocationLaunchCommand = {
        command: opts.command!,
        args: opts.arg,
        env: Object.keys(opts.env).length > 0 ? opts.env : undefined
      };
    }

    const rendered = await renderSkill(skill, renderOptions);
    if (opts.llmsTxt) {
      // Append before writeSkills so the writer persists llms.txt alongside
      // SKILL.md and the references/. The file lives at the skill root
      // (next to SKILL.md), per the llmstxt.org convention.
      rendered.references.push(renderLlmsTxt(rendered, skill));
    }
    writeRenderedSkill(rendered, {
      outDir: opts.out,
      installTargets: opts.installTarget,
      skillDir
    });
    if (opts.installTarget.length > 0 && !wroteBundledGuidance) {
      writeBundledGuidance(opts.out, opts.installTarget);
      wroteBundledGuidance = true;
    }

    process.stdout.write(`Wrote ${skillDir}/SKILL.md (${rendered.references.length} references)\n`);
  }
}

/**
 * `extract --config <path>` action body.
 *
 * Reads the Claude-Desktop-shaped config file, then runs the full
 * extract → render → write pipeline once per enabled entry. Failures are
 * contained per-entry: a single server's crash records a {@link BundleFailure}
 * and the loop continues so partially-successful runs still produce the
 * remaining skills. After the loop, if any entry failed, throws an
 * {@link McpError} carrying the worst code in the failure set so `bin.ts`
 * maps to a non-zero exit (the worst-code hierarchy mirrors `runBundle`).
 *
 * `--invocation` is supported in batch mode: the same multi-target render
 * loop used by stdio/http extract runs per-entry, producing disambiguated
 * `<skillName>-<targetSuffix>` directories when multiple targets are
 * requested. This keeps the CLI surface consistent across modes.
 *
 * Disabled entries (`disabled: true`) are skipped silently — the spec
 * defines them as "configured but turned off", not failure conditions.
 *
 * @internal
 */
async function runConfigExtract(opts: ExtractOpts): Promise<void> {
  // Notices for not-yet-wired flags — emitted ONCE per CLI invocation, not
  // per-entry, to mirror the bundle-mode pattern and avoid stderr spam on
  // many-server configs.
  if (!opts.canonicalize) {
    process.stderr.write(
      '[to-skills-mcp] --no-canonicalize is not yet wired; canonicalization currently always runs.\n'
    );
  }
  const entries = await readMcpConfigFile(opts.config!);

  // Resolve invocation targets eagerly — same approach as runExtract so a
  // typo on `--invocation` exits 5 BEFORE we spawn anything for any entry.
  const targets: InvocationTarget[] =
    opts.invocation.length > 0
      ? (opts.invocation as InvocationTarget[])
      : (['mcp-protocol'] as InvocationTarget[]);
  const adapters = await validateTargets(targets);
  if (opts.installTarget.length > 0) {
    assertNoExistingSkillDirectories({
      outDir: opts.out,
      installTargets: opts.installTarget,
      dirNames: [BUNDLED_MCP_GUIDANCE_NAME],
      includeOutDir: false,
      allowExistingBundledGuidance: true,
      force: opts.force === true
    });
  }

  const failures: Record<string, BundleFailure> = {};
  const bundledGuidanceState = { value: false };

  for (const entry of entries) {
    if (entry.disabled === true) {
      continue;
    }

    try {
      await runConfigEntry(entry, opts, adapters, bundledGuidanceState);
    } catch (err) {
      // Per-entry containment — match `bundle.ts::recordFailure`'s shape so
      // the partial-success contract documented at the top of this function
      // actually holds for non-McpError throws too (renderer bugs or other
      // unexpected failures). Local write/parse problems in the install path
      // are wrapped earlier as LOCAL_IO_FAILED so they don't get mislabeled as
      // transport issues here. The McpError branch is preferred so structured
      // errors keep their codes; truly unknown failures still fall back to
      // TRANSPORT_FAILED as the conservative catch-all.
      if (err instanceof McpError) {
        failures[entry.name] = { code: err.code, message: err.message };
        process.stderr.write(`Failed [${err.code}] ${entry.name}: ${err.message}\n`);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      failures[entry.name] = { code: 'TRANSPORT_FAILED', message };
      process.stderr.write(`Failed [TRANSPORT_FAILED] ${entry.name}: ${message}\n`);
    }
  }

  // Exit-code policy: ≥1 entries failed → throw with the worst code so
  // bin.ts maps to a non-zero exit. Hierarchy matches runBundle so multi-mode
  // runs converge on a deterministic code.
  const codes = Object.values(failures).map((f) => f.code);
  if (codes.length > 0) {
    const worst = pickWorstCode(codes);
    throw new McpError(
      `extract --config: ${codes.length} ${codes.length === 1 ? 'entry' : 'entries'} failed. See stderr above.`,
      worst
    );
  }
}

/**
 * Run extract → render → write for a single config entry. Mirrors the
 * single-entry path in `runExtract`; factored out so the batch loop can
 * catch each iteration independently.
 *
 * @internal
 */
async function runConfigEntry(
  entry: ConfigEntry,
  opts: ExtractOpts,
  adapters: InvocationAdapter[],
  bundledGuidanceState: { value: boolean }
): Promise<void> {
  // Build the McpExtractOptions from the entry. The reader has already
  // collapsed `command`/`url` into a fully-discriminated `McpTransport`, so
  // we just spread it through — no runtime narrowing needed at this layer.
  const auditOpts =
    opts.skipAudit === true
      ? { audit: { skip: true } }
      : opts.auditAlerts === true
        ? { audit: { includeAlerts: true } }
        : {};
  const extractOpts: McpExtractOptions = {
    transport: entry.transport,
    skillName: entry.name,
    maxTokens: opts.maxTokens,
    installTargets: opts.installTarget,
    ...auditOpts
  };

  // Pre-flight collision check, per target. Mirrors runExtract so --force
  // semantics fire before writeSkills rmSyncs anything.
  assertNoExistingSkillDirectories({
    outDir: opts.out,
    installTargets: opts.installTarget,
    dirNames: adapters.map((adapter) => dirNameForTarget(entry.name, adapter, adapters.length)),
    force: opts.force === true
  });

  const skill = await extractMcpSkill(extractOpts);

  // Use entry.name (the config key) consistently as the directory base. The
  // pre-flight check above used entry.name; we keep using it here so the
  // collision check protects the same directory writeSkills will write to.
  // Since extractOpts.skillName === entry.name, skill.name should already
  // equal entry.name in practice — but referencing entry.name directly
  // removes the implicit invariant.
  for (const adapter of adapters) {
    const dirName = dirNameForTarget(entry.name, adapter, adapters.length);
    const skillDir = join(opts.out, dirName);

    const renderOptions: Parameters<typeof renderSkill>[1] = {
      invocation: adapter,
      maxTokens: opts.maxTokens,
      ...(adapters.length > 1 ? { namePrefix: dirName } : {})
    };
    if (entry.transport.type === 'http') {
      renderOptions.invocationHttpEndpoint = {
        url: entry.transport.url,
        ...(entry.transport.headers !== undefined ? { headers: entry.transport.headers } : {})
      };
    } else {
      // Mirror extractOpts shape: omit `args` when the entry omits it rather
      // than emitting an empty array. Otherwise the rendered mcp: frontmatter
      // would carry `args: []` for entries that didn't declare any args, while
      // the spawn would see undefined — observably different in the YAML.
      renderOptions.invocationLaunchCommand = {
        command: entry.transport.command,
        ...(entry.transport.args !== undefined ? { args: entry.transport.args } : {}),
        ...(entry.transport.env !== undefined ? { env: entry.transport.env } : {})
      };
    }

    const rendered = await renderSkill(skill, renderOptions);
    if (opts.llmsTxt) {
      rendered.references.push(renderLlmsTxt(rendered, skill));
    }
    writeRenderedSkill(rendered, {
      outDir: opts.out,
      installTargets: opts.installTarget,
      skillDir
    });
    if (opts.installTarget.length > 0 && !bundledGuidanceState.value) {
      writeBundledGuidance(opts.out, opts.installTarget);
      bundledGuidanceState.value = true;
    }

    process.stdout.write(`Wrote ${skillDir}/SKILL.md (${rendered.references.length} references)\n`);
  }
}

/**
 * Pick the most-actionable McpErrorCode from a multi-failure set. Hierarchy
 * mirrors `runBundle` so config-mode and bundle-mode partial failures map to
 * the same exit code when failure sets overlap.
 *
 * @internal
 */
function pickWorstCode(codes: readonly McpErrorCode[]): McpErrorCode {
  const ordered: McpErrorCode[] = [
    'DUPLICATE_SKILL_NAME',
    'MISSING_LAUNCH_COMMAND',
    'UNKNOWN_TARGET',
    'ADAPTER_NOT_FOUND',
    'SCHEMA_REF_CYCLE',
    'SERVER_EXITED_EARLY',
    // Audit failures sit just below the schema-cycle / early-exit tier:
    // they're "output exists but is operationally broken" — strictly more
    // actionable than a transient init or transport blip, but less actionable
    // than a config-side cycle that the operator must fix in source.
    'AUDIT_FAILED',
    'LOCAL_IO_FAILED',
    'PROTOCOL_VERSION_UNSUPPORTED',
    'INITIALIZE_FAILED',
    'TRANSPORT_FAILED'
  ];
  // Callers (`runConfigExtract`, `runBundle`) guard `codes.length > 0` before
  // calling this. The fallback handles the maintenance-trap case where a
  // future McpErrorCode gets added without an entry in the `ordered` list —
  // we surface the first observed code rather than silently returning
  // `undefined`-typed-as-McpErrorCode.
  const fallback = codes[0];
  if (fallback === undefined) {
    throw new Error('pickWorstCode: codes array must be non-empty');
  }
  return ordered.find((c) => codes.includes(c)) ?? fallback;
}

function writeRenderedSkill(
  rendered: Awaited<ReturnType<typeof renderSkill>>,
  options: {
    outDir: string;
    installTargets: readonly string[];
    skillDir: string;
  }
): void {
  try {
    writeSkills([rendered], {
      outDir: options.outDir,
      installTargets: options.installTargets
    });
  } catch (error) {
    throw toLocalIoError(`Failed to write skill to ${options.skillDir}`, error);
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
    throw toLocalIoError('Failed to install bundled MCP guidance', error);
  }
}

function toLocalIoError(message: string, error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }
  return new McpError(`${message}: ${messageOf(error)}`, 'LOCAL_IO_FAILED', error);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertNoExistingSkillDirectories(options: {
  outDir: string;
  installTargets: readonly string[];
  dirNames: readonly string[];
  includeOutDir?: boolean;
  allowExistingBundledGuidance?: boolean;
  force?: boolean;
}): void {
  if (options.force) return;
  const roots = collectWriteRoots(
    options.outDir,
    options.installTargets,
    options.includeOutDir !== false
  );
  for (const root of roots) {
    for (const dirName of options.dirNames) {
      const skillDir = join(root, dirName);
      if (existsSync(skillDir)) {
        if (
          options.allowExistingBundledGuidance === true &&
          dirName === BUNDLED_MCP_GUIDANCE_NAME &&
          isManagedBundledGuidanceDirectory(skillDir)
        ) {
          continue;
        }
        throw new McpError(
          `Output directory already exists: ${skillDir}. Pass --force to overwrite.`,
          'DUPLICATE_SKILL_NAME'
        );
      }
    }
  }
}

function isManagedBundledGuidanceDirectory(skillDir: string): boolean {
  try {
    const metadata = readInstalledSkillMetadata(skillDir);
    return metadata?.curated === true || metadata?.bundledGuidance === true;
  } catch (error) {
    throw new McpError(
      `Failed to inspect installed SKILL.md at ${join(skillDir, 'SKILL.md')}: ${messageOf(error)}`,
      'LOCAL_IO_FAILED',
      error
    );
  }
}

function collectWriteRoots(
  outDir: string,
  installTargets: readonly string[],
  includeOutDir: boolean
): string[] {
  const roots = [
    ...(includeOutDir ? [path.resolve(outDir)] : []),
    ...installTargets.map((target) => path.resolve(target))
  ];
  return [...new Set(roots)];
}

/**
 * Compute the per-target output directory name. Single-target runs keep the
 * canonical `<skillName>` shape; multi-target runs append a `-<targetSuffix>`
 * disambiguator (FR-IT-009). `targetSuffix` is the literal `target` string
 * with `:` replaced by `-` (so `cli:mcpc` → `mcpc`, `mcp-protocol` stays
 * `mcp-protocol`).
 */
function dirNameForTarget(
  skillName: string,
  adapter: InvocationAdapter,
  totalTargets: number
): string {
  if (totalTargets <= 1) return skillName;
  const suffix = adapter.target.replace(/:/g, '-');
  return `${skillName}-${suffix}`;
}

/**
 * Eagerly resolve every requested target before any extract spawn.
 * Wraps `loadAdapterAsync` errors with a hint enumerating the installed
 * adapters so the user can fix `--invocation` typos and missing-package
 * issues without consulting the docs.
 */
/**
 * Pattern that valid invocation-target strings must match. Matches the same
 * regex used by `bundle/config.ts::INVOCATION_TARGET_PATTERN` so the CLI
 * `--invocation` path rejects the same shapes as the bundle-config path.
 *
 * Accepted: `mcp-protocol`, `cli:mcpc`, `cli:my-tool`. Rejected: `cli:`,
 * `CLI:upper`, `cli:has spaces`, bare names without the `cli:` prefix.
 */
const INVOCATION_TARGET_PATTERN = /^(mcp-protocol|cli:[a-z0-9][a-z0-9-]*)$/;

async function validateTargets(targets: readonly InvocationTarget[]): Promise<InvocationAdapter[]> {
  const adapters: InvocationAdapter[] = [];
  let installedHint: string | undefined;
  for (const t of targets) {
    if (!INVOCATION_TARGET_PATTERN.test(t)) {
      installedHint ??= await formatInstalledAdaptersHint();
      throw new McpError(
        `Invalid invocation target "${t}" — expected "mcp-protocol" or "cli:<kebab-name>".\n\n${installedHint}`,
        'UNKNOWN_TARGET'
      );
    }
    try {
      adapters.push(await loadAdapterAsync(t));
    } catch (err) {
      if (
        err instanceof McpError &&
        (err.code === 'UNKNOWN_TARGET' || err.code === 'ADAPTER_NOT_FOUND')
      ) {
        // Compute the installed-adapter hint lazily — it's only needed on
        // failure, and probing every candidate target costs a require() each.
        installedHint ??= await formatInstalledAdaptersHint();
        throw new McpError(`${err.message}\n\n${installedHint}`, err.code, err);
      }
      throw err;
    }
  }
  return adapters;
}

/**
 * Probe each known target package and return a human-readable hint listing
 * the resolvable ones plus an install-pointer for the rest.
 *
 * The known-target list is hardcoded — for now we only ship `mcp-protocol`,
 * `cli:mcpc`, `cli:fastmcp`. Third-party adapters that follow the
 * `to-skills-target-<name>` naming convention won't appear in this hint, but
 * they remain loadable.
 */
async function formatInstalledAdaptersHint(): Promise<string> {
  const known: InvocationTarget[] = ['mcp-protocol', 'cli:mcpc', 'cli:fastmcp'];
  const installed: string[] = [];
  const corrupted: string[] = [];
  for (const t of known) {
    try {
      await loadAdapterAsync(t);
      installed.push(t);
    } catch (err) {
      // Distinguish "not installed" (ADAPTER_NOT_FOUND) from "installed but
      // broken" (any other McpError or thrown error from the package itself).
      // Lumping them together produced misleading "(none)" hints when the
      // adapter was actually present but had a syntax error or missing default
      // export — exactly the moment the user is trying to debug.
      const code = err instanceof McpError ? err.code : undefined;
      if (code === 'ADAPTER_NOT_FOUND' || code === 'UNKNOWN_TARGET') continue;
      corrupted.push(t);
      // Surface the underlying message under DEBUG so the user has a breadcrumb.
      if (process.env['DEBUG']) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[to-skills-mcp DEBUG] adapter ${t} probe failed: ${msg}\n`);
      }
    }
  }
  const installedLine = `Installed adapters: ${installed.length > 0 ? installed.join(', ') : '(none)'}`;
  const corruptedLine =
    corrupted.length > 0
      ? `\nAdapters present but failed to load (set DEBUG=1 for detail): ${corrupted.join(', ')}`
      : '';
  return (
    `${installedLine}${corruptedLine}\n` +
    `To install a missing adapter: npm install @skillit/target-<name>`
  );
}

/** Parsed `bundle` subcommand options as produced by commander. @internal */
interface BundleOpts {
  packageRoot?: string;
  out?: string;
  installTarget: string[];
  maxTokens: number;
  llmsTxt?: boolean;
  force?: boolean;
  skipAudit?: boolean;
  canonicalize: boolean;
  invocation: string[];
}

/**
 * `bundle` action body. Reads `to-skills.mcp` from the host package, performs
 * a pre-flight collision check (so --force semantics fire BEFORE writeSkills
 * does an unconditional rmSync on each destination), then runs
 * `bundleMcpSkill` and surfaces per-skill stdout / per-failure stderr lines.
 *
 * Throws `McpError` when any entry failed so `bin.ts` maps to a non-zero exit.
 * The chosen code follows a stable hierarchy
 * (DUPLICATE_SKILL_NAME → MISSING_LAUNCH_COMMAND → INITIALIZE_FAILED →
 *  TRANSPORT_FAILED) so multi-failure runs converge on a deterministic code.
 *
 * @internal
 */
async function runBundle(opts: BundleOpts): Promise<void> {
  const packageRoot = path.resolve(opts.packageRoot ?? process.cwd());
  const outDir = opts.out !== undefined ? path.resolve(packageRoot, opts.out) : undefined;

  // Notices for not-yet-wired flags — mirrors the stdio extract pattern so
  // users get explicit feedback rather than silent acceptance.
  if (!opts.canonicalize) {
    process.stderr.write(
      '[to-skills-mcp] --no-canonicalize is not yet wired; canonicalization currently always runs.\n'
    );
  }
  // --max-tokens is parsed for forward-compatibility but not yet threaded into
  // McpBundleOptions (no maxTokens field there). Notice the user only when
  // they explicitly chose a non-default value, so the default 4000 stays quiet.
  if (opts.maxTokens !== 4000) {
    process.stderr.write(
      '[to-skills-mcp] --max-tokens is not yet threaded into bundle mode; value ignored.\n'
    );
  }

  // Eager target validation — when the user supplied global
  // `--invocation` overrides, resolve every adapter NOW so a typo exits 5
  // before we read package.json or spawn anything. Per-entry targets (in the
  // package.json invocation field) get validated by bundle.ts inside the
  // multi-target loop.
  if (opts.invocation.length > 0) {
    await validateTargets(opts.invocation as InvocationTarget[]);
  }

  // Pre-flight DUPLICATE_SKILL_NAME check. bundleMcpSkill → writeSkills will
  // rmSync the destination unconditionally; that's fine when the user opted
  // in via --force, but otherwise we should bail before any extract spawns.
  // We import readBundleConfig from the internal config module to avoid
  // re-parsing package.json ourselves.
  const entries = await readBundleConfig(packageRoot);
  const resolvedOutDir = outDir ?? path.join(packageRoot, 'skills');
  if (!opts.force) {
    // Compute the effective per-entry targets so the pre-flight collision
    // check covers the same disambiguated directory names that bundle.ts
    // will write to. Global `--invocation` (when set) overrides per-entry.
    const overrideTargets =
      opts.invocation.length > 0 ? (opts.invocation as InvocationTarget[]) : undefined;
    for (const entry of entries) {
      const effective = overrideTargets ?? entry.invocation;
      assertNoExistingSkillDirectories({
        outDir: resolvedOutDir,
        installTargets: opts.installTarget,
        dirNames: effective.map((target) =>
          effective.length > 1 ? `${entry.skillName}-${target.replace(/:/g, '-')}` : entry.skillName
        )
      });
    }
    if (opts.installTarget.length > 0) {
      assertNoExistingSkillDirectories({
        outDir: resolvedOutDir,
        installTargets: opts.installTarget,
        dirNames: [BUNDLED_MCP_GUIDANCE_NAME],
        includeOutDir: false,
        allowExistingBundledGuidance: true
      });
    }
  }

  const bundleOptions: McpBundleOptions = {
    packageRoot,
    ...(outDir !== undefined ? { outDir } : {}),
    ...(opts.installTarget.length > 0 ? { installTargets: opts.installTarget } : {}),
    ...(opts.invocation.length > 0 ? { invocation: opts.invocation as InvocationTarget[] } : {}),
    ...(opts.skipAudit === true ? { skipAudit: true } : {}),
    ...(opts.llmsTxt === true ? { llmsTxt: true } : {})
  };

  const result = await bundleMcpSkill(bundleOptions);

  // Stdout: one success line per written skill.
  for (const skill of Object.values(result.skills)) {
    const refCount = Math.max(0, skill.files.length - 1);
    process.stdout.write(`Wrote ${skill.dir}/SKILL.md (${refCount} references)\n`);
  }
  // Stderr: one line per failure. Files-field warnings were already emitted
  // by bundleMcpSkill — we don't re-emit.
  for (const [name, failure] of Object.entries(result.failures)) {
    process.stderr.write(`Failed [${failure.code}] ${name}: ${failure.message}\n`);
  }

  // Exit-code policy: when ≥1 entries failed, throw with the worst code so
  // bin.ts maps to a non-zero exit. Hierarchy below is intentional — when
  // multiple entries fail with different codes, we surface the
  // most-actionable one first (config issues over transport blips).
  const codes = Object.values(result.failures).map((f) => f.code);
  if (codes.length > 0) {
    // Worst-code hierarchy lives in `pickWorstCode` so config-mode and
    // bundle-mode converge on the same exit code for overlapping failure
    // sets — see the helper's JSDoc for the ordering rationale.
    const worst = pickWorstCode(codes);
    throw new McpError(
      `bundle: ${codes.length} ${codes.length === 1 ? 'entry' : 'entries'} failed. See stderr above.`,
      worst
    );
  }
}
