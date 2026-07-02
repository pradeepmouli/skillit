import type { ExtractedConfigSurface } from './config-types.js';

/**
 * Structured representation of key sections extracted from a package README.
 */
export interface ParsedReadme {
  /** Leading blockquote, often used as a one-liner summary */
  blockquote?: string;
  /** First prose paragraph after any heading or blockquote */
  firstParagraph?: string;
  /** Quick-start or getting-started section content */
  quickStart?: string;
  /** Features or capabilities section content */
  features?: string;
  /** Troubleshooting, common issues, or FAQ section content */
  troubleshooting?: string;
}

/** A cross-reference to a skill bundled inside a direct dependency. */
export interface DepSkillRef {
  /** Skill name from the dep's SKILL.md frontmatter `name:` field. */
  name: string;
  /** Agent-loadable path relative to the consuming project root (e.g. `node_modules/@lspeasy/core/skills/lspeasy-core`). */
  path: string;
  /** Description from the dep's SKILL.md frontmatter `description:` field, if present. */
  description?: string;
}

/** Extracted API surface for a single package/module */
export interface ExtractedSkill {
  /** Package or module name */
  name: string;
  /** Package description */
  description: string;
  /** License identifier (e.g. "MIT", "Apache-2.0") */
  license?: string;
  /** Keywords from package.json — used to enrich trigger descriptions */
  keywords?: string[];
  /** Repository URL */
  repository?: string;
  /** Author name */
  author?: string;
  /** Package description from package.json or README intro — used for SKILL.md description and body */
  packageDescription?: string;
  /** Extended remarks from @packageDocumentation @remarks — architectural context, trade-offs, mental models */
  remarks?: string;
  /** Additional documentation content (from projectDocuments, README, etc.) */
  documents?: ExtractedDocument[];
  /** Exported functions */
  functions: ExtractedFunction[];
  /** Exported classes */
  classes: ExtractedClass[];
  /** Exported interfaces and type aliases */
  types: ExtractedType[];
  /** Exported enums */
  enums: ExtractedEnum[];
  /** Exported variables and constants */
  variables: ExtractedVariable[];
  /** Usage examples from @example tags or doc pages */
  examples: string[];
  /** Aggregated @useWhen triggers from all exports */
  useWhen?: string[];
  /** Aggregated @useWhen with source info for decision tables */
  useWhenSources?: Array<{
    text: string;
    sourceName: string;
    sourceKind: string;
    sourceDescription?: string;
  }>;
  /** Aggregated @avoidWhen triggers from all exports */
  avoidWhen?: string[];
  /** Aggregated @avoidWhen with source info for decision tables */
  avoidWhenSources?: Array<{
    text: string;
    sourceName: string;
    sourceKind: string;
    sourceDescription?: string;
  }>;
  /** Aggregated @never from all exports */
  pitfalls?: string[];
  /** Configuration surfaces (CLI commands, config files) */
  configSurfaces?: ExtractedConfigSurface[];
  /** Features section from README — rendered inline in SKILL.md */
  readmeFeatures?: string;
  /** Troubleshooting section from README — rendered inline in SKILL.md */
  readmeTroubleshooting?: string;
  /**
   * Parsed README sections (blockquote, first paragraph, features,
   * troubleshooting, quick-start). The single source of project narrative
   * metadata — the audit reads this directly; no separate AuditContext.
   */
  readme?: ParsedReadme;
  /**
   * Invocation prefix for CLI command examples, e.g. `npx @scope/pkg`.
   * When set, command usage blocks are prefixed with this string.
   * Absent for non-CLI extractors or when the package is installed globally.
   */
  cliInvocationPrefix?: string;
  /** MCP resources (empty/absent for non-MCP extractors). */
  resources?: ExtractedResource[];
  /** MCP prompts (empty/absent for non-MCP extractors). */
  prompts?: ExtractedPrompt[];
  /** Setup instructions emitted when the invocation target is CLI-based. */
  setup?: SkillSetup;
  /** Skills from direct dependencies cross-referenced in ## See Also. */
  seeAlso?: DepSkillRef[];
  /** Absolute path to the package root — used by audit for dep-skill discovery. */
  rootDir?: string;
  /**
   * Structured audit execution state for extractors that run an audit pipeline.
   *
   * `undefined` means the extractor does not populate audit state. Use this
   * field when callers need to distinguish "audit skipped" from "audit ran
   * clean" without relying on optional-array semantics.
   */
  readonly audit?: ExtractedSkillAudit;
  /**
   * Structured audit findings surfaced for backward compatibility.
   *
   * Tri-state semantics:
   * - `undefined` — audit was skipped or this extractor does not populate
   *   compatibility findings.
   * - `[]` — audit ran and found no issues.
   * - `[…]` — audit ran and found issues. Length and `severity` distribution
   *   are the gate criteria for CI.
   *
   * @remarks
   * The element shape (`McpAuditIssue`) is forward-declared here in
   * `@skillit/core` so this field is typeable without a runtime dependency
   * on `@skillit/mcp`. The concrete audit engine lives in `@skillit/mcp`,
   * which re-exports the type as `AuditIssue` for adapter-author ergonomics.
   *
   * @deprecated Prefer `audit`. When present, this mirrors
   * `audit.status === 'completed' ? audit.issues : undefined`.
   */
  readonly auditIssues?: readonly McpAuditIssue[];
}

