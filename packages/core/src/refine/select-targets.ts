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
    'never',
    'remarks',
    'example'
  ]);
  return valid.has(tag) ? tag : undefined;
}

export function selectWorkItems(
  improvements: readonly ActionableImprovement[],
  limit: number
): RefineWorkItem[] {
  // Group an improvement's targets together, preserving target order, then rank
  // the groups by points descending.
  const groups: RefineWorkItem[][] = [];
  for (const imp of improvements) {
    const tag = parseTag(imp.suggestion);
    if (!tag) continue;
    const group = (imp.targets ?? []).map((target) => ({
      toolName: target.name,
      tag,
      improvement: imp
    }));
    if (group.length > 0) groups.push(group);
  }
  groups.sort((a, b) => b[0]!.improvement.points - a[0]!.improvement.points);

  // Round-robin across groups rather than draining the highest-points group
  // first: take the Nth target of every group before any (N+1)th. A bounded
  // iteration then spreads across ALL still-failing tags, so a tag with many
  // completeness targets (e.g. `@never` on a wide config surface) can't
  // monopolize the slice and starve `@useWhen`/`@avoidWhen` — which, before the
  // first of those is ever drafted, let the loop's score plateau stop early with
  // those dimensions still failing. With one target per group this is identical
  // to the old points-descending order.
  const items: RefineWorkItem[] = [];
  const maxLen = groups.reduce((m, g) => Math.max(m, g.length), 0);
  for (let round = 0; round < maxLen && items.length < limit; round++) {
    for (const group of groups) {
      const item = group[round];
      if (item) {
        items.push(item);
        if (items.length >= limit) break;
      }
    }
  }
  return items;
}
