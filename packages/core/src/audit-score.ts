import type { AuditResult } from './audit-types.js';
import type { ExtractedSkill } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * An agent-actionable improvement suggestion with specific file/export targets.
 *
 * @category Audit
 */
export interface ActionableImprovement {
  /** Human-readable suggestion */
  suggestion: string;
  /** Points gained if fixed */
  points: number;
  /** Dimension affected (e.g. "D3") */
  dimension: string;
  /** Specific exports to annotate (file path → export name + kind) */
  targets?: Array<{ file: string; name: string; kind: string }>;
}

/**
 * A skill-judge score estimate derived from audit check results.
 *
 * Maps the 20+ audit checks to the 8 skill-judge dimensions and produces
 * a total score, percentage, letter grade, and top improvement suggestions.
 *
 * @category Audit
 */
export interface SkillJudgeEstimate {
  dimensions: {
    /** /20 — How much new knowledge the skill imparts */
    d1_knowledgeDelta: number;
    /** /15 — Quality of usage procedures and conditions */
    d2_procedures: number;
    /** /15 — Coverage of known pitfalls and anti-patterns */
    d3_antiPatterns: number;
    /** /15 — Clarity and completeness of descriptions */
    d4_description: number;
    /** /15 — Progressive disclosure: discovery vs. depth */
    d5_progressiveDisclosure: number;
    /** /15 — Freedom from prescriptive over-constraints */
    d6_freedom: number;
    /** /10 — Pattern consistency and grouping */
    d7_pattern: number;
    /** /15 — Developer usability: params, returns, examples */
    d8_usability: number;
  };
  /** Sum of all dimensions (max 120) */
  total: number;
  /** total / 120 * 100, rounded to one decimal */
  percentage: number;
  /** Letter grade based on percentage */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Top 3 actionable improvement suggestions (may be fewer if all dimensions pass 80%) */
  improvements: ActionableImprovement[];
}

// ---------------------------------------------------------------------------
// Dimension maxima
// ---------------------------------------------------------------------------

const MAX_D1 = 20;
const MAX_D2 = 15;
const MAX_D3 = 15;
const MAX_D4 = 15;
const MAX_D5 = 15;
const MAX_D6 = 15;
const MAX_D7 = 10;
const MAX_D8 = 15;
const MAX_TOTAL = MAX_D1 + MAX_D2 + MAX_D3 + MAX_D4 + MAX_D5 + MAX_D6 + MAX_D7 + MAX_D8; // 120

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function passes(audit: AuditResult, code: string): boolean {
  return audit.passing.some((p) => p.code === code);
}

function hasFatalCode(audit: AuditResult, code: string): boolean {
  return audit.issues.some((i) => i.code === code && i.severity === 'fatal');
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(0, value), max);
}

// ---------------------------------------------------------------------------
// Core estimator
// ---------------------------------------------------------------------------

/**
 * Estimate the 8-dimension skill-judge score from an {@link AuditResult}.
 *
 * Each dimension starts at a baseline and adds/deducts based on which audit
 * checks pass or fail. Dimensions are capped at their respective maxima.
 *
 * @param audit - The completed audit result to score
 * @param skill - Optional extracted skill; when provided, improvements include specific file/export targets
 * @returns A {@link SkillJudgeEstimate} with dimension breakdown, total, grade, and improvements
 *
 * @category Audit
 * @useWhen
 * - You want a quick human-readable quality rating after running an audit
 * - Building dashboards that track skill quality over time
 * @avoidWhen
 * - Using as a hard CI gate — prefer explicit audit codes (F1, E4, etc.) for gating
 */
