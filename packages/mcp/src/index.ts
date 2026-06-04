// Public surface for @skillit/mcp.
// See specs/001-mcp-extract-bundle/tasks.md for the implementation plan.

// Version — kept for downstream tests that may want to assert against it.
export { PACKAGE_VERSION } from './version.js';

// Adapter plugin interface
export type {
  InvocationTarget,
  InvocationAdapter,
  AdapterRenderContext,
  AdapterRenderContextBase,
  AdapterRenderContextBundle,
  AdapterRenderContextHttp,
  AdapterRenderContextStdio,
  AdapterFingerprint,
  ParameterPlan
} from './adapter/types.js';
export { loadAdapter, loadAdapterAsync } from './adapter/loader.js';
export { classifyParameters } from './adapter/classify.js';
export { assertFingerprintConsistency, generatedByFrontmatter } from './adapter/fingerprint.js';
export { renderCliParamTable } from './adapter/param-table.js';

// Errors
export { McpError } from './errors.js';
export type { McpErrorCode } from './errors.js';

// Audit rules
export { auditAdapterFreshness } from './audit/freshness.js';
export { runM1 } from './audit/rule-m1.js';
export { runM2 } from './audit/rule-m2.js';
export { runM3 } from './audit/rule-m3.js';
export { runM4 } from './audit/rule-m4.js';
export { runMcpAudit, worstSeverityOf } from './audit/rules.js';

// Extract orchestrator
export { extractMcpSkill } from './extract.js';

// Bundle orchestrator + config types
export { bundleMcpSkill } from './bundle.js';
export type { NormalizedBundleEntry } from './bundle/config.js';

// Config-file batch reader
export { readMcpConfigFile } from './config/file-reader.js';

// CLI program builder — exposed so consumers can embed the commander program
// into a parent CLI. The `bin.ts` executable entry point is not exported.
export { buildMcpCommand, buildProgram } from './cli.js';
export { mcpErrorExitCode, reportMcpErrorAndExit } from './error-exit.js';

// Render helpers (token-aware splitting for adapter `tools.md` emission)
export { splitToolsByNamespace } from './render/split-by-namespace.js';
export type { NamespaceGroup } from './render/split-by-namespace.js';

// Introspection helpers
export { resolveSchema } from './introspect/schema.js';
export { listTools } from './introspect/tools.js';
export { listResources } from './introspect/resources.js';
export { listPrompts } from './introspect/prompts.js';
export type {
  McpClient,
  McpToolListEntry,
  McpResourceListEntry,
  McpPromptListEntry,
  McpPromptArgumentEntry
} from './introspect/client-types.js';

// Option bags + results (from types.ts)
export type {
  McpTransport,
  McpExtractOptions,
  McpBundleOptions,
  AuditOptions,
  AuditSeverity,
  AuditIssue,
  AuditResult,
  WrittenSkill,
  BundleFailure,
  BundleResult,
  McpServerConfig,
  McpConfigFile,
  ConfigEntry
} from './types.js';

// Re-export useful core types for adapter/author ergonomics
export type { ExtractedSkill, ExtractedResource, ExtractedPrompt, SkillSetup } from '@skillit/core';

export * from './refine/index.js';
