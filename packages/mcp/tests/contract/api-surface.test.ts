/**
 * Contract test (T099) — public API surface of `@skillit/mcp`.
 *
 * Imports every public *value* export from the package barrel and asserts each
 * is defined with the expected runtime shape. The intent is to catch
 * accidental export removal during refactors — if a refactor drops a function
 * from `src/index.ts`, this test fails at the import site.
 *
 * Type-only exports (interfaces / type aliases) are erased at runtime, so they
 * cannot be asserted against `typeof`. The `_typeCheck` helper below references
 * each public type in a never-called function so the TypeScript compiler still
 * exercises every type export — a deletion would surface as a `tsc` error
 * during `pnpm run type-check`, complementing the runtime checks below.
 *
 * NOT gated by `RUN_INTEGRATION_TESTS` — this is a build-time guarantee and
 * must run on every CI build.
 */
import { describe, expect, it } from 'vitest';
import * as Mcp from '../../src/index.js';
import type {
  AdapterFingerprint,
  AdapterRenderContext,
  AuditIssue,
  AuditOptions,
  AuditResult,
  AuditSeverity,
  BundleFailure,
  BundleResult,
  ConfigEntry,
  ExtractedPrompt,
  ExtractedResource,
  ExtractedSkill,
  InvocationAdapter,
  InvocationTarget,
  McpBundleOptions,
  McpClient,
  McpConfigFile,
  McpErrorCode,
  McpExtractOptions,
  McpPromptArgumentEntry,
  McpPromptListEntry,
  McpResourceListEntry,
  McpServerConfig,
  McpToolListEntry,
  McpTransport,
  NormalizedBundleEntry,
  ParameterPlan,
  SkillSetup,
  WrittenSkill
} from '../../src/index.js';

describe('@skillit/mcp public API surface', () => {
  it('exports PACKAGE_VERSION as a non-empty string', () => {
    expect(typeof Mcp.PACKAGE_VERSION).toBe('string');
    expect(Mcp.PACKAGE_VERSION.length).toBeGreaterThan(0);
  });

  it('exports the extract orchestrator', () => {
    expect(typeof Mcp.extractMcpSkill).toBe('function');
  });

  it('exports the bundle orchestrator', () => {
    expect(typeof Mcp.bundleMcpSkill).toBe('function');
  });

  it('exports the CLI program builder', () => {
    expect(typeof Mcp.buildProgram).toBe('function');
  });

  it('exports adapter loaders (sync + async)', () => {
    expect(typeof Mcp.loadAdapter).toBe('function');
    expect(typeof Mcp.loadAdapterAsync).toBe('function');
  });

  it('exports adapter helpers', () => {
    expect(typeof Mcp.classifyParameters).toBe('function');
    expect(typeof Mcp.generatedByFrontmatter).toBe('function');
    expect(typeof Mcp.assertFingerprintConsistency).toBe('function');
    expect(typeof Mcp.renderCliParamTable).toBe('function');
  });

  it('exports the schema resolver', () => {
    expect(typeof Mcp.resolveSchema).toBe('function');
  });

  it('exports introspection helpers', () => {
    expect(typeof Mcp.listTools).toBe('function');
    expect(typeof Mcp.listResources).toBe('function');
    expect(typeof Mcp.listPrompts).toBe('function');
  });

  it('exports the audit-rule helpers', () => {
    expect(typeof Mcp.auditAdapterFreshness).toBe('function');
    // B21 / Phase 10 — M1-M4 + aggregator + worstSeverityOf are public API
    // so consumers (e.g. CI integrations, custom bundlers) can run audits
    // without spawning the CLI.
    expect(typeof Mcp.runM1).toBe('function');
    expect(typeof Mcp.runM2).toBe('function');
    expect(typeof Mcp.runM3).toBe('function');
    expect(typeof Mcp.runM4).toBe('function');
    expect(typeof Mcp.runMcpAudit).toBe('function');
    expect(typeof Mcp.worstSeverityOf).toBe('function');
  });

  it('exports the config-file batch reader', () => {
    expect(typeof Mcp.readMcpConfigFile).toBe('function');
  });

  it('exports the McpError class', () => {
    expect(Mcp.McpError).toBeDefined();
    expect(typeof Mcp.McpError).toBe('function');
    // McpError extends Error — `new McpError(...)` should produce an Error instance.
    const err = new Mcp.McpError('msg', 'TRANSPORT_FAILED');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(Mcp.McpError);
    expect(err.code).toBe('TRANSPORT_FAILED');
  });

  it('preserves type exports at compile time', () => {
    // This helper is never invoked — its body exists solely so the TS compiler
    // resolves every public type export. If any of these names disappear from
    // `src/index.ts`, `pnpm run type-check` fails before the runtime tests run.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _typeCheck = (
      _adapter: InvocationAdapter,
      _target: InvocationTarget,
      _renderCtx: AdapterRenderContext,
      _fingerprint: AdapterFingerprint,
      _paramPlan: ParameterPlan,
      _errCode: McpErrorCode,
      _transport: McpTransport,
      _extractOpts: McpExtractOptions,
      _bundleOpts: McpBundleOptions,
      _auditOpts: AuditOptions,
      _auditSev: AuditSeverity,
      _auditIssue: AuditIssue,
      _auditResult: AuditResult,
      _written: WrittenSkill,
      _failure: BundleFailure,
      _bundleResult: BundleResult,
      _serverCfg: McpServerConfig,
      _cfgFile: McpConfigFile,
      _configEntry: ConfigEntry,
      _normEntry: NormalizedBundleEntry,
      _client: McpClient,
      _toolEntry: McpToolListEntry,
      _resourceEntry: McpResourceListEntry,
      _promptEntry: McpPromptListEntry,
      _promptArg: McpPromptArgumentEntry,
      _extracted: ExtractedSkill,
      _extractedRes: ExtractedResource,
      _extractedPrompt: ExtractedPrompt,
      _setup: SkillSetup
    ): void => {
      void _adapter;
      void _target;
      void _renderCtx;
      void _fingerprint;
      void _paramPlan;
      void _errCode;
      void _transport;
      void _extractOpts;
      void _bundleOpts;
      void _auditOpts;
      void _auditSev;
      void _auditIssue;
      void _auditResult;
      void _written;
      void _failure;
      void _bundleResult;
      void _serverCfg;
      void _cfgFile;
      void _configEntry;
      void _normEntry;
      void _client;
      void _toolEntry;
      void _resourceEntry;
      void _promptEntry;
      void _promptArg;
      void _extracted;
      void _extractedRes;
      void _extractedPrompt;
      void _setup;
    };
    expect(typeof _typeCheck).toBe('function');
  });
});
