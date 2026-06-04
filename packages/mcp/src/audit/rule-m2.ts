/**
 * Audit rule M2 — missing or invalid `inputSchema` (FR-040).
 *
 * @remarks
 * The Phase-3 `listTools` introspector marks any function whose `inputSchema`
 * failed to resolve due to a `$ref` cycle with
 * `mcpMetadata.schemaError.kind === 'ref-cycle'` and also projects legacy
 * `tags.schemaError === 'true'` / `tags.schemaErrorTool` compatibility tags.
 * We surface those as `error` severity because the tool is technically
 * callable (an MCP harness can still send a `tools/call` request), but the
 * agent has no usable parameter information — call sites will fail at
 * validation time on the server side.
 *
 * We deliberately do NOT flag tools whose `inputSchema` is `undefined` /
 * `null` / non-object: the introspector treats those as "tool takes no
 * input", which is a valid configuration for tools like `ping` or
 * `list_databases`. Conflating "absent schema" with "broken schema" here
 * would generate false positives on every parameterless tool.
 *
 * @module audit/rule-m2
 */

import type { ExtractedSkill } from '@skillit/core';
import type { AuditIssue } from '../types.js';

/**
 * Run rule M2 against a skill: emit one error-severity issue per function
 * carrying the schema-error marker emitted by the introspector.
 *
 * @public
 */
export function runM2(skill: ExtractedSkill): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const fn of skill.functions) {
    const hasSchemaError =
      fn.mcpMetadata?.schemaError?.kind === 'ref-cycle' || fn.tags['schemaError'] === 'true';
    if (!hasSchemaError) continue;
    // The introspector (`packages/mcp/src/introspect/tools.ts`) tags only
    // `$ref` cycle failures today and always sets `schemaErrorTool` alongside
    // `schemaError`. The reason is therefore deterministic. If a future
    // introspector adds non-cycle schemaError causes, switch this to a
    // discriminator on a new `tags.schemaErrorReason` field rather than
    // overloading the meaning of `schemaErrorTool`.
    issues.push({
      code: 'M2',
      severity: 'error',
      message: `Tool "${fn.name}" has invalid inputSchema (cycle in $ref).`,
      location: { tool: fn.name },
      suggestion:
        "Add inputSchema to tool: { type: 'object', properties: { [param]: { type: '[type]', description: '[effect]' } } }"
    });
  }
  return issues;
}
