import type { AuditIssue, AuditResult, AuditSeverity } from './audit-types.js';
import type { SkillJudgeEstimate } from './audit-score.js';

// ---------------------------------------------------------------------------
// Severity display configuration
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: AuditSeverity[] = ['fatal', 'error', 'warning', 'alert'];

const SEVERITY_EMOJI: Record<AuditSeverity, string> = {
  fatal: '🔴',
  error: '🔴',
  warning: '🟡',
  alert: '🔵'
};

const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  fatal: 'FATAL',
  error: 'ERROR',
  warning: 'WARNING',
  alert: 'ALERT'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileRef(issue: AuditIssue): string {
  return issue.line !== null ? `${issue.file}:${issue.line}` : issue.file;
}

function groupBySeverity(issues: AuditIssue[]): Map<AuditSeverity, AuditIssue[]> {
  const map = new Map<AuditSeverity, AuditIssue[]>();
  for (const sev of SEVERITY_ORDER) {
    map.set(sev, []);
  }
  for (const issue of issues) {
    map.get(issue.severity)!.push(issue);
  }
  return map;
}

function groupByFile(issues: AuditIssue[]): Map<string, AuditIssue[]> {
  const map = new Map<string, AuditIssue[]>();
  for (const issue of issues) {
    const ref = fileRef(issue);
    if (!map.has(ref)) map.set(ref, []);
    map.get(ref)!.push(issue);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format an {@link AuditResult} as human-readable text suitable for TypeDoc logs.
 *
 * Output groups issues by severity (fatal → error → warning → alert),
 * then lists passing checks at the end. Empty severity groups are omitted.
 *
 * @category Audit
 */
export function formatAuditText(result: AuditResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`📊 Skill Documentation Audit: ${result.package}`);
  const { fatal, error, warning, alert } = result.summary;
  lines.push(`   ${fatal} fatal · ${error} error · ${warning} warning · ${alert} alert`);

  // Issue groups
  const bySeverity = groupBySeverity(result.issues);

  for (const sev of SEVERITY_ORDER) {
    const sevIssues = bySeverity.get(sev)!;
    if (sevIssues.length === 0) continue;

    lines.push('');
    lines.push(`${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]} (${sevIssues.length})`);
    lines.push('');

    const byFile = groupByFile(sevIssues);
    for (const [ref, fileIssues] of byFile) {
      lines.push(`  ${ref}`);
      for (const issue of fileIssues) {
        lines.push(`    ⚠ ${issue.message}`);
        lines.push(`      Suggestion: ${issue.suggestion}`);
      }
    }
  }

  // Passing checks
  if (result.passing.length > 0) {
    lines.push('');
    lines.push(`✅ PASSING (${result.passing.length} checks)`);
    for (const pass of result.passing) {
      const detail = pass.detail ? ` — ${pass.detail}` : '';
      lines.push(`  ✓ ${pass.message}${detail}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format an {@link AuditResult} as pretty-printed JSON for machine consumption.
 *
 * Returns the full result object serialized with 2-space indentation so it
 * can be parsed by downstream tooling without any further transformation.
 *
 * @param result - The audit result to serialize.
 * @returns The audit result as 2-space-indented JSON text.
 * @category Audit
 */
export function formatAuditJson(result: AuditResult): string {
  return JSON.stringify(result, null, 2);
}

// ---------------------------------------------------------------------------
// Dimension metadata for formatting
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Array<{
  key: keyof SkillJudgeEstimate['dimensions'];
  label: string;
  max: number;
  hint: string;
}> = [
  {
    key: 'd1_knowledgeDelta',
    label: 'D1 Knowledge Delta',
    max: 20,
    hint: 'add @remarks to complex functions'
  },
  { key: 'd2_procedures', label: 'D2 Procedures', max: 15, hint: 'add @useWhen' },
  { key: 'd3_antiPatterns', label: 'D3 Anti-Patterns', max: 15, hint: 'add @never' },
  { key: 'd4_description', label: 'D4 Description', max: 15, hint: 'add package.json description' },
  {
    key: 'd5_progressiveDisclosure',
    label: 'D5 Progressive Disclosure',
    max: 15,
    hint: 'add @category'
  },
  { key: 'd6_freedom', label: 'D6 Freedom', max: 15, hint: 'add @avoidWhen' },
  { key: 'd7_pattern', label: 'D7 Pattern', max: 10, hint: 'add @category' },
  { key: 'd8_usability', label: 'D8 Usability', max: 15, hint: 'add @param/@returns' }
];

// Width of the longest label (for alignment)
const LABEL_WIDTH = Math.max(...DIMENSION_LABELS.map((d) => d.label.length));

/**
 * Format a {@link SkillJudgeEstimate} as human-readable text.
 *
 * Shows total score, grade, per-dimension breakdown with inline suggestions
 * for dimensions below 80% of their max, and a numbered improvement list.
 *
 * @example
 * ```typescript
 * const estimate = estimateSkillJudgeScore(auditResult);
 * console.log(formatScoreEstimate(estimate));
 * ```
 *
 * @category Audit
 */
export function formatScoreEstimate(estimate: SkillJudgeEstimate): string {
  const lines: string[] = [];

  // Header
  lines.push(
    `📊 Skill-Judge Estimate: ${estimate.total}/${120} (${estimate.percentage}%) — Grade ${estimate.grade}`
  );
  lines.push('');

  // Per-dimension rows
  for (const dim of DIMENSION_LABELS) {
    const score = estimate.dimensions[dim.key];
    const pctOfMax = score / dim.max;
    const needsHint = pctOfMax < 0.8;

    const labelPadded = dim.label.padEnd(LABEL_WIDTH);
    const scoreStr = `${score}/${dim.max}`;
    // Right-align score within a 5-char field
    const scoreField = scoreStr.padStart(5);
    const hintStr = needsHint ? `  ← ${dim.hint}` : '';

    lines.push(`  ${labelPadded}: ${scoreField}${hintStr}`);
  }

  // Top improvements
  if (estimate.improvements.length > 0) {
    lines.push('');
    lines.push('  Top improvements:');
    estimate.improvements.forEach((imp, i) => {
      const hasTargets = imp.targets && imp.targets.length > 0;
      const suffix = hasTargets ? ' — missing on:' : '';
      lines.push(`  ${i + 1}. ${imp.suggestion}${suffix}`);
      if (hasTargets && imp.targets) {
        for (const t of imp.targets) {
          lines.push(`     ${t.file} → ${t.name} (${t.kind})`);
        }
      }
    });
  }

  return lines.join('\n');
}
