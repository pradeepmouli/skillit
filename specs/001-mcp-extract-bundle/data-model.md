# Phase 1 Data Model — `@skillit/mcp`

**Date**: 2026-04-24

Types are grouped by their owning package. All type names are the canonical TypeScript names that appear in `*.d.ts` outputs.

---

## 1. Extensions to `@skillit/core`

Three additions to `packages/core/src/types.ts`. All are backward-compatible (optional fields or an optional parameter).

### 1.1 `ExtractedResource` — new

```typescript
/** An MCP-exposed resource (static or templated URI, readable by the agent harness) */
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
```

**Validation**: `uri` required and non-empty. If the URI is a template, `{…}` expressions are preserved verbatim.

### 1.2 `ExtractedPrompt` — new

```typescript
/** An MCP-exposed prompt (a named, argument-templated prompt the agent may request) */
export interface ExtractedPrompt {
  name: string;
  description: string;
  arguments: ExtractedPromptArgument[];
  sourceModule?: string;
}

export interface ExtractedPromptArgument {
  name: string;
  description: string;
  /** Prompt arguments are strings in the MCP spec; `type` is reserved for future extension. */
  required: boolean;
}
```

### 1.3 `SkillSetup` — new (used by CLI adapters only)

```typescript
/** Setup instructions emitted into SKILL.md body when the invocation target is CLI-based */
export interface SkillSetup {
  /** Human-prose install instructions (markdown-safe). */
  install: string;
  /** One-time configuration step the consumer must run (e.g., `mcpc connect @server`). */
  oneTimeSetup?: string;
  /** Adapter fingerprint for freshness checks. Per FR-IT-012. */
  generatedBy: AdapterFingerprint;
}

export interface AdapterFingerprint {
  /** npm package name of the adapter (e.g. "@skillit/target-mcpc") */
  adapter: string;
  /** Adapter package semver version */
  version: string;
  /** Semver range of the target CLI the adapter was written against (e.g. "mcpc@^2.1") */
  targetCliRange?: string;
}
```

### 1.4 `ExtractedSkill` — extended

Add three optional fields:

```typescript
export interface ExtractedSkill {
  // ...existing fields...

  /** MCP resources (empty for non-MCP extractors) */
  resources?: ExtractedResource[];

  /** MCP prompts (empty for non-MCP extractors) */
  prompts?: ExtractedPrompt[];

  /** Setup instructions emitted when invocation target is CLI-based */
  setup?: SkillSetup;
}
```

### 1.5 `SkillRenderOptions` — extended

```typescript
export interface SkillRenderOptions {
  // ...existing fields...

  /** Invocation adapter that selects rendering dialect. Defaults to the mcp-protocol adapter. */
  invocation?: InvocationAdapter;
}
```

`InvocationAdapter` is imported from `@skillit/mcp` (see §2.4). Core does NOT take a dependency on `@skillit/mcp` — the adapter type is structural, and the default render path (no adapter supplied) emits the existing TypeDoc/CLI-extractor shape.

---

## 2. New types in `@skillit/mcp`

All exported from `packages/mcp/src/index.ts`.

### 2.1 `McpExtractOptions`

```typescript
export type McpTransport =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> };

export interface McpExtractOptions {
  /** Transport selection (stdio or HTTP) */
  transport: McpTransport;
  /** Skill name override — defaults to server's serverInfo.name */
  skillName?: string;
  /** One or more invocation targets. Default: ['mcp-protocol']. */
  invocation?: InvocationTarget | InvocationTarget[];
  /** Maximum tokens per reference file (default 4000) */
  maxTokens?: number;
  /** Emit llms.txt alongside the skill directory */
  llmsTxt?: boolean;
  /** Emit canonicalized content-identical output (default true) */
  canonicalize?: boolean;
  /** Audit behavior (see AuditOptions) */
  audit?: AuditOptions;
}

export interface AuditOptions {
  /** Skip audit entirely (for CI bypass) */
  skip?: boolean;
  /** Exit non-zero on fatal/error severity when true (default: false at extract, true at bundle) */
  failOnError?: boolean;
}
```

### 2.2 `McpBundleOptions`

```typescript
export interface McpBundleOptions {
  /** Package root — defaults to process.cwd() */
  packageRoot?: string;
  /** Output directory override — defaults to <packageRoot>/skills */
  outDir?: string;
  /** Invocation target(s) — defaults to whatever's in package.json's `to-skills.mcp.invocation`,
   *  then falls back to 'mcp-protocol' */
  invocation?: InvocationTarget | InvocationTarget[];
  /** Skip audit (CI bypass) */
  skipAudit?: boolean;
}
```

### 2.3 `BundleResult`

