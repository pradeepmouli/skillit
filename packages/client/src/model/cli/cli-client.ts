// packages/client/src/model/cli/cli-client.ts
import type { DraftRequest, ReviewRequest, ReviewResult, ModelClient } from '@to-skills/core';
import { buildDraftPrompt, buildReviewPrompt, parseReviewVerdict } from '../anthropic.js';
import { runCli, type RunCliOptions } from './run.js';
import type { CliAdapter } from './adapters.js';

/** Injectable process runner (defaults to the real `runCli`). */
export type CliRunner = (opts: RunCliOptions) => Promise<string>;

export interface CliModelClientOptions {
  runner?: CliRunner;
  timeoutMs?: number;
}

/**
 * A {@link ModelClient} that drives an agent CLI (claude/codex/copilot) instead
 * of the Anthropic API. Reuses the shared prompt builders and verdict parser;
 * only the transport differs.
 */
export class CliModelClient implements ModelClient {
  private readonly runner: CliRunner;
  private readonly timeoutMs?: number;

  constructor(
    private readonly adapter: CliAdapter,
    options: CliModelClientOptions = {}
  ) {
    this.runner = options.runner ?? runCli;
    this.timeoutMs = options.timeoutMs;
  }

  private async run(role: 'draft' | 'review', prompt: string): Promise<string> {
    const inv = this.adapter.invocation(role, prompt);
    const stdout = await this.runner({
      cmd: inv.cmd,
      args: inv.args,
      ...(inv.input !== undefined ? { input: inv.input } : {}),
      ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {})
    });
    return this.adapter.extractResult(stdout);
  }

  async draft(req: DraftRequest): Promise<string> {
    const result = await this.run('draft', buildDraftPrompt(req));
    return result.trim();
  }

  async review(req: ReviewRequest): Promise<ReviewResult> {
    const result = await this.run('review', buildReviewPrompt(req));
    return parseReviewVerdict(result);
  }
}
