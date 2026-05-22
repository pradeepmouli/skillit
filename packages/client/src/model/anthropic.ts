// packages/client/src/model/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { DraftRequest, ReviewRequest, ReviewResult, ModelClient } from '@to-skills/core';

const DRAFTER = 'claude-sonnet-4-6';
const REVIEWER = 'claude-opus-4-7';
const MAX_TOKENS = 1024;

export function parseReviewVerdict(text: string): ReviewResult {
  // Non-greedy, no nested braces — avoids ReDoS on adversarial input
  const match = text.match(/\{[^{}]*\}/);
  if (!match) return { verdict: 'accepted', feedback: '' };
  try {
    const parsed = JSON.parse(match[0]) as Partial<ReviewResult>;
    return {
      verdict: parsed.verdict === 'revise' ? 'revise' : 'accepted',
      feedback: parsed.feedback ?? ''
    };
  } catch {
    return { verdict: 'accepted', feedback: '' };
  }
}

export class AnthropicModelClient implements ModelClient {
  private client = new Anthropic();

  async draft(req: DraftRequest): Promise<string> {
    const prompt = [
      `You are improving MCP tool annotations for the skill "${req.skill.name}".`,
      `Tool: ${req.toolName}`,
      `Tag to fill: @${req.tag}`,
      `Guidance: ${req.suggestion}`,
      req.currentValue ? `Current value:\n${req.currentValue}` : 'No current value.',
      'Write only the annotation content — no code fences, no extra commentary.'
    ].join('\n\n');

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
    const prompt = [
      `You are reviewing an MCP tool annotation draft.`,
      `Tool: ${req.toolName}, Tag: @${req.tag}`,
      `Guidance the drafter was given: ${req.suggestion}`,
      `Draft:\n${req.draft}`,
      'Respond with JSON only: {"verdict":"accepted"|"revise","feedback":"..."}.',
      'Accept if the draft meaningfully addresses the guidance. Revise if it is vague or incorrect.'
    ].join('\n\n');

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
