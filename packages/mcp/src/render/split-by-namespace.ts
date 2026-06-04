/**
 * Namespace-splitting for `references/tools.md` (FR-022).
 *
 * MCP servers that aggregate multiple upstream APIs commonly publish tools
 * with dotted prefixes — e.g. `github.issues.create`, `github.pulls.merge`,
 * `slack.channels.list`. When such a server has enough tools that a single
 * `references/tools.md` would blow past the per-file token budget (default
 * 4000 tokens), the renderer chops the list into namespace-scoped files —
 * `references/tools-github.md`, `references/tools-slack.md`, etc. — so each
 * file stays loadable independently.
 *
 * Tools without a `.` in their name go into a default `tools` group. When
 * the entire surface fits inside the budget, this helper returns a single
 * group named `tools` so adapters can keep emitting the conventional
 * `references/tools.md` filename.
 *
 * @module render/split-by-namespace
 */

import type { ExtractedFunction } from '@skillit/core';

/**
 * One output group from `splitToolsByNamespace`. The `name` becomes the
 * filename suffix: `tools` → `references/tools.md`, `github` →
 * `references/tools-github.md`.
 *
 * @public
 */
export interface NamespaceGroup {
  /** Filename suffix — `tools` for un-split, otherwise the namespace prefix. */
  readonly name: string;
  /** Subset of tools belonging to this group, in source order. */
  readonly tools: readonly ExtractedFunction[];
}

/**
 * Split a flat list of tools into namespace groups when the rendered
 * `tools.md` would exceed `maxTokens`. Groups by the first `.` segment in
 * each tool name; tools without a `.` go into a default `tools` group.
 *
 * Behaviour:
 *
 * 1. Estimate the cost of rendering ALL tools via the supplied
 *    `estimateGroupTokens` callback. If `≤ maxTokens`, returns
 *    `[{ name: 'tools', tools }]` — no split.
 * 2. Otherwise group by first `.` segment and return one entry per
 *    namespace, preserving source order within each group.
 *
 * The caller (an adapter's `renderToolsReference`) maps each group to a
 * `RenderedFile` with filename `<skillName>/references/tools-<name>.md`,
 * or `tools.md` when the single-group `name === 'tools'` short-circuit
 * fires.
 *
 * Notes on grouping:
 *
 * - Tools without a `.` always join the default `tools` group. When the
 *   server is mostly namespaced but has a few top-level tools, the split
 *   output will contain `tools-<ns>.md` files plus a `tools-tools.md`
 *   bucket. That's a deliberate trade-off — the alternative (special-casing
 *   the un-namespaced bucket as `tools.md`) would produce filenames that
 *   collide with the un-split output and confuse downstream tooling.
 * - We do not recurse into deeper segments (`github.issues.*` and
 *   `github.pulls.*` both join `github`). FR-022 specifies first-segment
 *   only; deeper splitting can be a future iteration if real servers warrant it.
 *
 * @param tools — the flat tool list, typically `skill.functions`
 * @param estimateGroupTokens — callback that reports the token cost of
 *   rendering a particular subset (the renderer computes this exactly the
 *   way the adapter's body would, so split decisions match real output)
 * @param maxTokens — per-file token budget (default 4000 in adapters)
 * @returns one or more groups, in source-encountered namespace order
 *
 * @public
 */
export function splitToolsByNamespace(
  tools: readonly ExtractedFunction[],
  estimateGroupTokens: (subset: readonly ExtractedFunction[]) => number,
  maxTokens: number
): NamespaceGroup[] {
  // Empty input → empty output. The adapter is expected to skip emission
  // entirely in that case (matches the existing `if (functions.length === 0)`
  // guard at the top of each `renderToolsReference`).
  if (tools.length === 0) return [];

  // Step 1: does the full list fit? If so, no split.
  if (estimateGroupTokens(tools) <= maxTokens) {
    return [{ name: 'tools', tools }];
  }

  // Step 2: group by first `.` segment, preserving insertion order.
  const groups = new Map<string, ExtractedFunction[]>();
  for (const tool of tools) {
    const dotIdx = tool.name.indexOf('.');
    const ns = dotIdx > 0 ? tool.name.slice(0, dotIdx) : 'tools';
    const existing = groups.get(ns);
    if (existing) {
      existing.push(tool);
    } else {
      groups.set(ns, [tool]);
    }
  }

  // If everything ended up in one bucket (no namespaces present in the
  // dataset), the split is degenerate — caller still gets a single group
  // but the name reflects what we found rather than the pre-split default.
  // This typically happens when the surface is dominated by one namespace
  // like all-`github.*` or all-un-namespaced.
  return Array.from(groups, ([name, groupTools]) => ({ name, tools: groupTools }));
}
