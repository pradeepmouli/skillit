// packages/core/src/refine/loop.ts
import { auditSkill } from '../audit.js';
import { estimateSkillJudgeScore } from '../audit-score.js';
import type { ExtractedSkill, SkillJudgeEstimate } from '../index.js';
import { selectWorkItems } from './select-targets.js';
import type {
  DraftedFix,
  RefineIteration,
  RefineOptions,
  RefineResult,
  RefineStopReason
} from './types.js';

/** @internal — test seam; production callers use the default audit+score path */
export type ScoreSkill = (skill: ExtractedSkill) => SkillJudgeEstimate;

const DEFAULT_PASSING_GRADES: ReadonlyArray<SkillJudgeEstimate['grade']> = ['A'];
const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_ITEMS_PER_ITERATION = 5;

function defaultScore(): ScoreSkill {
  return (skill) => {
    const audit = auditSkill(skill);
    return estimateSkillJudgeScore(audit, skill);
  };
}

/**
 * Total work items currently available across all improvements (uncapped), used
 * as the loop's "backlog" signal. Reuses {@link selectWorkItems} so it counts
 * exactly what would become work — i.e. improvements with a parseable tag and
 * targets. Shrinks as config options get tagged; stays flat when the model is
 * stuck re-drafting the same still-failing targets.
 */
function countAvailableWork(improvements: SkillJudgeEstimate['improvements']): number {
  return selectWorkItems(improvements, Number.POSITIVE_INFINITY).length;
}

export async function refineSkill(
  opts: RefineOptions & { scoreSkill?: ScoreSkill }
): Promise<RefineResult> {
  const {
    source,
    model,
    passingGrades = DEFAULT_PASSING_GRADES,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    itemsPerIteration = DEFAULT_ITEMS_PER_ITERATION,
    onIteration,
    scoreSkill = defaultScore()
  } = opts;

  const passingSet = new Set(passingGrades);
  const iterations: RefineIteration[] = [];
  let skill = await source.extract();
  const guidance = await source.guidance?.();
  let estimate = scoreSkill(skill);

  if (passingSet.has(estimate.grade)) {
    return finished('passed', skill, estimate, iterations, guidance);
  }

  let prevTotal = estimate.total;
  let prevAvailable = countAvailableWork(estimate.improvements);

  for (let i = 0; i < maxIterations; i++) {
    const available = countAvailableWork(estimate.improvements);
    // Plateau: stop early when the score has stalled — but NOT while we're still
    // burning down a backlog of work. Per-option config coverage targets become
    // score-neutral once the routing thresholds (W7/W8/W9) pass, yet each
    // iteration still documents more options; a pure score check would halt that
    // mid-surface. Only plateau when the score is flat AND the available-work
    // pool is not shrinking (the genuinely-stuck case the check exists to catch).
    if (
      i > 0 &&
      i < maxIterations - 1 &&
      estimate.total <= prevTotal &&
      available >= prevAvailable
    ) {
      return finished('plateau', skill, estimate, iterations, guidance);
    }

    const workItems = selectWorkItems(estimate.improvements, itemsPerIteration);
    if (workItems.length === 0) {
      return finished('no-improvements', skill, estimate, iterations, guidance);
    }

    const fixes: DraftedFix[] = [];
    for (const item of workItems) {
      const fn = skill.functions.find((f) => f.name === item.toolName);
      let currentValue: string | undefined;
      if (fn) {
        const tag = item.tag;
        if (tag === 'useWhen' || tag === 'avoidWhen' || tag === 'pitfalls') {
          currentValue = fn.mcpMetadata?.toSkills?.[tag]?.[0];
        } else {
          currentValue = fn.tags[tag] as string | undefined;
        }
      }
      let draft = await model.draft({
        toolName: item.toolName,
        tag: item.tag,
        suggestion: item.improvement.suggestion,
        currentValue,
        skill,
        guidance
      });
      const review = await model.review({
        toolName: item.toolName,
        tag: item.tag,
        draft,
        suggestion: item.improvement.suggestion,
        skill,
        guidance
      });
      if (review.verdict === 'revise') {
        draft = await model.draft({
          toolName: item.toolName,
          tag: item.tag,
          suggestion: review.feedback,
          currentValue: draft,
          skill,
          guidance
        });
      }
      fixes.push({ toolName: item.toolName, tag: item.tag, value: draft });
    }

    await source.applyFixes(fixes);
    prevTotal = estimate.total;
    prevAvailable = available;
    skill = await source.extract();
    estimate = scoreSkill(skill);

    const iteration: RefineIteration = { iteration: i + 1, estimate, workItems, fixes };
    iterations.push(iteration);
    onIteration?.(iteration);

    if (passingSet.has(estimate.grade)) {
      return finished('passed', skill, estimate, iterations, guidance);
    }
  }

  return finished('max-iterations', skill, estimate, iterations, guidance);
}

function finished(
  stoppedReason: RefineStopReason,
  finalSkill: ExtractedSkill,
  finalEstimate: SkillJudgeEstimate,
  iterations: readonly RefineIteration[],
  guidance: string | undefined
): RefineResult {
  return {
    iterations,
    finalSkill,
    finalEstimate,
    passed: stoppedReason === 'passed',
    stoppedReason,
    guidance
  };
}
