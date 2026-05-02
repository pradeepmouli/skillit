/**
 * Audit rule M3 — missing `useWhen` annotation (FR-040) + malformed
 * `_meta.toSkills` annotation (FR-H010, US6).
 *
 * @remarks
 * `useWhen` is the trigger phrase that tells an agent when to load a skill.
 * Without it, the LLM has no signal to discover the skill in context — the
 * skill renders fine but is functionally unreachable from the host harness.
 * This rule fires `warning` severity: the output is valid, but the operator
 * almost certainly intended to ship triggers and forgot.
 *
 * **Three paths.**
 *  - **Tool-level missing useWhen**: each function whose MCP metadata (or
 *    compatibility `tags.useWhen`) is missing
 *    missing gets one warning. The location names the tool so the operator
 *    can fix it directly. Capped at 5 to avoid drowning the audit on a
 *    50-tool server; a single "+ N more tools missing useWhen" summary
 *    closes the gap.
 *  - **Server-level**: when BOTH `skill.useWhen` is empty AND no tool
 *    contributed a `tags.useWhen`, one additional issue (no `location`)
 *    fires telling the operator there is no global trigger either. This
 *    avoids the false-positive case where a server-level `useWhen` covers
 *    every tool and the per-tool warnings would be noise.
 *  - **Malformed `_meta.toSkills`**: each function whose typed
 *    `mcpMetadata.toSkills.malformedReason` (or compatibility
 *    `tags.metaToSkillsMalformed`) is set (planted by the
 *    introspector when it detected a wrong-shape annotation) emits one
 *    warning naming the tool and the validation reason. Reuses M3 (not a
 *    new code) per Clarifications: user-facing impact is identical to
 *    "annotation didn't take effect", and the existing severity-filtering
 *    knobs continue to work as-is.
 *
 * Decision: per-tool warnings always emit when missing — the server-level
 * issue is *additive*, not a replacement. Operators routinely supply both
 * (one global + per-tool overrides), and partial coverage is normal during
 * authoring.
 *
 * @module audit/rule-m3
 */

import type { ExtractedSkill } from '@to-skills/core';
import type { AuditIssue } from '../types.js';

/** Maximum number of per-tool M3 issues to emit before collapsing into a summary. */
const PER_TOOL_CAP = 5;

/**
 * Run rule M3 against a skill: emit per-tool warnings for missing
 * typed per-tool useWhen metadata, plus a single server-level warning when no
 * `useWhen` exists anywhere on the skill.
 *
 * @public
 */
export function runM3(skill: ExtractedSkill): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // Per-tool detection. We collect first so the cap can collapse the tail
  // into a summary issue without distorting the order of the kept ones.
  const missingTools: string[] = [];
  for (const fn of skill.functions) {
    const useWhen = fn.mcpMetadata?.toSkills?.useWhen;
    const hasUseWhen =
      (useWhen !== undefined && useWhen.some((entry) => entry.trim().length > 0)) ||
      (fn.tags['useWhen'] !== undefined && fn.tags['useWhen'].trim().length > 0);
    if (!hasUseWhen) {
      missingTools.push(fn.name);
    }
  }

  const kept = missingTools.slice(0, PER_TOOL_CAP);
  for (const toolName of kept) {
    issues.push({
      code: 'M3',
      severity: 'warning',
      message: `Tool "${toolName}" has no useWhen annotation. Agents will struggle to discover when to invoke it.`,
      location: { tool: toolName },
      suggestion:
        'Fix _meta.toSkills shape: { useWhen: string[], avoidWhen?: string[], remarks?: string }'
    });
  }
  const overflow = missingTools.length - kept.length;
  if (overflow > 0) {
    issues.push({
      code: 'M3',
      severity: 'warning',
      message: `+ ${overflow} more tool${overflow === 1 ? '' : 's'} missing useWhen annotation (capped output).`
    });
  }

  // Server-level — only fires when the skill has no aggregated useWhen AND
  // no per-tool useWhen contributed (i.e. every tool was in `missingTools`).
  // Zero-tool servers intentionally skip this branch — resources/prompts-only
  // servers are valid and should not get a bogus "no trigger" warning.
  // The existing extract-time aggregator pushes per-tool useWhen into
  // `skill.useWhen`, so a non-empty array implies at least one tool has one.
  const serverHasUseWhen = Array.isArray(skill.useWhen) && skill.useWhen.length > 0;
  if (
    skill.functions.length > 0 &&
    !serverHasUseWhen &&
    missingTools.length === skill.functions.length
  ) {
    issues.push({
      code: 'M3',
      severity: 'warning',
      message:
        'Server has no useWhen annotation at any level (server-wide or per-tool). Agents have no trigger to discover this skill.',
      suggestion:
        'Fix _meta.toSkills shape: { useWhen: string[], avoidWhen?: string[], remarks?: string }'
    });
  }

  // Malformed `_meta.toSkills` sentinel (FR-H010, US6). The introspector
  // records a typed malformedReason and also projects the legacy
  // `tags.metaToSkillsMalformed = <reason>` compatibility tag. Surface one
  // warning per offending tool — no cap because malformed metadata is rare in
  // practice and suppressing detail would defeat the diagnostic.
  for (const fn of skill.functions) {
    const reason = fn.mcpMetadata?.toSkills?.malformedReason ?? fn.tags['metaToSkillsMalformed'];
    if (reason !== undefined && reason.length > 0) {
      issues.push({
        code: 'M3',
        severity: 'warning',
        message: `Tool "${fn.name}" has malformed _meta.toSkills annotation: ${reason}. Annotation was not honored.`,
        location: { tool: fn.name },
        suggestion: reason.includes('useWhen')
          ? 'Change to array: _meta.toSkills.useWhen = ["[scenario]"]'
          : 'Fix _meta.toSkills shape: { useWhen: string[], avoidWhen?: string[], remarks?: string }'
      });
    }
  }

  return issues;
}