// NOTE: Forward-declared for backward-compatible extension point.
// The concrete audit engine lives in @skillit/mcp; core has no runtime
// dependency on it. Core owns the structural contract; @skillit/mcp
// re-exports as `AuditIssue` / `AuditSeverity` for ergonomics.
//
// The names are prefixed with `Mcp` here to avoid a collision with the
// pre-existing skill-level `AuditIssue` exported from `audit-types.ts`,
// which has a different shape (file/line/symbol/suggestion). Both are
// re-exported from `@skillit/core` under their respective names.
/** Audit severity levels for structured extractor findings. */
export type McpAuditSeverity = 'fatal' | 'error' | 'warning' | 'alert';

export type ExtractedSkillAudit =
  | {
      readonly status: 'skipped';
    }
  | {
      readonly status: 'completed';
      readonly issues: readonly McpAuditIssue[];
    };

/**
 * Structural shape of an extractor audit issue. Historically this matched the
 * MCP package's `AuditIssue`, and the name is retained for compatibility, but
 * other extractors may also populate `ExtractedSkill.auditIssues` using this
 * shared structural contract.
 */
export interface McpAuditIssue {
  /** Pipeline-specific finding code such as M1 or C4. */
  readonly code: `${string}${number}`;
  /** Severity level. */
  readonly severity: McpAuditSeverity;
  /** Human-readable description of the finding. */
  readonly message: string;
  /** Where the issue was found. Fields vary by extractor. */
  readonly location?: {
    readonly tool?: string;
    readonly parameter?: string;
    readonly command?: string;
    readonly option?: string;
    readonly argument?: string;
  };
  /** Actionable next step or concrete remediation hint. */
  readonly suggestion?: string;
}

/** An MCP-exposed resource (static or templated URI, readable by the agent harness). */
export interface ExtractedResource {
  /** Canonical URI. MAY contain URI Template expressions per RFC 6570 for parameterized resources. */
  uri: string;
  /** Short human-readable name */
  name: string;
  /** Prose description (single paragraph) */
  description: string;
  /** MIME type of the resource content. Optional — not all servers advertise it. */
  mimeType?: string;
  /** Source module for grouping (rarely meaningful for resources; present for IR parity). */
  sourceModule?: string;
}

/** An MCP-exposed prompt (a named, argument-templated prompt the agent may request). */
export interface ExtractedPrompt {
  /** Short identifier used by MCP `prompts/get` requests. */
  name: string;
  /** Prose description of what the prompt produces. */
  description: string;
  /** Typed argument schema (may be empty). */
  arguments: ExtractedPromptArgument[];
  /** Present for IR parity with functions/classes; rarely meaningful for prompts. */
  sourceModule?: string;
}

export interface ExtractedPromptArgument {
  name: string;
  description: string;
  /**
   * Whether the argument is mandatory on `prompts/get` invocation.
   * MCP prompt arguments are strings in the current spec; a typed `type` field
   * may be added in a future revision without breaking callers.
   */
  required: boolean;
}

/** Setup instructions emitted into SKILL.md body when the invocation target is CLI-based. */
export interface SkillSetup {
  /** Human-prose install instructions (markdown-safe). */
  install: string;
  /** One-time configuration step the consumer must run (e.g. `mcpc connect @server`). */
  oneTimeSetup?: string;
  /** Adapter fingerprint for freshness checks (per FR-IT-012). */
  generatedBy: AdapterFingerprint;
}

/** Identifies the adapter that rendered a skill — used for freshness audits. */
export interface AdapterFingerprint {
  /** npm package name of the adapter (e.g. "@skillit/target-mcpc") */
  adapter: string;
  /** Adapter package semver version */
  version: string;
  /** Semver range of the target CLI the adapter was written against (e.g. "mcpc@^2.1") */
  targetCliRange?: string;
}

