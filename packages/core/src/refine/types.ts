// packages/core/src/refine/types.ts
import type {
  ExtractedSkill,
  SkillJudgeEstimate,
  ActionableImprovement,
  AuditContext
} from '../index.js';

export type RefineTag = 'useWhen' | 'avoidWhen' | 'pitfalls' | 'remarks' | 'example';

export interface DraftRequest {
  toolName: string;
  tag: RefineTag;
  suggestion: string;
  currentValue: string | undefined;
  skill: ExtractedSkill;
  guidance?: string;
}

export interface ReviewRequest {
  toolName: string;
  tag: RefineTag;
  draft: string;
  suggestion: string;
  skill: ExtractedSkill;
  guidance?: string;
}

export type ReviewVerdict = 'accepted' | 'revise';

export interface ReviewResult {
  verdict: ReviewVerdict;
  feedback: string;
}

export interface DraftedFix {
  toolName: string;
  tag: RefineTag;
  value: string;
}

export interface ModelClient {
  draft(req: DraftRequest): Promise<string>;
  review(req: ReviewRequest): Promise<ReviewResult>;
}

export interface RefineSource {
  extract(): Promise<ExtractedSkill>;
  auditContext(skill: ExtractedSkill): AuditContext;
  applyFixes(fixes: readonly DraftedFix[]): Promise<void>;
  guidance?(): string | Promise<string>;
}

export interface RefineWorkItem {
  toolName: string;
  tag: RefineTag;
  improvement: ActionableImprovement;
}

export type RefineStopReason = 'passed' | 'max-iterations' | 'no-improvements' | 'plateau';

export interface RefineIteration {
  iteration: number;
  estimate: SkillJudgeEstimate;
  workItems: readonly RefineWorkItem[];
  fixes: readonly DraftedFix[];
}

export interface RefineOptions {
  source: RefineSource;
  model: ModelClient;
  passingGrades?: ReadonlyArray<SkillJudgeEstimate['grade']>;
  maxIterations?: number;
  itemsPerIteration?: number;
  onIteration?: (iteration: RefineIteration) => void;
}

export interface RefineResult {
  iterations: readonly RefineIteration[];
  finalSkill: ExtractedSkill;
  finalEstimate: SkillJudgeEstimate;
  passed: boolean;
  stoppedReason: RefineStopReason;
  guidance: string | undefined;
}
