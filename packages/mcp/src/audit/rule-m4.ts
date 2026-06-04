/**
 * Audit rule M4 — generic tool name (FR-040).
 *
 * @remarks
 * Tool names like `get`, `set`, `run`, `do`, `list`, `find`, `help`, `test`
 * give an LLM no information about *what* the tool acts on. When several
 * skills are loaded simultaneously, a tool named `get` collides with every
 * other "get" tool in the agent's context, and the model has to read the
 * description to disambiguate — a slow, error-prone path. We surface this
 * as `alert` severity: less urgent than fatal/error/warning, but worth
 * flagging in CI so operators get nudged toward `get_user_profile` /
 * `list_databases` / etc.
 *
 * The default list is small on purpose — false positives cost more than
 * misses here, since the rule fires across every server. Operators with
 * legitimate generic names (e.g. a `help` tool that prints global help) can
 * pass `opts.genericNames` to override the list entirely.
 *
 * Match is case-insensitive: `Get`, `GET`, `get` all trigger.
 *
 * @module audit/rule-m4
 */

import type { ExtractedSkill } from '@skillit/core';
import type { AuditIssue } from '../types.js';

/** Default set of generic-by-themselves tool names. Override via opts.genericNames. */
const DEFAULT_GENERIC_NAMES = ['get', 'set', 'run', 'do', 'list', 'find', 'help', 'test'] as const;

/**
 * Run rule M4 against a skill: emit one alert-severity issue per function
 * whose name (case-insensitive) appears in the generic-name list.
 *
 * @param skill the extracted skill
 * @param opts.genericNames override the default generic-name list. When
 *   provided, replaces the default rather than augmenting it — operators
 *   who want to add to the default should spread it themselves.
 *
 * @public
 */
export function runM4(
  skill: ExtractedSkill,
  opts?: { genericNames?: readonly string[] }
): AuditIssue[] {
  const generic = (opts?.genericNames ?? DEFAULT_GENERIC_NAMES).map((s) => s.toLowerCase());
  const genericSet = new Set(generic);
  const issues: AuditIssue[] = [];
  for (const fn of skill.functions) {
    if (genericSet.has(fn.name.toLowerCase())) {
      issues.push({
        code: 'M4',
        severity: 'alert',
        message: `Tool name "${fn.name}" is too generic; consider a more specific name (e.g. "get_user_profile" instead of "get").`,
        location: { tool: fn.name },
        suggestion:
          'Rename the tool to a more specific name: [verb]_[object] or [domain]_[action] so agents can choose it without reading every description'
      });
    }
  }
  return issues;
}
