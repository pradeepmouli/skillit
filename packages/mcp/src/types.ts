import type { McpAuditIssue, McpAuditSeverity } from '@skillit/core';
import type { InvocationTarget } from './adapter/types.js';

export type McpTransport =
  | {
      type: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
      /**
       * Maximum time (ms) to wait for `client.connect()` (the MCP `initialize`
       * handshake) before failing with `INITIALIZE_FAILED`.
       *
       * Defaults to `30000` (30 s). Set to `0` (or any non-positive number) to
       * disable the timeout entirely — useful when a caller explicitly opts
       * into waiting indefinitely (e.g. an interactive session attached to a
       * known-slow server).
       *
       * Without a timeout, a server that accepts the spawn but never completes
       * the handshake (e.g. blocked on a sync call, deadlocked init code) hangs
       * the extract process forever; the default 30 s ceiling preserves user
       * sanity at the cost of a hard failure on legitimately-slow servers
       * (callers can opt out via `initializeTimeoutMs: 0`).
       */
      initializeTimeoutMs?: number;
    }
  | { type: 'http'; url: string; headers?: Record<string, string> };

export interface AuditOptions {
  /** Skip audit entirely (for CI bypass). */
  skip?: boolean;
  /**
   * Reserved for programmatic callers that want to turn completed audit
   * findings into a hard failure after `extractMcpSkill()` returns.
   *
   * The CLI currently handles fail-on-error at the bundle/orchestration layer
   * instead of consulting this field directly.
   */
  failOnError?: boolean;
  /**
   * When `true`, audit-rule findings of severity `'alert'` (Rule M4 — generic
   * tool names) are also emitted to stderr at extract time. Default `false`
   * keeps the stderr terse for healthy servers; opt in when investigating
   * naming hygiene. Has no effect at bundle time, where alerts are always
   * recorded on `WrittenSkill.audit` regardless of this flag.
   */
  includeAlerts?: boolean;
}

export interface McpExtractOptions {
  /** Transport selection (stdio or HTTP). */
  transport: McpTransport;
  /** Skill name override — defaults to server's serverInfo.name. */
  skillName?: string;
  /** Maximum tokens per reference file (default 4000). */
  maxTokens?: number;
  /** Audit behavior (see AuditOptions). */
  audit?: AuditOptions;
  /**
   * Invocation target(s).
   *
   * @internal Reserved for a future programmatic API. **Currently unused** by
   *   `extractMcpSkill` — pass invocation adapter(s) to `renderSkill` instead
   *   (the CLI does this in its multi-target loop). The field is retained on
   *   the option type for forward compatibility.
   */
  invocation?: InvocationTarget | InvocationTarget[];
  /**
   * Emit llms.txt alongside the skill directory.
   *
   * @internal Reserved for a future programmatic API. **Currently unused** by
   *   `extractMcpSkill` — the CLI emits llms.txt at write time via the
   *   `--llms-txt` flag, after rendering. Library consumers should call
   *   `renderLlmsTxt(rendered, skill)` themselves.
   */
  llmsTxt?: boolean;
  /**
   * Emit canonicalized content-identical output (default true).
   *
   * @internal Reserved for a future programmatic API. **Currently unused** by
   *   `extractMcpSkill` — canonicalization runs unconditionally inside
   *   `renderSkill` and is controlled there via `SkillRenderOptions.canonicalize`.
   */
  canonicalize?: boolean;
  /**
   * Additional agent discovery directories that should receive installed
   * copies at write time.
   *
   * `extractMcpSkill()` itself returns IR only; the CLI/orchestrators consume
   * this during their render/write phase.
   */
  installTargets?: readonly string[];
}

export interface McpBundleOptions {
  /** Package root — defaults to process.cwd(). */
  packageRoot?: string;
  /** Output directory override — defaults to <packageRoot>/skills. */
  outDir?: string;
  /**
   * Additional agent discovery directories that should receive installed
   * copies. Bundled MCP guidance is installed only into these targets, not
   * into the primary `outDir`.
   */
  installTargets?: readonly string[];
  /**
   * Invocation target(s). When set, overrides the per-entry `invocation` field
   * in `to-skills.mcp`. When omitted, each entry's declared invocation applies
   * (defaulting to `'mcp-protocol'` if the entry omits it as well).
   */
  invocation?: InvocationTarget | InvocationTarget[];
  /** Skip audit (CI bypass). */
  skipAudit?: boolean;
  /**
   * Emit `llms.txt` alongside `SKILL.md` for each generated skill directory
   * (per https://llmstxt.org/).
   */
  llmsTxt?: boolean;
}

