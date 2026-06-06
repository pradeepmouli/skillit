// packages/client/src/model/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { DraftRequest, ReviewRequest, ReviewResult, ModelClient } from '@skillit/core';
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
    'Wrap ONLY the annotation content in <answer></answer> tags. Put nothing outside the tags — no preamble, no code fences, no commentary, and no description of what you are about to do.'
  ];
  if (req.guidance) {
    parts.push(`Conventions (follow these):\n${req.guidance}`);
  }
  return parts.join('\n\n');
}

/**
 * Extracts the drafted annotation from a model response.
 *
 * The drafter is instructed (see {@link buildDraftPrompt}) to wrap its answer
 * in `<answer>…</answer>`. We return the inner text so any conversational
 * preamble a chatty backend adds outside the tags (e.g. the `claude` CLI's
 * "Now I have full context… Let me write the annotation.") is discarded.
 * Falls back to the trimmed response when the tags are absent, so a
 * well-behaved backend that omits them still works.
 */
export function extractDraftAnswer(text: string): string {
  const match = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  return (match?.[1] ?? text).trim();
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
    return extractDraftAnswer(block.text);
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
