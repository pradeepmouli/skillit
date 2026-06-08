import type { ParsedReadme } from './types.js';

export type { ParsedReadme } from './types.js';

/**
 * Severity levels for audit issues, ordered from most to least severe.
 * - `fatal`: Disqualifying problems that prevent the skill from being used safely
 * - `error`: Serious problems that significantly degrade skill quality
 * - `warning`: Moderate problems that reduce skill effectiveness
 * - `alert`: Minor issues or suggestions for improvement
 */
export type AuditSeverity = 'fatal' | 'error' | 'warning' | 'alert';

/**
 * A single audit finding that identifies a problem in the skill package.
 */
export interface AuditIssue {
  /** Severity level of this issue */
  severity: AuditSeverity;
  /** Short rule code, e.g. "F1", "E2", "W3", "A1" */
  code: string;
  /** Relative path to the file containing the issue */
  file: string;
  /** Line number within the file, or null if not applicable */
  line: number | null;
  /** Name of the function, class, or property related to the issue */
  symbol: string;
  /** Human-readable description of the problem */
  message: string;
  /** Actionable suggestion for how to fix the issue */
  suggestion: string;
}

/**
 * A check that the audit engine ran and the skill package passed.
 */
export interface AuditPass {
  /** Short rule code corresponding to the passed check */
  code: string;
  /** Human-readable description of what was checked */
  message: string;
  /** Optional additional detail about the passing result */
  detail?: string;
}

/**
 * Contextual metadata about the package being audited, used to evaluate
 * relevance and quality of skill content.
 */
export interface AuditContext {
  /** Description field from package.json */
  packageDescription?: string;
  /** Keywords from package.json */
  keywords?: string[];
  /** Repository URL from package.json */
  repository?: string;
  /** Parsed sections of the package README */
  readme?: ParsedReadme;
}

/**
 * The complete output of an audit run against a single skill package.
 */
export interface AuditResult {
  /** Package name being audited */
  package: string;
  /** Count of issues found at each severity level */
  summary: Record<AuditSeverity, number>;
  /** All issues found during the audit */
  issues: AuditIssue[];
  /** All checks that the package passed */
  passing: AuditPass[];
}
