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

function defaultScore(source: RefineOptions['source']): ScoreSkill {
  return (skill) => {
    const audit = auditSkill(skill, source.auditContext(skill));
    return estimateSkillJudgeScore(audit, skill);
  };
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
    scoreSkill = defaultScore(source)
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

  for (let i = 0; i < maxIterations; i++) {
    // Plateau: if this isn't the last allowed iteration and score hasn't improved, stop early.
    if (i > 0 && i < maxIterations - 1 && estimate.total <= prevTotal) {
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
