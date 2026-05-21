/**
 * Shared types, renderers, and utilities for the to-skills ecosystem.
 *
 * Core provides the intermediate representation (ExtractedSkill), the SKILL.md renderer
 * with progressive disclosure (lean discovery file + on-demand reference files), the
 * audit engine (20 checks across fatal/error/warning/alert), and utilities for
 * token budgeting, README parsing, and docs scanning.
 *
 * @remarks
 * All extractors (@to-skills/typedoc, @to-skills/cli, @to-skills/docusaurus) produce
 * ExtractedSkill objects. Core renders them into SKILL.md + references/ files.
 * The rendering is framework-agnostic — it doesn't know where the data came from.
 *
 * @packageDocumentation
 */

export type {
  ExtractedSkill,
  ExtractedSkillAudit,
  ExtractedFunction,
  ExtractedFunctionMcpMetadata,
  ExtractedClass,
  ExtractedType,
  ExtractedEnum,
  ExtractedParameter,
  ExtractedProperty,
  ExtractedVariable,
  ExtractedDocument,
  ExtractedResource,
  ExtractedPrompt,
  ExtractedPromptArgument,
  SkillSetup,
  AdapterFingerprint,
  InvocationAdapter,
  AdapterRenderContext,
  AdapterRenderContextBase,
  AdapterRenderContextBundle,
  AdapterRenderContextHttp,
  AdapterRenderContextStdio,
  RefCategory,
  RefManifest,
  RefManifestEntry,
  RenderedFile,
  RenderedSkill,
  SkillRenderOptions,
  SkillWriteOptions,
  SkillWriteResult,
  SkillWritePreserveReason,
  McpAuditSeverity,
  McpAuditIssue
} from './types.js';

export { renderSkills, renderSkill } from './renderer.js';
export { canonicalize } from './canonical.js';
export type { CanonicalizeOptions } from './canonical.js';
export { writeSkills, readInstalledSkillMetadata } from './writer.js';
export { estimateTokens, truncateToTokenBudget } from './tokens.js';
export { renderResourcesReference, renderPromptsReference } from './references-mcp.js';
export type { McpReferenceOptions } from './references-mcp.js';
export { renderLlmsTxt } from './llms-txt.js';
export type { LlmsTxtOptions, LlmsTxtResult } from './llms-txt.js';

export type {
  AuditSeverity,
  AuditIssue,
  AuditPass,
  AuditContext,
  ParsedReadme,
  AuditResult
} from './audit-types.js';

export { parseReadme } from './readme-parser.js';

export { auditSkill } from './audit.js';

export { formatAuditText, formatAuditJson, formatScoreEstimate } from './audit-formatter.js';

export { estimateSkillJudgeScore } from './audit-score.js';
export type { SkillJudgeEstimate, ActionableImprovement } from './audit-score.js';

export type {
  ConfigSourceType,
  ExtractedConfigSurface,
  ExtractedConfigOption,
  ExtractedConfigArgument
} from './config-types.js';

export { renderConfigSurfaceSection, renderConfigReference } from './config-renderer.js';

export type { ParsedSection, ParsedMarkdownDoc, DocsExtractionOptions } from './markdown-types.js';

export { parseMarkdownDoc } from './markdown-parser.js';

export { scanDocs, docsToExtractedDocuments, scanRootDocs } from './docs-scanner.js';

export { scanExamples, linkExamplesToSkill } from './examples-scanner.js';
export type { ParsedExample } from './examples-scanner.js';

export * from './refine/index.js';