export function estimateSkillJudgeScore(
  audit: AuditResult,
  skill?: ExtractedSkill
): SkillJudgeEstimate {
  // --- D1: Knowledge Delta /20 ---
  let d1 = 14;
  if (passes(audit, 'W10')) d1 += 3; // @remarks on complex functions
  if (passes(audit, 'W1')) d1 += 3; // @packageDocumentation >50 chars
  if (hasFatalCode(audit, 'F4')) d1 -= 5; // missing JSDoc on exports
  d1 = clamp(d1, MAX_D1);

  // --- D2: Procedures /15 ---
  let d2 = 5;
  if (passes(audit, 'W7')) d2 += 5; // @useWhen
  if (passes(audit, 'W8')) d2 += 3; // @avoidWhen
  if (passes(audit, 'E4')) d2 += 2; // @example
  d2 = clamp(d2, MAX_D2);

  // --- D3: Anti-Patterns /15 ---
  let d3 = 2;
  if (passes(audit, 'W9')) d3 += 8; // @never
  if (passes(audit, 'W3')) d3 += 3; // notable tags
  if (passes(audit, 'W6')) d3 += 2; // README troubleshooting
  d3 = clamp(d3, MAX_D3);

  // --- D4: Description /15 ---
  let d4 = 5;
  if (passes(audit, 'F1')) d4 += 4; // package.json description
  if (passes(audit, 'F3')) d4 += 3; // README description
  if (passes(audit, 'F2')) d4 += 2; // keywords
  if (passes(audit, 'E5')) d4 += 1; // repository URL
  d4 = clamp(d4, MAX_D4);

  // --- D5: Progressive Disclosure /15 ---
  let d5 = 10;
  if (passes(audit, 'W11')) d5 += 3; // @category
  if (passes(audit, 'W5')) d5 += 2; // README Features
  d5 = clamp(d5, MAX_D5);

  // --- D6: Freedom /15 ---
  let d6 = 12;
  if (passes(audit, 'W8')) d6 += 3; // @avoidWhen
  d6 = clamp(d6, MAX_D6);

  // --- D7: Pattern /10 ---
  let d7 = 5;
  if (passes(audit, 'W11')) d7 += 3; // @category
  if (passes(audit, 'W7')) d7 += 2; // @useWhen
  d7 = clamp(d7, MAX_D7);

  // --- D8: Usability /15 ---
  let d8 = 5;
  if (passes(audit, 'E1')) d8 += 3; // @param
  if (passes(audit, 'E2')) d8 += 3; // @returns
  if (passes(audit, 'E3')) d8 += 2; // property JSDoc
  if (passes(audit, 'E4')) d8 += 2; // @example
  d8 = clamp(d8, MAX_D8);

  const total = d1 + d2 + d3 + d4 + d5 + d6 + d7 + d8;
  const percentage = Math.round((total / MAX_TOTAL) * 1000) / 10;

  const grade = percentageToGrade(percentage);

  const improvements = buildImprovements(
    audit,
    {
      d1,
      d2,
      d3,
      d4,
      d5,
      d6,
      d7,
      d8
    },
    skill
  );

  return {
    dimensions: {
      d1_knowledgeDelta: d1,
      d2_procedures: d2,
      d3_antiPatterns: d3,
      d4_description: d4,
      d5_progressiveDisclosure: d5,
      d6_freedom: d6,
      d7_pattern: d7,
      d8_usability: d8
    },
    total,
    percentage,
    grade,
    improvements
  };
}

// ---------------------------------------------------------------------------
// Grade calculation
// ---------------------------------------------------------------------------

