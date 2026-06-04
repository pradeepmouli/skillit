import { describe, expect, it } from 'vitest';
import type { ExtractedPrompt, ExtractedResource } from '@skillit/core';
import { renderPromptsReference, renderResourcesReference } from '@skillit/core';

describe('renderResourcesReference', () => {
  it('returns null for empty input', () => {
    expect(renderResourcesReference([], { skillName: 'sk', maxTokens: 4000 })).toBeNull();
  });

  it('renders a single resource without MIME type', () => {
    const resources: ExtractedResource[] = [{ uri: 'file:///a', name: 'A', description: 'desc' }];
    const file = renderResourcesReference(resources, { skillName: 'sk', maxTokens: 4000 });

    expect(file).not.toBeNull();
    expect(file!.filename).toBe('sk/references/resources.md');
    expect(file!.content).toContain('# Resources');
    expect(file!.content).toContain('## A');
    expect(file!.content).toContain('**URI**: `file:///a`');
    expect(file!.content).toContain('desc');
    expect(file!.content).not.toContain('**MIME type**');
    expect(file!.tokens).toBeGreaterThan(0);
  });

  it('includes MIME type when present', () => {
    const resources: ExtractedResource[] = [
      { uri: 'file:///a', name: 'A', description: 'desc', mimeType: 'text/plain' }
    ];
    const file = renderResourcesReference(resources, { skillName: 'sk', maxTokens: 4000 });

    expect(file).not.toBeNull();
    expect(file!.content).toContain('**MIME type**: `text/plain`');
  });

  it('separates multiple resources with horizontal rules', () => {
    const resources: ExtractedResource[] = [
      { uri: 'file:///a', name: 'A', description: 'first' },
      { uri: 'file:///b', name: 'B', description: 'second' }
    ];
    const file = renderResourcesReference(resources, { skillName: 'sk', maxTokens: 4000 });

    expect(file!.content).toContain('## A');
    expect(file!.content).toContain('## B');
    expect(file!.content).toContain('---');
  });
});

describe('renderPromptsReference', () => {
  it('returns null for empty input', () => {
    expect(renderPromptsReference([], { skillName: 'sk', maxTokens: 4000 })).toBeNull();
  });

  it('renders a prompt without arguments — no table', () => {
    const prompts: ExtractedPrompt[] = [{ name: 'p', description: 'd', arguments: [] }];
    const file = renderPromptsReference(prompts, { skillName: 'sk', maxTokens: 4000 });

    expect(file).not.toBeNull();
    expect(file!.filename).toBe('sk/references/prompts.md');
    expect(file!.content).toContain('# Prompts');
    expect(file!.content).toContain('## p');
    expect(file!.content).toContain('d');
    expect(file!.content).not.toContain('| Argument |');
    expect(file!.tokens).toBeGreaterThan(0);
  });

  it('renders an argument table when arguments are present', () => {
    const prompts: ExtractedPrompt[] = [
      {
        name: 'p',
        description: 'd',
        arguments: [{ name: 'a', required: true, description: 'arg desc' }]
      }
    ];
    const file = renderPromptsReference(prompts, { skillName: 'sk', maxTokens: 4000 });

    expect(file!.content).toContain('| Argument | Required | Description |');
    expect(file!.content).toContain('| a | yes | arg desc |');
  });

  it('marks optional arguments as "no"', () => {
    const prompts: ExtractedPrompt[] = [
      {
        name: 'p',
        description: 'd',
        arguments: [{ name: 'opt', required: false, description: 'optional one' }]
      }
    ];
    const file = renderPromptsReference(prompts, { skillName: 'sk', maxTokens: 4000 });
    expect(file!.content).toContain('| opt | no | optional one |');
  });
});
