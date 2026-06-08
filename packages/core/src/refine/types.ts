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

/**
 * Where an audit/judge target's enrichment surface lives on disk, so a caller
 * (e.g. the agent-bootstrap slash command) can jump straight to the declaration
 * instead of re-deriving the file from `sourceModule`.
 */
export interface TargetLocation {
  /** Absolute or repo-relative path to the file holding the declaration. */
  file: string;
  /** The declaration name to anchor the edit on (export name, interface, or option key). */
  declName: string;
  /** Dot-path into a config type when the target is a single option (e.g. `components.prefix`). */
  propertyPath?: string;
}

export interface RefineSource {
  extract(): Promise<ExtractedSkill>;
  auditContext(skill: ExtractedSkill): AuditContext;
  applyFixes(fixes: readonly DraftedFix[]): Promise<void>;
  guidance?(): string | Promise<string>;
  /**
   * Resolve an improvement target (`{file, name, kind}` from `ActionableImprovement.targets`)
   * to a concrete on-disk location. Optional — a source that cannot resolve a
   * given target returns `undefined`. Used by `skillit audit --json` and the
   * agent-bootstrap loop.
   *
   * The return is a union of sync and async: config/typedoc resolve synchronously,
   * but cli and mcp(build) must read source files, so they return a `Promise`.
   * Callers `await` the result (awaiting a non-Promise is a no-op).
   */
  resolveTargetLocation?(target: {
    name: string;
    kind: string;
    file?: string;
  }): TargetLocation | undefined | Promise<TargetLocation | undefined>;
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
