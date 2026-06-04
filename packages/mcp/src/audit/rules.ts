/**
 * Audit aggregator — runs all MCP audit rules against a skill and returns
 * the union of issues in deterministic order.
 *
 * @remarks
 * **Ordering.** Issues are sorted first by severity descending
 * (`fatal > error > warning > alert`), then by code ascending
 * (`M1 < M2 < M3 < M4 < M5`). Stable secondary tiers (per-tool issues from
 * the same rule) preserve their relative order from the rule's own output,
 * so we get a fully reproducible sort across runs — important for CI diff
 * stability when audit output is captured to files.
 *
 * **Freshness (M5) is opt-in.** The freshness rule needs an embedded
 * fingerprint AND an installed adapter, neither of which are available at
 * extract time. Bundle mode passes both; extract mode does not. When either
 * argument is absent, M5 is skipped — silently, because "not enough context
 * to check freshness" is normal, not an audit gap.
 *
 * @module audit/rules
 */

import type { AdapterFingerprint, ExtractedSkill } from '@skillit/core';
import type { InvocationAdapter } from '../adapter/types.js';
import type { AuditIssue, AuditSeverity } from '../types.js';
import { auditAdapterFreshness } from './freshness.js';
import { runM1 } from './rule-m1.js';
import { runM2 } from './rule-m2.js';
import { runM3 } from './rule-m3.js';
import { runM4 } from './rule-m4.js';

/**
 * Severity → numeric weight for the descending sort. Higher number = more
 * urgent. Kept inline rather than parameterized because the four levels are
 * fixed by the AuditSeverity union.
 */
const SEVERITY_RANK: Record<AuditSeverity, number> = {
  fatal: 4,
  error: 3,
  warning: 2,
  alert: 1
};

/**
 * Run every applicable audit rule against `skill` and return the combined,
 * sorted issue list.
 *
 * @param skill the extracted skill
 * @param embeddedFingerprint optional fingerprint embedded in a previously
 *   rendered SKILL.md's frontmatter. Required for M5 freshness checks.
 * @param installedAdapter optional currently-resolved adapter. Required for
 *   M5 freshness checks. When BOTH this and `embeddedFingerprint` are set,
 *   M5 runs; otherwise it is silently skipped.
 *
 * @returns concatenated, sorted issues. Empty array means a clean audit.
 *
 * @public
 */
export function runMcpAudit(
  skill: ExtractedSkill,
  embeddedFingerprint?: AdapterFingerprint,
  installedAdapter?: InvocationAdapter
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  // Run rules in code order — the sort below stabilizes the final order, but
  // rule-internal order (per-tool issues from the same rule) is preserved as
  // a stable secondary tier, so running M1 first matches the output's natural
  // top-to-bottom reading.
  issues.push(...runM1(skill));
  issues.push(...runM2(skill));
  issues.push(...runM3(skill));
  issues.push(...runM4(skill));

  if (embeddedFingerprint !== undefined && installedAdapter !== undefined) {
    issues.push(...auditAdapterFreshness(skill, embeddedFingerprint, installedAdapter));
  }

  // Stable sort: severity descending, then code ascending. Array#sort is
  // documented stable in modern V8 and required-stable since ES2019, so
  // intra-rule order is preserved when severity+code tie.
  return issues.sort((a, b) => {
    const sevDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDelta !== 0) return sevDelta;
    // Codes are `M<number>` — compare by the numeric component so M10 sorts
    // after M2 rather than between M1 and M2. Today the union only goes up
    // to M5, but this future-proofs against the M-99 range reserved for the
    // schema.
    return parseAuditCode(a.code) - parseAuditCode(b.code);
  });
}

/** Strip the `M` prefix and parse the integer suffix; falls back to NaN-safe. */
function parseAuditCode(code: AuditIssue['code']): number {
  const n = Number.parseInt(code.slice(1), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute the worst severity present in an issue list. Useful for the
 * bundle-mode exit-code mapper and for `WrittenSkill.audit.worstSeverity`.
 *
 * @public
 */
export function worstSeverityOf(issues: readonly AuditIssue[]): AuditSeverity | 'none' {
  let worst: AuditSeverity | 'none' = 'none';
  let worstRank = 0;
  for (const issue of issues) {
    const rank = SEVERITY_RANK[issue.severity];
    if (rank > worstRank) {
      worstRank = rank;
      worst = issue.severity;
    }
  }
  return worst;
}