export interface ExtractedFunction {
  name: string;
  description: string;
  signature: string;
  parameters: ExtractedParameter[];
  returnType: string;
  /** Prose description from @returns JSDoc tag */
  returnsDescription?: string;
  /** Extended description from @remarks tag — expert knowledge beyond summary */
  remarks?: string;
  examples: string[];
  tags: Record<string, string>;
  /** MCP-specific metadata used by MCP audit/enrichment without magic tag keys. */
  mcpMetadata?: ExtractedFunctionMcpMetadata;
  /** Additional overload signatures (if function has multiple signatures) */
  overloads?: string[];
  /** Source module name derived from file path (e.g. "renderer", "tokens") */
  sourceModule?: string;
  /** Category for grouping (from @category tag) */
  category?: string;
}

export interface ExtractedClass {
  name: string;
  description: string;
  constructorSignature: string;
  methods: ExtractedFunction[];
  properties: ExtractedProperty[];
  examples: string[];
  /** JSDoc block tags (e.g. @deprecated, @since, @useWhen, @never) */
  tags: Record<string, string>;
  /** Base class name (from `extends`) */
  extends?: string;
  /** Implemented interface names (from `implements`) */
  implements?: string[];
  /** Source module name derived from file path (e.g. "renderer", "tokens") */
  sourceModule?: string;
  /** Category for grouping (from @category tag) */
  category?: string;
}

export interface ExtractedType {
  name: string;
  description: string;
  definition: string;
  properties?: ExtractedProperty[];
  /** Source module name derived from file path (e.g. "renderer", "tokens") */
  sourceModule?: string;
  /** Category for grouping (from @category tag) */
  category?: string;
}

export interface ExtractedEnum {
  name: string;
  description: string;
  members: Array<{ name: string; value: string; description: string }>;
  /** Source module name derived from file path (e.g. "renderer", "tokens") */
  sourceModule?: string;
  /** Category for grouping (from @category tag) */
  category?: string;
}

export interface ExtractedVariable {
  name: string;
  type: string;
  description: string;
  isConst: boolean;
  /** Source module name derived from file path (e.g. "renderer", "tokens") */
  sourceModule?: string;
  /** Category for grouping (from @category tag) */
  category?: string;
}

export interface ExtractedParameter {
  name: string;
  type: string;
  description: string;
  optional: boolean;
  defaultValue?: string;
}

export interface ExtractedFunctionMcpMetadata {
  /** Structured metadata extracted from flat `_meta` MCP tool annotations. */
  readonly skillit?: {
    readonly useWhen?: readonly string[];
    readonly avoidWhen?: readonly string[];
    readonly pitfalls?: readonly string[];
    readonly malformedReason?: string;
  };
  /** Schema-introspection failures that MCP audit rules should surface. */
  readonly schemaError?: {
    readonly kind: 'ref-cycle';
  };
}

export interface ExtractedProperty {
  name: string;
  type: string;
  description: string;
  optional: boolean;
}

export interface ExtractedDocument {
  /** Document title */
  title: string;
  /** Document content (markdown) */
  content: string;
  /** Category from frontmatter — used to disambiguate duplicate titles and organize into subdirs */
  category?: string;
  /** Frontmatter description — used for category summaries in SKILL.md */
  description?: string;
  /** True when this doc has children (is a parent/overview doc) */
  isParent?: boolean;
  /** API class/type names from {@link} tags in "## API reference" sections — enables bidirectional linking */
  apiRefs?: string[];
}

/** A single rendered file */
export interface RenderedFile {
  /** File path relative to output dir */
  filename: string;
  /** File content */
  content: string;
  /** Estimated token count */
  tokens?: number;
}

/** A rendered skill with progressive disclosure structure */
export interface RenderedSkill {
  /** The SKILL.md discovery file (lean — frontmatter, overview, quick ref) */
  skill: RenderedFile;
  /** Reference files loaded on demand (functions, classes, types, etc.) */
  references: RenderedFile[];
}

export type RefCategory =
  | 'functions'
  | 'classes'
  | 'types'
  | 'variables'
  | 'commands'
  | 'config'
  | 'docs'
  | 'resources'
  | 'prompts'
  | 'examples';

export interface RefManifestEntry {
  /** Relative path surfaced from SKILL.md loading triggers. */
  path: `references/${string}`;
  /** Whether the trigger points at a single file or a directory index. */
  mode: 'file' | 'directory';
}

export type RefManifest = Partial<Record<RefCategory, RefManifestEntry>>;

/** @deprecated Use RenderedFile instead */
export type RenderedSkillLegacy = RenderedFile;

