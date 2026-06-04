import { describe, it, expect } from 'vitest';
import { createModelClient } from '../model/model-client-factory.js';
import { AnthropicModelClient } from '../model/anthropic.js';
import { CliModelClient } from '../model/cli/cli-client.js';

describe('createModelClient', () => {
  it("returns an AnthropicModelClient for 'api'", () => {
    expect(createModelClient('api')).toBeInstanceOf(AnthropicModelClient);
  });

  it('returns a CliModelClient for a cli kind whose binary is present', () => {
    // inject a pre-flight that reports the binary exists
    const client = createModelClient('claude', { hasBinary: () => true });
    expect(client).toBeInstanceOf(CliModelClient);
  });

  it('throws an actionable error when the cli binary is missing', () => {
    expect(() => createModelClient('codex', { hasBinary: () => false })).toThrow(
      /codex CLI not found on PATH.*--model-client api/s
    );
  });

  it('throws on an invalid kind', () => {
    expect(() => createModelClient('bogus')).toThrow(
      /invalid --model-client.*api\|claude\|codex\|copilot/s
    );
  });
});
