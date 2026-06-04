// packages/client/src/__tests__/cli-adapters.test.ts
import { describe, it, expect } from 'vitest';
import { claudeAdapter, codexAdapter, copilotAdapter, adapterFor } from '../model/cli/adapters.js';
import { DRAFTER, REVIEWER } from '../model/models.js';

describe('claudeAdapter', () => {
  it('maps draft role to the drafter model and review role to the reviewer model', () => {
    const draft = claudeAdapter.invocation('draft', 'PROMPT');
    expect(draft.cmd).toBe('claude');
    expect(draft.args).toEqual(['-p', '--output-format', 'json', '--model', DRAFTER]);
    expect(draft.input).toBe('PROMPT');
    const review = claudeAdapter.invocation('review', 'PROMPT');
    expect(review.args).toContain(REVIEWER);
  });

  it('extracts result from the claude json envelope', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: false, result: 'the answer' });
    expect(claudeAdapter.extractResult(stdout)).toBe('the answer');
  });

  it('throws when claude reports is_error', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: true, result: 'nope' });
    expect(() => claudeAdapter.extractResult(stdout)).toThrow(/claude/i);
  });

  it('returns an empty result string (does not editorialize)', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: false, result: '' });
    expect(claudeAdapter.extractResult(stdout)).toBe('');
  });
});

describe('codexAdapter', () => {
  it('invokes codex exec --json with the prompt on stdin and no per-role model', () => {
    const inv = codexAdapter.invocation('draft', 'PROMPT');
    expect(inv.cmd).toBe('codex');
    expect(inv.args).toEqual(['exec', '--json']);
    expect(inv.input).toBe('PROMPT');
    // role-agnostic: review uses the same invocation
    expect(codexAdapter.invocation('review', 'PROMPT').args).toEqual(['exec', '--json']);
  });

  it('extracts the last agent_message from the jsonl stream, skipping log/noise lines', () => {
    const stdout = [
      'some non-json log line',
      JSON.stringify({ type: 'thread.started', thread_id: 'x' }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'final' } }),
      JSON.stringify({ type: 'turn.completed' })
    ].join('\n');
    expect(codexAdapter.extractResult(stdout)).toBe('final');
  });

  it('returns an empty final agent_message, overriding an earlier non-empty one (last-wins on empty)', () => {
    const stdout = [
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '' } })
    ].join('\n');
    expect(codexAdapter.extractResult(stdout)).toBe('');
  });

  it('throws when no agent_message is present', () => {
    expect(() => codexAdapter.extractResult('{"type":"turn.completed"}')).toThrow(/codex/i);
  });

  it('surfaces a turn.failed signal in the no-message error', () => {
    const stdout = JSON.stringify({ type: 'turn.failed' });
    expect(() => codexAdapter.extractResult(stdout)).toThrow(/turn\.failed/);
  });
});

describe('copilotAdapter', () => {
  it('pipes the prompt via stdin (not argv) so untrusted content stays out of argv', () => {
    const inv = copilotAdapter.invocation('draft', 'PROMPT');
    expect(inv.cmd).toBe('copilot');
    expect(inv.args).toEqual(['--output-format', 'json', '--no-color']);
    expect(inv.args).not.toContain('PROMPT');
    expect(inv.input).toBe('PROMPT');
  });

  it('extracts the last assistant.message content from the jsonl stream, skipping deltas/result', () => {
    const stdout = [
      JSON.stringify({ type: 'assistant.message_delta', data: { deltaContent: 'the ' } }),
      JSON.stringify({ type: 'assistant.message_delta', data: { deltaContent: 'answer' } }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'the answer', toolRequests: [] }
      }),
      JSON.stringify({ type: 'result', exitCode: 0 })
    ].join('\n');
    expect(copilotAdapter.extractResult(stdout)).toBe('the answer');
  });

  it('returns an empty assistant.message content (does not editorialize)', () => {
    const stdout = [
      JSON.stringify({ type: 'assistant.message', data: { content: 'first', toolRequests: [] } }),
      JSON.stringify({ type: 'assistant.message', data: { content: '', toolRequests: [] } })
    ].join('\n');
    expect(copilotAdapter.extractResult(stdout)).toBe('');
  });

  it('throws when no assistant.message is present', () => {
    expect(() => copilotAdapter.extractResult('{"type":"result","exitCode":0}')).toThrow(
      /copilot/i
    );
  });

  it('surfaces a nonzero result exitCode in the no-message error', () => {
    const stdout = JSON.stringify({ type: 'result', exitCode: 1 });
    expect(() => copilotAdapter.extractResult(stdout)).toThrow(/exitCode 1/);
  });
});

describe('adapterFor', () => {
  it('returns the matching adapter', () => {
    expect(adapterFor('claude')).toBe(claudeAdapter);
    expect(adapterFor('codex')).toBe(codexAdapter);
    expect(adapterFor('copilot')).toBe(copilotAdapter);
  });
});