/** Options controlling skill file writes after rendering. */
export interface SkillWriteOptions {
  /** Primary output directory for rendered skills. */
  outDir: string;
  /** Additional install targets that receive copied skill directories. */
  installTargets?: readonly string[];
  /**
   * Whether to write into `outDir` as well as install targets.
   *
   * Callers that want install-target-only writes (for example bundled
   * guidance that should not appear in the primary generated output) set this
   * to `false`. Defaults to `true`.
   */
  includeOutDir?: boolean;
}

export type SkillWritePreserveReason =
  | 'curated'
  | 'bundled-custom-skill'
  | 'bundled-name-mismatch'
  | 'bundled-missing-version'
  | 'bundled-same-version'
  | 'bundled-newer-version';

export interface SkillWriteResult {
  /** Root directory that was evaluated for this write. */
  readonly root: string;
  /** Whether the result applies to the primary outDir or an install target. */
  readonly rootKind: 'outDir' | 'installTarget';
  /** Relative skill directory name (for example `demo-skill`). */
  readonly skillName: string;
  /** Whether the skill was written or intentionally preserved. */
  readonly action: 'written' | 'preserved';
  /** Preserve reason when `action === "preserved"`. */
  readonly preserveReason?: SkillWritePreserveReason;
}

/** Options controlling skill rendering */
export interface SkillRenderOptions {
  /** Output directory for skill files (default: ".github/skills") */
  outDir: string;
  /** Include usage examples (default: true) */
  includeExamples: boolean;
  /** Include type signatures (default: true) */
  includeSignatures: boolean;
  /** Maximum approximate token budget per skill (default: 4000) */
  maxTokens: number;
  /** Custom name prefix */
  namePrefix: string;
  /** License to include in frontmatter (default: read from package.json) */
  license: string;
  /** Invocation adapter that selects rendering dialect. Defaults to the mcp-protocol adapter. */
  invocation?: InvocationAdapter;
  /**
   * Forwarded into `AdapterRenderContext.launchCommand` for invocation adapters.
   * Used in extract mode where the host has determined how to launch a third-party
   * MCP server (e.g. via stdio transport configuration). Mutually informative with
   * `invocationPackageName`: when both are set, adapters typically prefer the
   * package-name-driven launch (npx-by-name) for self-referential bundle output.
   */
  invocationLaunchCommand?: {
    command: string;
    args?: readonly string[];
    env?: Readonly<Record<string, string>>;
  };
  /**
   * Forwarded into `AdapterRenderContext.packageName` for bundle-mode self-reference.
   * Set by `@skillit/mcp` bundle commands so the emitted skill instructs MCP-native
   * harnesses to launch the server via `npx <packageName>`.
   */
  invocationPackageName?: string;
  /**
   * Forwarded into `AdapterRenderContext.binName` for bundle-mode multi-bin
   * packages. When the host package's `bin` field is an object with multiple
   * entries and the bundle config selects one, the adapter emits the npx
   * `--package=<pkg> <binName>` form so the right bin is invoked at run time
   * (FR-034). Ignored when `invocationPackageName` is unset.
   */
  invocationBinName?: string;
  /**
   * Forwarded into `AdapterRenderContext.httpEndpoint` for HTTP-transport extract mode.
   *
   * @remarks
   * When the host extracts a skill from an HTTP-based MCP server (`--url ...`),
   * there is no shell launch command — adapters should emit a `{ url, headers }`
   * shape instead of `{ command, args, env }`. Set by `@skillit/mcp`'s extract
   * pipeline. Mutually exclusive with `invocationLaunchCommand` in practice; the
   * MCP adapter prefers `httpEndpoint` when both are present.
   */
  invocationHttpEndpoint?: {
    url: string;
    headers?: Readonly<Record<string, string>>;
  };
  /**
   * Additional frontmatter keys merged into SKILL.md by the default renderer path.
   *
   * @remarks
   * Used by invocation adapters that delegate body rendering to core's default
   * path (e.g. `McpProtocolAdapter` injecting `mcp:` frontmatter). Existing keys
   * (`name`, `description`, `license`) take precedence — collisions silently keep
   * the existing value. The canonicalization pass alphabetizes keys after merge.
   */
  additionalFrontmatter?: Readonly<Record<string, unknown>>;
  /**
   * Markdown content injected into the SKILL.md body immediately AFTER the
   * frontmatter delimiter and BEFORE the first heading.
   *
   * @remarks
   * CLI-as-proxy invocation adapters (`@skillit/target-mcpc`,
   * `@skillit/target-fastmcp`) use this to inject a Setup section that
   * tells the consumer how to install/connect the underlying CLI. The string
   * is inserted verbatim — callers are responsible for formatting and
   * trailing newlines. Defaults to empty (no prefix injected).
   */
  bodyPrefix?: string;
  /**
   * When `true`, the default renderer path skips emission of
   * `references/functions.md`. CLI-as-proxy adapters set this so they can
   * emit their own `references/tools.md` carrying command-shape rows
   * instead of TypeScript signatures. Defaults to `false`.
   */
  skipDefaultFunctionsRef?: boolean;
  /**
   * When `false`, the default renderer path returns its `RenderedSkill`
   * without running the trailing canonicalization pass. Adapters that wrap
   * `renderSkill` for body rendering and then mutate `references` (e.g.
   * `@skillit/target-mcpc` appending its own `tools.md`) pass `false` here
   * so canonicalization runs exactly once — at the host's outer wrapper —
   * over the final shape including the appended files. Defaults to `true`.
   *
   * Has no effect on the invocation-adapter dispatch path (which always
   * canonicalizes the adapter's output at the host wrapper).
   */
  canonicalize?: boolean;
}

