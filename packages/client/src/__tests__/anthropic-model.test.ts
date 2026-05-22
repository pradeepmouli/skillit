// packages/client/src/__tests__/anthropic-model.test.ts
import { describe, it, expect } from 'vitest';
import { parseReviewVerdict } from '../model/anthropic.js';

describe('parseReviewVerdict', () => {
  it('parses accepted verdict', () => {
    const text = 'Looks good. {"verdict":"accepted","feedback":""}';
    expect(parseReviewVerdict(text)).toEqual({ verdict: 'accepted', feedback: '' });
  });

  it('parses revise verdict', () => {
    const text = '{"verdict":"revise","feedback":"Be more specific about edge cases"}';
    expect(parseReviewVerdict(text)).toEqual({
      verdict: 'revise',
      feedback: 'Be more specific about edge cases'
    });
  });

  it('fails open on malformed JSON — returns accepted', () => {
    expect(parseReviewVerdict('not json at all')).toEqual({ verdict: 'accepted', feedback: '' });
  });

  it('fails open on missing verdict field', () => {
    expect(parseReviewVerdict('{"feedback":"ok"}')).toEqual({
      verdict: 'accepted',
      feedback: 'ok'
    });
  });

  it('parses revise verdict when feedback contains braces', () => {
    const text = '{"verdict":"revise","feedback":"handle {edge-case} and {null} inputs"}';
    expect(parseReviewVerdict(text)).toEqual({
      verdict: 'revise',
      feedback: 'handle {edge-case} and {null} inputs'
    });
  });
});
