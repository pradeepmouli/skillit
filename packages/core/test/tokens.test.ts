import { describe, it, expect } from 'vitest';
import { estimateTokens, truncateToTokenBudget } from '@skillit/core';

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 -> 3
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('truncateToTokenBudget', () => {
  it('returns text unchanged if within budget', () => {
    const text = 'short text';
    expect(truncateToTokenBudget(text, 100)).toBe(text);
  });

  it('truncates at line boundary when over budget', () => {
    const text = 'line one\nline two\nline three\nline four';
    const result = truncateToTokenBudget(text, 5); // ~20 chars budget
    expect(result).toContain('line one');
    expect(result).toContain('<!-- truncated -->');
  });
});