// NOTE: Forward-declared for backward-compatible extension point.
// The concrete adapter lives in @skillit/mcp; core has no runtime dependency on it.
// Core owns the structural contract; @skillit/mcp will re-export for ergonomics.
/**
 * Pluggable rendering strategy — selects the SKILL.md dialect emitted for an `ExtractedSkill`.
 *
 * Built-in implementations (shipped from `@skillit/mcp`'s target packages) include
 * `mcp-protocol` (emits `mcp:` frontmatter for MCP-native agent harnesses) and
 * `cli:*` targets (emit shell-command skills that route through an external MCP CLI).
 */
export interface InvocationAdapter {
  readonly target: string;
  readonly fingerprint: AdapterFingerprint;
  render(skill: ExtractedSkill, ctx: AdapterRenderContext): Promise<RenderedSkill>;
}

/**
 * Fields shared by every arm of {@link AdapterRenderContext}. Adapters can
 * destructure these without first checking `mode`.
 */
export interface AdapterRenderContextBase {
  /** Output directory name chosen by the caller (e.g. "filesystem", "my-server"). */
  readonly skillName: string;
  /** Token budget ceiling per reference file — adapters should stay under this but the host will truncate if exceeded. */
  readonly maxTokens: number;
  /** When `true` (default), the host runs a canonicalization pass on the adapter's output so re-runs produce content-identical files. */
  readonly canonicalize: boolean;
}

/**
 * Bundle-mode arm — the host bundle command flagged this skill as self-referential
 * and the adapter should emit `npx <packageName>` (or the multi-bin
 * `--package=<packageName> <binName>` form per FR-034) as the launch shape.
 */
export interface AdapterRenderContextBundle extends AdapterRenderContextBase {
  readonly mode: 'bundle';
  /** Bundle-mode self-reference — the package name the emitted skill should invoke via `npx`. */
  readonly packageName: string;
  /**
   * Bundle-mode multi-bin selector — when set, the adapter emits the npx
   * `--package=<packageName> <binName>` form (FR-034) so the right bin is
   * invoked at run time. Optional; defaults to the package's single-bin
   * default when omitted.
   */
  readonly binName?: string;
}

/**
 * HTTP-extract arm — the host extracted the skill from an HTTP-based MCP
 * server (`--url ...`). There is no shell launch command; adapters that emit
 * MCP-launch frontmatter must produce a `{ url, headers }` shape.
 */
export interface AdapterRenderContextHttp extends AdapterRenderContextBase {
  readonly mode: 'http';
  readonly httpEndpoint: {
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
  };
}

/**
 * Stdio-extract arm — the host extracted the skill from a stdio-transport MCP
 * server. Adapters that emit MCP-launch frontmatter use the `{ command, args,
 * env }` shape verbatim.
 */
export interface AdapterRenderContextStdio extends AdapterRenderContextBase {
  readonly mode: 'stdio';
  readonly launchCommand: {
    readonly command: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
  };
}

/**
 * Discriminated union over `mode` — encodes the "exactly one of
 * packageName | httpEndpoint | launchCommand" invariant at compile time.
 *
 * Adapters narrow on `ctx.mode` via `switch` (with an exhaustive default).
 * Constructing two arms simultaneously is rejected by TypeScript's
 * excess-property checker on object literals; the renderer's invocation-adapter
 * dispatch enforces the same invariant at runtime for non-literal callers.
 */
export type AdapterRenderContext =
  | AdapterRenderContextBundle
  | AdapterRenderContextHttp
  | AdapterRenderContextStdio;
