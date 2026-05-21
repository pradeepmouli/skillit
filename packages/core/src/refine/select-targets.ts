// packages/core/src/refine/select-targets.ts
import type { ActionableImprovement } from '../index.js';
import type { RefineTag, RefineWorkItem } from './types.js';

const TAG_RE = /@(\w+)/;

export function parseTag(suggestion: string): RefineTag | undefined {
  const match = suggestion.match(TAG_RE);
  if (!match) return undefined;
  const tag = match[1] as RefineTag;
  const valid: ReadonlySet<RefineTag> = new Set([
    'useWhen',
    'avoidWhen',
    'pitfalls',
    'remarks',
    'example'
  ]);
  return valid.has(tag) ? tag : undefined;
}

export function selectWorkItems(
  improvements: readonly ActionableImprovement[],
  limit: number
): RefineWorkItem[] {
  const items: RefineWorkItem[] = [];
  for (const imp of improvements) {
    const tag = parseTag(imp.suggestion);
    if (!tag) continue;
    const targets = imp.targets ?? [];
    for (const target of targets) {
      items.push({ toolName: target.name, tag, improvement: imp });
    }
  }
  items.sort((a, b) => b.improvement.points - a.improvement.points);
  return items.slice(0, limit);
}