function percentageToGrade(pct: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------------
// Improvements builder
// ---------------------------------------------------------------------------

interface DimScores {
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  d5: number;
  d6: number;
  d7: number;
  d8: number;
}

// ---------------------------------------------------------------------------
// Target helpers
// ---------------------------------------------------------------------------

type ImprovementTarget = { file: string; name: string; kind: string };

function fileForModule(sourceModule: string | undefined): string {
  if (!sourceModule) return 'src/';
  return `src/${sourceModule}`;
}

/** Depth in source tree — fewer segments = higher priority (top-level exports first). */
function sourceDepth(sourceModule: string | undefined): number {
  if (!sourceModule) return 0; // no source info = treat as top-level
  return sourceModule.split('/').length;
}

/** Per-tag cap on config-option targets — high enough that real config surfaces aren't truncated. */
const MAX_CONFIG_OPTION_TARGETS = 24;

/** Classes and functions missing a given tag, sorted by source tree depth (top-level first). */
function targetsForMissingTag(
  skill: ExtractedSkill,
  tag: string,
  maxClasses = 5,
  maxFunctions = 3
): ImprovementTarget[] {
  const classTargets: ImprovementTarget[] = skill.classes
    .filter((c) => !c.tags[tag])
    .sort((a, b) => sourceDepth(a.sourceModule) - sourceDepth(b.sourceModule))
    .slice(0, maxClasses)
    .map((c) => ({ file: fileForModule(c.sourceModule), name: c.name, kind: 'class' }));

  const fnTargets: ImprovementTarget[] = skill.functions
    .filter((f) => !f.tags[tag])
    .sort((a, b) => sourceDepth(a.sourceModule) - sourceDepth(b.sourceModule))
    .slice(0, maxFunctions)
    .map((f) => ({ file: fileForModule(f.sourceModule), name: f.name, kind: 'function' }));

  // CLI command surfaces and config options also carry useWhen / avoidWhen /
  // pitfalls. Only emit targets for the tags that the surface model holds.
  const SURFACE_TAGS = new Set(['useWhen', 'avoidWhen', 'pitfalls'] as const);
  type SurfaceTag = 'useWhen' | 'avoidWhen' | 'pitfalls';

  // CLI surfaces are tagged at the surface (command) level: the target is the
  // command name, which the CliRefineSource maps to its `<Command>Options`
  // interface.
  const cliTargets: ImprovementTarget[] = SURFACE_TAGS.has(tag as SurfaceTag)
    ? (skill.configSurfaces ?? [])
        // Empty array = no content = a gap, so treat it the same as a missing tag.
        .filter(
          (s) => s.sourceType === 'cli' && !(s[tag as SurfaceTag] as string[] | undefined)?.length
        )
        .slice(0, maxFunctions)
        .map((s) => ({ file: '', name: s.name, kind: 'command' }))
    : [];

  // Config per-OPTION targets are NOT emitted here: routing-tag dimensions clear
  // their 80% threshold as soon as a FEW options carry a tag (W7/W8/W9 need only
  // one), so threshold-gated targeting stops at partial coverage. They are
  // surfaced threshold-independently in buildImprovements instead, so the loop
  // drives EVERY option to full coverage. See configOptionTargetsForTag.

  return [...classTargets, ...fnTargets, ...cliTargets];
}

/**
 * Config options still missing a routing `tag`, as work-item targets. Each maps
 * to the option's dot-path `configKey`, which the ConfigRefineSource writes via
 * `upsertPropertyJsDocTag`. Capped well above the class cap (a config commonly
 * has more documentable options than a module has classes); the loop's
 * itemsPerIteration paces how many are drafted per pass.
 */
function configOptionTargetsForTag(
  skill: ExtractedSkill,
  tag: 'useWhen' | 'avoidWhen' | 'pitfalls'
): ImprovementTarget[] {
  return (skill.configSurfaces ?? [])
    .filter((s) => s.sourceType === 'config')
    .flatMap((s) =>
      s.options
        .filter((o) => !(o[tag] as string[] | undefined)?.length)
        .map((o) => ({ file: '', name: o.configKey ?? o.name, kind: 'config-option' }))
    )
    .slice(0, MAX_CONFIG_OPTION_TARGETS);
}

/**
 * A single example target per `config` surface that lacks usage examples. The
 * ConfigRefineSource maps it to a sibling `<config>.example.ts` written via a
 * dedicated example-file path (not JSDoc). `name` is the config type so the
 * source can correlate, `kind` distinguishes it from per-option targets.
 */
function configExampleTargets(skill: ExtractedSkill): ImprovementTarget[] {
  return (skill.configSurfaces ?? [])
    .filter((s) => s.sourceType === 'config')
    .slice(0, 1)
    .map((s) => ({ file: '', name: s.name, kind: 'config-example' }));
}

/** Functions with 3+ parameters missing @remarks, sorted by source tree depth. */
function targetsForRemarks(skill: ExtractedSkill): ImprovementTarget[] {
  return skill.functions
    .filter((f) => f.parameters.length >= 3 && !f.tags['remarks'])
    .sort((a, b) => sourceDepth(a.sourceModule) - sourceDepth(b.sourceModule))
    .slice(0, 5)
    .map((f) => ({
      file: fileForModule(f.sourceModule),
      name: f.name,
      kind: `function, ${f.parameters.length} params`
    }));
}

/**
 * For each dimension below 80% of its max, suggest the audit fix that would
 * help most. Return the top 3 by potential point gain.
 */
function buildImprovements(
  audit: AuditResult,
  dims: DimScores,
  skill?: ExtractedSkill
): ActionableImprovement[] {
  const suggestions: Array<{ gain: number; imp: ActionableImprovement }> = [];

  // D1: highest single-fix gain is W10 (+3) or W1 (+3)
  if (dims.d1 < MAX_D1 * 0.8) {
    if (!passes(audit, 'W10')) {
      const targets = skill ? targetsForRemarks(skill) : undefined;
      suggestions.push({
        gain: 3,
        imp: {
          suggestion: 'Add @remarks to complex functions (3+ params) (+3 on D1)',
          points: 3,
          dimension: 'D1',
          targets: targets && targets.length > 0 ? targets : undefined
        }
      });
    }
    if (!passes(audit, 'W1')) {
      suggestions.push({
        gain: 3,
        imp: {
          suggestion: 'Add detailed @packageDocumentation description >50 chars (+3 on D1)',
          points: 3,
          dimension: 'D1'
        }
      });
    }
  }

  // D2: highest gain is W7 (+5)
  if (dims.d2 < MAX_D2 * 0.8) {
    if (!passes(audit, 'W7')) {
      const targets = skill ? targetsForMissingTag(skill, 'useWhen') : undefined;
      suggestions.push({
        gain: 5,
        imp: {
          suggestion: 'Add @useWhen to key exports (+5 on D2)',
          points: 5,
          dimension: 'D2',
          targets: targets && targets.length > 0 ? targets : undefined
        }
      });
    }
    if (!passes(audit, 'W8')) {
      const targets = skill ? targetsForMissingTag(skill, 'avoidWhen') : undefined;
      suggestions.push({
        gain: 3,
        imp: {
          suggestion: 'Add @avoidWhen to key exports (+3 on D2)',
          points: 3,
          dimension: 'D2',
          targets: targets && targets.length > 0 ? targets : undefined
        }
      });
    }
    if (!passes(audit, 'E4')) {
      suggestions.push({
        gain: 2,
        imp: {
          suggestion: 'Add @example code blocks (+2 on D2)',
          points: 2,
          dimension: 'D2'
        }
      });
    }
  }

  // D3: highest gain is W9 (+8)
  if (dims.d3 < MAX_D3 * 0.8) {
    if (!passes(audit, 'W9')) {
      const targets = skill ? targetsForMissingTag(skill, 'pitfalls') : undefined;
      suggestions.push({
        gain: 8,
        imp: {
          suggestion: 'Add @pitfalls (never-do) annotation to key exports (+8 on D3)',
          points: 8,
          dimension: 'D3',
          targets: targets && targets.length > 0 ? targets : undefined
        }
      });
    }
    if (!passes(audit, 'W3')) {
      suggestions.push({
        gain: 3,
        imp: {
          suggestion: 'Add @deprecated/@since/@throws/@see tags (+3 on D3)',
          points: 3,
          dimension: 'D3'
        }
      });
    }
    if (!passes(audit, 'W6')) {
      suggestions.push({
        gain: 2,
        imp: {
          suggestion: 'Add README Troubleshooting section (+2 on D3)',
          points: 2,
          dimension: 'D3'
        }
      });
    }
  }

  // D4: highest gain is F1 (+4)
  if (dims.d4 < MAX_D4 * 0.8) {
    if (!passes(audit, 'F1')) {
      suggestions.push({
        gain: 4,
        imp: {
          suggestion: 'Add meaningful package.json description (+4 on D4)',
          points: 4,
          dimension: 'D4'
        }
      });
    }
    if (!passes(audit, 'F3')) {
      suggestions.push({
        gain: 3,
        imp: {
          suggestion: 'Add README description/blockquote (+3 on D4)',
          points: 3,
          dimension: 'D4'
        }
      });
    }
    if (!passes(audit, 'F2')) {
      suggestions.push({
        gain: 2,
        imp: {
          suggestion: 'Add 5+ domain-specific keywords (+2 on D4)',
          points: 2,
          dimension: 'D4'
        }
      });
    }
    if (!passes(audit, 'E5')) {
      suggestions.push({
        gain: 1,
        imp: {
          suggestion: 'Add repository URL to package.json (+1 on D4)',
          points: 1,
          dimension: 'D4'
        }
      });
    }
  }

  // D5: highest gain is W11 (+3)
  if (dims.d5 < MAX_D5 * 0.8) {
    if (!passes(audit, 'W11')) {
      suggestions.push({
        gain: 3,
        imp: {
          suggestion: 'Add @category for grouping (+3 on D5, +3 on D7)',
          points: 3,
          dimension: 'D5'
        }
      });
    }
    if (!passes(audit, 'W5')) {
      suggestions.push({
        gain: 2,
        imp: {
          suggestion: 'Add README Features section (+2 on D5)',
          points: 2,
          dimension: 'D5'
        }
      });
    }
  }

  // D6: only W8 (+3) — but D6 base is 12 so below 80% (12) rarely triggers unless W8 missing
  if (dims.d6 < MAX_D6 * 0.8) {
    if (!passes(audit, 'W8')) {
      const targets = skill ? targetsForMissingTag(skill, 'avoidWhen') : undefined;
      suggestions.push({
        gain: 3,
        imp: {
          suggestion: 'Add @avoidWhen to key exports (+3 on D6)',
          points: 3,
          dimension: 'D6',
          targets: targets && targets.length > 0 ? targets : undefined
        }
      });
    }
  }

  // D7: W11 (+3), W7 (+2)
  if (dims.d7 < MAX_D7 * 0.8) {
    if (!passes(audit, 'W11')) {
      // Avoid duplicate if already added from D5
      const alreadySuggested = suggestions.some((s) =>
        s.imp.suggestion.includes('@category for grouping')
      );
      if (!alreadySuggested) {
        suggestions.push({
          gain: 3,
          imp: {
            suggestion: 'Add @category for grouping (+3 on D5, +3 on D7)',
            points: 3,
            dimension: 'D7'
          }
        });
      }
    }
    if (!passes(audit, 'W7')) {
      const alreadySuggested = suggestions.some((s) =>
        s.imp.suggestion.includes('@useWhen to key exports')
      );
      if (!alreadySuggested) {
        const targets = skill ? targetsForMissingTag(skill, 'useWhen') : undefined;
        suggestions.push({
          gain: 2,
          imp: {
            suggestion: 'Add @useWhen to key exports (+2 on D7)',
            points: 2,
            dimension: 'D7',
            targets: targets && targets.length > 0 ? targets : undefined
          }
        });
      }
    }
  }

  // D8: E1 (+3), E2 (+3), E3 (+2), E4 (+2)
  if (dims.d8 < MAX_D8 * 0.8) {
    if (!passes(audit, 'E1')) {
      // Use audit issues to find specific symbols missing @param
      const targets = audit.issues
        .filter((i) => i.code === 'E1')
        .slice(0, 5)
        .map((i) => ({ file: i.file, name: i.symbol ?? '(unknown)', kind: 'function' }));
      suggestions.push({
        gain: 3,
        imp: {
          suggestion: 'Add @param descriptions to all parameters (+3 on D8)',
          points: 3,
          dimension: 'D8',
          targets: targets.length > 0 ? targets : undefined
        }
      });
    }
    if (!passes(audit, 'E2')) {
      const targets = audit.issues
        .filter((i) => i.code === 'E2')
        .slice(0, 5)
        .map((i) => ({ file: i.file, name: i.symbol ?? '(unknown)', kind: 'function' }));
      suggestions.push({
        gain: 3,
        imp: {
          suggestion: 'Add @returns descriptions to non-void functions (+3 on D8)',
          points: 3,
          dimension: 'D8',
          targets: targets.length > 0 ? targets : undefined
        }
      });
    }
    if (!passes(audit, 'E3')) {
      suggestions.push({
        gain: 2,
        imp: {
          suggestion: 'Add JSDoc to all interface/type properties (+2 on D8)',
          points: 2,
          dimension: 'D8'
        }
      });
    }
    if (!passes(audit, 'E4')) {
      const alreadySuggested = suggestions.some((s) =>
        s.imp.suggestion.includes('@example code blocks')
      );
      if (!alreadySuggested) {
        suggestions.push({
          gain: 2,
          imp: {
            suggestion: 'Add @example code blocks (+2 on D8)',
            points: 2,
            dimension: 'D8'
          }
        });
      }
    }
  }

  // Sort by gain desc, deduplicate by suggestion text, take top 3
  suggestions.sort((a, b) => b.gain - a.gain);
  const seen = new Set<string>();
  const top: ActionableImprovement[] = [];
  for (const s of suggestions) {
    if (!seen.has(s.imp.suggestion) && top.length < 3) {
      seen.add(s.imp.suggestion);
      top.push(s.imp);
    }
  }

  // Config example: a config skill has no functions to carry @example, so E4
  // never clears via the usual paths. Always surface a single example work item
  // when a `config` surface lacks an example — appended OUTSIDE the top-3 cap so
  // routing-tag improvements (which dominate by gain early on) cannot crowd this
  // one-shot artifact out across a bounded run. The ConfigRefineSource writes the
  // drafted example to a sibling `<config>.example.ts` and reads it back into
  // `skill.examples`.
  if (skill && !passes(audit, 'E4')) {
    const exampleTargets = configExampleTargets(skill);
    if (exampleTargets.length > 0) {
      top.push({
        suggestion: 'Add an @example config file (+2 on D2, +2 on D8)',
        points: 4,
        dimension: 'D2',
        targets: exampleTargets
      });
    }
  }

  // Config per-option completeness: routing-tag dimensions saturate once a few
  // options are tagged (W7/W8/W9 need only one), so the threshold-gated path
  // above leaves the remaining options bare. Append one improvement per routing
  // tag — OUTSIDE the top-3 cap — carrying every still-untagged option, so the
  // loop documents the whole surface, not just enough to clear the rubric.
  if (skill) {
    const ROUTING: ReadonlyArray<{ tag: 'pitfalls' | 'useWhen' | 'avoidWhen'; points: number }> = [
      { tag: 'pitfalls', points: 3 },
      { tag: 'useWhen', points: 2 },
      { tag: 'avoidWhen', points: 2 }
    ];
    for (const { tag, points } of ROUTING) {
      const targets = configOptionTargetsForTag(skill, tag);
      if (targets.length > 0) {
        top.push({
          suggestion: `Add @${tag} to every config option for full per-option coverage`,
          points,
          dimension: tag === 'pitfalls' ? 'D3' : 'D2',
          targets
        });
      }
    }
  }

  return top;
}
