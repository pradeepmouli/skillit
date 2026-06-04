// packages/client/src/model/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { DraftRequest, ReviewRequest, ReviewResult, ModelClient } from '@to-skills/core';
import { DRAFTER, REVIEWER, MAX_TOKENS } from './models.js';

export function parseReviewVerdict(text: string): ReviewResult {
  // Prefer {"verdict" anchor to skip stray {braces} in prose.
  // Fall back to the first { if the model omits the verdict key.
  // Depth-scan for the matching }, skipping { and } inside JSON string values.
  const verdictAnchor = text.indexOf('{"verdict"');
  const start = verdictAnchor !== -1 ? verdictAnchor : text.indexOf('{');
  if (start === -1) return { verdict: 'accepted', feedback: '' };
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      if (--depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return { verdict: 'accepted', feedback: '' };
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<ReviewResult>;
    return {
      verdict: parsed.verdict === 'revise' ? 'revise' : 'accepted',
      feedback: parsed.feedback ?? ''
    };
  } catch {
    return { verdict: 'accepted', feedback: '' };
  }
}

export function buildDraftPrompt(req: DraftRequest): string {
  const parts = [
    `You are improving skill annotations for "${req.skill.name}".`,
    `Tool: ${req.toolName}`,
    `Tag to fill: @${req.tag}`,
    `Guidance: ${req.suggestion}`,
    req.currentValue ? `Current value:\n${req.currentValue}` : 'No current value.',
    'Write only the annotation content — no code fences, no extra commentary.'
  ];
  if (req.guidance) {
    parts.push(`Conventions (follow these):\n${req.guidance}`);
  }
  return parts.join('\n\n');
}

export function buildReviewPrompt(req: ReviewRequest): string {
  const parts = [
    `You are reviewing a skill annotation draft for "${req.skill.name}".`,
    `Tool: ${req.toolName}, Tag: @${req.tag}`,
    `Guidance the drafter was given: ${req.suggestion}`,
    `Draft:\n${req.draft}`
  ];
  if (req.guidance) {
    parts.push(`Conventions (follow these):\n${req.guidance}`);
  }
  parts.push(
    'Respond with JSON only: {"verdict":"accepted"|"revise","feedback":"..."}.',
    'Accept if the draft meaningfully addresses the guidance. Revise if it is vague or incorrect.'
  );
  return parts.join('\n\n');
}

export class AnthropicModelClient implements ModelClient {
  private client = new Anthropic();

  async draft(req: DraftRequest): Promise<string> {
    const prompt = buildDraftPrompt(req);

    const msg = await this.client.messages.create({
      model: DRAFTER,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    });
    const block = msg.content[0];
    if (!block || block.type !== 'text') {
      throw new Error(`Unexpected response from ${DRAFTER}: no text block`);
    }
    return block.text.trim();
  }

  async review(req: ReviewRequest): Promise<ReviewResult> {
    const prompt = buildReviewPrompt(req);

    const msg = await this.client.messages.create({
      model: REVIEWER,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    });
    const block = msg.content[0];
    if (!block || block.type !== 'text') {
      throw new Error(`Unexpected response from ${REVIEWER}: no text block`);
    }
    return parseReviewVerdict(block.text);
  }
}