/**
 * Audit severity levels for MCP audit findings.
 *
 * @remarks
 * Sourced from `@skillit/core` as `McpAuditSeverity` (forward-declared
 * there so `ExtractedSkill.auditIssues` is typeable from core without a
 * core→mcp dependency). Re-exported here under the familiar `AuditSeverity`
 * name so existing adapter-author imports from `@skillit/mcp` keep working.
 */
export type AuditSeverity = McpAuditSeverity;

/**
 * MCP audit finding emitted by `runMcpAudit`.
 *
 * @remarks
 * Sourced from `@skillit/core` as `McpAuditIssue` (forward-declared there
 * so `ExtractedSkill.auditIssues` is typeable from core). Re-exported here
 * under the historical `AuditIssue` name to preserve the public surface of
 * `@skillit/mcp`. Single source of truth: `McpAuditIssue` in core.
 */
export type AuditIssue = McpAuditIssue;

export interface AuditResult {
  /** Issues found, sorted by severity descending. */
  readonly issues: readonly AuditIssue[];
  /** Highest severity present, or 'none' if no issues. */
  readonly worstSeverity: AuditSeverity | 'none';
}

export interface WrittenSkill {
  /** Absolute path to the skill directory. */
  dir: string;
  /** Files written, relative to dir. */
  readonly files: readonly string[];
  /** Invocation target used. */
  target: InvocationTarget;
  /** Audit result. */
  audit: AuditResult;
}

/**
 * Per-entry failure record on {@link BundleResult.failures}. Keyed by the
 * entry's `skillName`. Bundle mode keeps successful sibling writes in
 * `skills`; the failed entry's diagnostic lands here so the CLI exit-code
 * mapper can pick the worst code without surfacing a single failure as a
 * top-level rejection.
 */
export interface BundleFailure {
  /** Stable error code for exit-code mapping. */
  code: import('./errors.js').McpErrorCode;
  /** Human-readable message — already includes context (server name, etc.). */
  message: string;
}

export interface BundleResult {
  /** One entry per (server × target) combination. Keyed by skill directory name. */
  skills: Record<string, WrittenSkill>;
  /**
   * Per-server extract/render failures. Bundle mode is batch-semantics: a
   * single server's failure is recorded here and the loop continues with the
   * remaining entries, so callers can present a partial success.
   *
   * @remarks
   * **Key shape — entry-level vs target-level.** Extract failures (server
   * never came up) are keyed by the entry's `skillName` because the failure
   * cancels every requested target for that entry; recording it once avoids
   * fanout of identical messages. Render or write failures (extraction
   * succeeded but a specific target adapter failed) are keyed by the
   * disambiguated directory name (`<skillName>-<targetSuffix>` for
   * multi-target entries, plain `<skillName>` for single-target entries),
   * matching the corresponding `skills` key shape so consumers can correlate
   * a target-level write failure to its sibling success across the result.
   *
   * The CLI maps the worst code in this map to an exit code; key shape is
   * informational only for that purpose.
   */
  failures: Record<string, BundleFailure>;
  /** Warnings about package.json `files` field — not errors. */
  packageJsonWarnings: string[];
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * A validated `mcpServers[name]` entry, with the wire-shape's optional
 * `command`/`url` collapsed into a fully-discriminated {@link McpTransport}.
 *
 * @remarks
 * This is the boundary type produced by {@link readMcpConfigFile}. Once an
 * entry has been parsed and validated, downstream code (CLI batch loop,
 * extract orchestrator) gets a `ConfigEntry` rather than the un-validated
 * {@link McpServerConfig} wire shape — the type system now guarantees the
 * one-of-two invariant that the reader enforces, so consumers no longer
 * need runtime narrowing or "defensive" branches.
 *
 * The wire-shape `McpServerConfig` remains exported for tooling that needs
 * to inspect the raw JSON shape (e.g. config-file linters), but the rest
 * of `@skillit/mcp` works with `ConfigEntry` past the file boundary.
 *
 * @public
 */
export interface ConfigEntry {
  /** The `mcpServers[name]` key from the source file. */
  readonly name: string;
  /** Fully-discriminated transport (stdio or http) — one of `command` or `url` is guaranteed present. */
  readonly transport: McpTransport;
  /** When `true`, the entry is configured but skipped at extract time. */
  readonly disabled?: boolean;
}