```typescript
export interface BundleResult {
  /** One entry per (server × target) combination. Keyed by skill directory name. */
  skills: Record<string, WrittenSkill>;
  /** Warnings about package.json `files` field (FR-035) — not errors */
  packageJsonWarnings: string[];
}

export interface WrittenSkill {
  /** Absolute path to the skill directory */
  dir: string;
  /** Files written, relative to dir */
  files: string[];
  /** Invocation target used */
  target: InvocationTarget;
  /** Audit result */
  audit: AuditResult;
}

export interface AuditResult {
  /** Issues found, sorted by severity descending */
  issues: AuditIssue[];
  /** Highest severity present */
  worstSeverity: 'fatal' | 'error' | 'warning' | 'alert' | 'none';
}

export interface AuditIssue {
  /** M1-M99 for MCP audit codes (FR-040) */
  code: `M${number}`;
  severity: 'fatal' | 'error' | 'warning' | 'alert';
  message: string;
  /** Where the issue was found */
  location?: { tool?: string; parameter?: string };
}
```

### 2.4 `InvocationTarget` and `InvocationAdapter`

```typescript
/** String identifier; one of the built-in values or `cli:<name>` for third-party targets. */
export type InvocationTarget = 'mcp-protocol' | `cli:${string}`;

/** Contract third-party adapter packages implement. Default export of @skillit/target-<n>. */
export interface InvocationAdapter {
  /** Machine-readable target identifier, e.g. 'mcp-protocol' or 'cli:mcpc' */
  readonly target: InvocationTarget;

  /** Package fingerprint embedded in CLI-target skills per FR-IT-012 */
  readonly fingerprint: AdapterFingerprint;

  /**
   * Render an ExtractedSkill into the target's dialect.
   * Returns the rendered files (SKILL.md + references), ready for a filesystem writer.
   */
  render(skill: ExtractedSkill, ctx: AdapterContext): Promise<RenderedSkill>;
}

export interface AdapterContext {
  /** Canonical `packageName` for self-reference (bundle mode only). Undefined in extract mode. */
  packageName?: string;
  /** Skill name chosen by extract/bundle */
  skillName: string;
  /** Token budget per reference file */
  maxTokens: number;
  /** Canonicalize the output (default true) */
  canonicalize: boolean;
}
```

`RenderedSkill` is imported from `@skillit/core` — adapters produce the same file-set type the core renderer produces.

### 2.5 `McpServerConfig` — `mcp.json` / `claude_desktop_config.json` entry

```typescript
/** Matches Claude Desktop's mcpServers[name] schema, extended with optional disabled flag */
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
```

### 2.6 `McpError`

```typescript
export class McpError extends Error {
  readonly code: string;
  readonly cause?: unknown;
  constructor(message: string, code: string, cause?: unknown) {
    /* ... */
  }
}
```

Codes: `UNKNOWN_TARGET`, `ADAPTER_NOT_FOUND`, `TRANSPORT_FAILED`, `INITIALIZE_FAILED`, `PROTOCOL_VERSION_UNSUPPORTED`, `SCHEMA_REF_CYCLE`, `SERVER_EXITED_EARLY`, `MISSING_LAUNCH_COMMAND`, `DUPLICATE_SKILL_NAME` (use `--force` to overwrite).

---

## 3. package.json `to-skills.mcp` config — JSON Schema

See [contracts/package-json-config.md](./contracts/package-json-config.md) for the authoritative schema. Shape summary:

```json
{
  "to-skills": {
    "mcp": {
      "skillName": "string",
      "command": "string (optional — derived from bin if absent)",
      "args": ["string"],
      "env": { "KEY": "value" },
      "invocation": "mcp-protocol | cli:name | array thereof"
    }
  }
}
```

`to-skills.mcp` MAY be an array for multi-server packages — each entry has the same shape.

---

## 4. Relationships

```text
CLI (commander)
  └─ calls extractMcpSkill(options) ─── uses ──→ @modelcontextprotocol/sdk Client
                                                    (stdio | http transport)
                                                        │
                                                        ↓
                                           returns ExtractedSkill (IR)
                                                        │
                                                        ↓
  └─ for each target: renderSkill(skill, { invocation: loadAdapter(target) })
                              │
                              ↓
                     InvocationAdapter.render(skill, ctx)
                              │
                              ↓
                     RenderedSkill (SKILL.md + references)
                              │
                              ↓
                     filesystem writer → skills/<name>/
```

Bundle mode wraps the same pipeline with:

```text
bundleMcpSkill(options)
  ├─ read package.json
  ├─ normalize to-skills.mcp config
  ├─ for each (server, target) combination:
  │     ├─ build launch command (from config or derived from `bin`)
  │     ├─ call extractMcpSkill
  │     ├─ call renderSkill with the target's adapter
  │     └─ write to skills/<skillName>[-<target>]/
  ├─ verify package.json `files` (warnings only)
  └─ run audit → BundleResult
```

---

## 5. State transitions

**Extract**: stateless. One handshake, one tool listing, one render. No retries.

**Bundle**: single-shot orchestration. If any server fails, subsequent servers are still attempted (matches Story 3 AC3 for batch config, extended to bundle). Final exit status is non-zero iff any failed.

**Adapter loading**: lazy but fail-fast. Resolved once per `InvocationTarget` value; cached per-process in a `Map<InvocationTarget, InvocationAdapter>`.

**Canonicalization**: pure, post-render. Applied after the adapter returns its `RenderedSkill`, before the filesystem writer runs. Idempotent — running twice yields the same output.
