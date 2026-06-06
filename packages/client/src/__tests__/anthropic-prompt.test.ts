// packages/client/src/__tests__/anthropic-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildDraftPrompt, buildReviewPrompt, extractDraftAnswer } from '../model/anthropic.js';
import type { DraftRequest, ReviewRequest, ExtractedSkill } from '@skillit/core';

const baseSkill = (): ExtractedSkill =>
  ({ name: 'my-tool', functions: [] }) as unknown as ExtractedSkill;

const baseDraftReq = (overrides: Partial<DraftRequest> = {}): DraftRequest => ({
  toolName: 'tool_a',
  tag: 'useWhen',
  suggestion: 'Add @useWhen annotation',
  currentValue: undefined,
  skill: baseSkill(),
  ...overrides
});

const baseReviewReq = (overrides: Partial<ReviewRequest> = {}): ReviewRequest => ({
  toolName: 'tool_a',
  tag: 'useWhen',
  draft: 'Use this tool when listing files',
  suggestion: 'Add @useWhen annotation',
  skill: baseSkill(),
  ...overrides
});

describe('extractDraftAnswer', () => {
  it('returns only the <answer> inner text, discarding chatty preamble', () => {
    const raw =
      'Now I have full context. Let me write the annotation.\n<answer>Use when bootstrapping a project from scratch.</answer>';
    expect(extractDraftAnswer(raw)).toBe('Use when bootstrapping a project from scratch.');
  });

  it('trims the inner text and tolerates multi-line answers', () => {
    expect(extractDraftAnswer('<answer>\n  line one\n  line two\n</answer>')).toBe(
      'line one\n  line two'
    );
  });

  it('falls back to the trimmed response when no <answer> tags are present', () => {
    expect(extractDraftAnswer('  a plain value  ')).toBe('a plain value');
  });
});

describe('buildDraftPrompt', () => {
  it('instructs the model to wrap its answer in <answer> tags', () => {
    expect(buildDraftPrompt(baseDraftReq())).toContain('<answer></answer>');
  });

  it('includes a Conventions section with guidance text when guidance is provided', () => {
    const req = baseDraftReq({ guidance: 'Always use active voice.' });
    const prompt = buildDraftPrompt(req);
    expect(prompt).toContain('Conventions');
    expect(prompt).toContain('Always use active voice.');
  });

  it('does NOT include a Conventions section when guidance is undefined', () => {
    const req = baseDraftReq({ guidance: undefined });
    const prompt = buildDraftPrompt(req);
    expect(prompt).not.toContain('Conventions');
  });

  it('does NOT include a Conventions section when guidance is absent', () => {
    const req = baseDraftReq();
    const prompt = buildDraftPrompt(req);
    expect(prompt).not.toContain('Conventions');
  });

  it('still includes core prompt content regardless of guidance', () => {
    const req = baseDraftReq({ guidance: 'Some guidance.' });
    const prompt = buildDraftPrompt(req);
    expect(prompt).toContain('tool_a');
    expect(prompt).toContain('@useWhen');
  });

  it('uses source-neutral framing (no hardcoded MCP) and keeps guidance', () => {
    const req = baseDraftReq({ guidance: 'CLI conventions: use --flag syntax.' });
    const prompt = buildDraftPrompt(req);
    expect(prompt).not.toContain('MCP');
    expect(prompt).toContain('skill annotations for "my-tool"');
    expect(prompt).toContain('Conventions');
    expect(prompt).toContain('CLI conventions: use --flag syntax.');
  });
});

describe('buildReviewPrompt', () => {
  it('includes a Conventions section with guidance text when guidance is provided', () => {
    const req = baseReviewReq({ guidance: 'Always use active voice.' });
    const prompt = buildReviewPrompt(req);
    expect(prompt).toContain('Conventions');
    expect(prompt).toContain('Always use active voice.');
    expect(prompt.indexOf('Conventions')).toBeLessThan(prompt.indexOf('Respond with JSON only'));
  });

  it('does NOT include a Conventions section when guidance is undefined', () => {
    const req = baseReviewReq({ guidance: undefined });
    const prompt = buildReviewPrompt(req);
    expect(prompt).not.toContain('Conventions');
  });

  it('does NOT include a Conventions section when guidance is absent', () => {
    const req = baseReviewReq();
    const prompt = buildReviewPrompt(req);
    expect(prompt).not.toContain('Conventions');
  });

  it('still includes core prompt content regardless of guidance', () => {
    const req = baseReviewReq({ guidance: 'Some guidance.' });
    const prompt = buildReviewPrompt(req);
    expect(prompt).toContain('tool_a');
    expect(prompt).toContain('@useWhen');
    expect(prompt).toContain('Use this tool when listing files');
  });

  it('uses source-neutral framing (no hardcoded MCP) and keeps guidance + JSON instruction', () => {
    const req = baseReviewReq({ guidance: 'CLI conventions: use --flag syntax.' });
    const prompt = buildReviewPrompt(req);
    expect(prompt).not.toContain('MCP');
    expect(prompt).toContain('skill annotation draft for "my-tool"');
    expect(prompt).toContain('Conventions');
    expect(prompt).toContain('CLI conventions: use --flag syntax.');
    expect(prompt).toContain('Respond with JSON only');
  });
});
