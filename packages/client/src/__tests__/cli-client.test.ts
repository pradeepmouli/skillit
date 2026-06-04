// packages/client/src/__tests__/cli-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CliModelClient } from '../model/cli/cli-client.js';
import { claudeAdapter } from '../model/cli/adapters.js';
import type { DraftRequest, ReviewRequest, ExtractedSkill } from '@to-skills/core';

const skill = { name: 'demo' } as unknown as ExtractedSkill;
const draftReq: DraftRequest = {
  toolName: 'gen',
  tag: 'useWhen',
  suggestion: 'say when',
  currentValue: undefined,
  skill
};
const reviewReq: ReviewRequest = {
  toolName: 'gen',
  tag: 'useWhen',
  draft: 'When generating',
  suggestion: 'say when',
  skill
};

describe('CliModelClient', () => {
  it('draft() returns the trimmed result extracted from the adapter envelope', async () => {
    const runner = vi.fn(async () =>
      JSON.stringify({ type: 'result', is_error: false, result: '  When generating output  ' })
    );
    const client = new CliModelClient(claudeAdapter, { runner });
    const out = await client.draft(draftReq);
    expect(out).toBe('When generating output');
    // the adapter's invocation was forwarded to the runner
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'claude', args: expect.arrayContaining(['-p']) })
    );
  });

  it('review() parses the verdict JSON out of the adapter result', async () => {
    const runner = vi.fn(async () =>
      JSON.stringify({
        type: 'result',
        is_error: false,
        result: 'Sure: {"verdict":"revise","feedback":"too vague"}'
      })
    );
    const client = new CliModelClient(claudeAdapter, { runner });
    const res = await client.review(reviewReq);
    expect(res).toEqual({ verdict: 'revise', feedback: 'too vague' });
  });

  it('passes the configured timeout through to the runner', async () => {
    const runner = vi.fn(async () =>
      JSON.stringify({ type: 'result', is_error: false, result: 'x' })
    );
    const client = new CliModelClient(claudeAdapter, { runner, timeoutMs: 5000 });
    await client.draft(draftReq);
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 5000 }));
  });
});
