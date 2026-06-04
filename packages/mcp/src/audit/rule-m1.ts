/**
 * Audit rule M1 — missing tool description (FR-040).
 *
 * @remarks
 * MCP agents surface tools to users via their `description` text — a tool
 * with no description is effectively invisible at the call site, since the
 * harness has nothing to render in tool-picker UIs. We therefore treat an
 * empty/whitespace-only description as `fatal`: the rendered SKILL.md is
 * structurally complete, but the underlying server is mis-built and any
 * downstream consumer should refuse to publish it.
 *
 * Per-tool granularity: one issue is emitted per offending function so that
 * users see exactly which tool needs the fix. The aggregator sorts
 * results by severity then code, keeping output deterministic.
 *
 * @module audit/rule-m1
 */

import type { ExtractedSkill } from '@skillit/core';
import type { AuditIssue } from '../types.js';

/**
 * Run rule M1 against a skill: emit one fatal-severity issue per function
 * whose `description` is empty or whitespace-only.
 *
 * @public
 */
export function runM1(skill: ExtractedSkill): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const fn of skill.functions) {
    if (fn.description.trim().length === 0) {
      issues.push({
        code: 'M1',
        severity: 'fatal',
        message: `Tool "${fn.name}" has no description. MCP agents require a description to surface the tool to users.`,
        location: { tool: fn.name },
        suggestion:
          'Add a description to the tool: [One sentence: what this tool does and when an agent should call it]'
      });
    }
  }
  return issues;
}
