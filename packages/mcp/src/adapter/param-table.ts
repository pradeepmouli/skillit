/**
 * Markdown parameter table renderer for CLI-as-proxy adapters.
 *
 * @remarks
 * Both `@skillit/target-mcpc` and `@skillit/target-fastmcp` need to
 * document each tool's parameters as a Markdown table whose CLI Flag/Key
 * column is encoded by the adapter (mcpc uses `key=` / `key:=`, fastmcp
 * always uses `key=`). This module owns the table layout; adapters supply
 * an `encodeFlag` callback that turns a `ParameterPlan` into the rendered
 * flag string.
 *
 * Columns: `MCP Name | CLI Flag/Key | Type | Required | Description`.
 *
 * Tier 3 plans don't have a per-leaf flag — adapters typically encode them
 * as a single `--json` payload row. Callers decide how their `encodeFlag`
 * represents that case (this renderer simply prints whatever the callback
 * returns).
 *
 * @module param-table
 */

import type { ExtractedFunction, ExtractedParameter } from '@skillit/core';
import type { ParameterPlan } from './classify.js';

/**
 * Render a Markdown table mapping a tool's MCP parameters to their CLI flag
 * encoding.
 *
 * @param tool - the tool whose parameters will be rendered (`tool.parameters`)
 * @param plan - classifier output keyed by dot-notation path (Map from `classifyParameters`)
 * @param encodeFlag - adapter-specific encoder turning a `ParameterPlan` into a flag string
 * @returns Markdown table (no leading/trailing newline; caller is responsible for surrounding whitespace)
 *
 * @example
 * ```ts
 * const table = renderCliParamTable(tool, plan, (p) => `${p.path.join('.')}=<value>`);
 * ```
 */
export function renderCliParamTable(
  tool: ExtractedFunction,
  plan: Map<string, ParameterPlan>,
  encodeFlag: (plan: ParameterPlan) => string
): string {
  const lines: string[] = [];
  lines.push('| MCP Name | CLI Flag/Key | Type | Required | Description |');
  lines.push('| -------- | ------------ | ---- | -------- | ----------- |');

  // Drive the rows off the parameter list (preserves declaration order from
  // the IR). For each parameter, look up its plan by name. If absent (which
  // happens when a parameter has no schema info), skip — better to omit than
  // to print misleading rows.
  const rows: string[] = [];
  for (const param of tool.parameters) {
    const matched = findPlanForParameter(plan, param);
    if (!matched) {
      // Fall back to a stub row so the table remains useful — lacking a
      // ParameterPlan, we can't encode the flag, but we still document the
      // MCP name + description for the consumer.
      rows.push(
        `| ${escape(param.name)} |  | ${escape(param.type)} | ${param.optional ? 'no' : 'yes'} | ${escape(param.description)} |`
      );
      continue;
    }
    for (const [, p] of matched) {
      const flag = escape(encodeFlag(p));
      const typeLabel = describeType(p);
      const required = p.required ? 'yes' : 'no';
      const description = describeParam(param, p);
      const mcpName = p.path.join('.');
      rows.push(
        `| ${escape(mcpName)} | ${flag} | ${typeLabel} | ${required} | ${escape(description)} |`
      );
    }
  }

  // Tier 2 plans expand a single MCP parameter into multiple rows; Tier 3
  // collapses to one row. Both cases are already handled above by iterating
  // over the matched submap of plans.

  if (rows.length === 0) {
    // Empty table is still a valid Markdown table — but documenting that
    // there are no parameters is more useful than an empty grid.
    return '_No parameters._';
  }

  lines.push(...rows);
  return lines.join('\n');
}

/**
 * Find every ParameterPlan keyed under a given top-level parameter name.
 * Returns a sub-map preserving insertion order. Tier 1/3 plans yield exactly
 * one entry; Tier 2 plans yield one entry per flattened leaf.
 */
function findPlanForParameter(
  plan: Map<string, ParameterPlan>,
  param: ExtractedParameter
): Map<string, ParameterPlan> | null {
  const out = new Map<string, ParameterPlan>();
  for (const [key, p] of plan) {
    if (p.path[0] === param.name) {
      out.set(key, p);
    }
  }
  return out.size > 0 ? out : null;
}

function describeType(p: ParameterPlan): string {
  switch (p.type) {
    case 'enum':
      // DU guarantees `p.enum` is a non-empty list.
      return `enum(${p.enum.join('\\|')})`;
    case 'string-array':
      return 'string[]';
    case 'json':
      return 'json';
    case 'scalar':
      // DU guarantees `p.scalarType` is set on the 'scalar' arm.
      return p.scalarType;
    default: {
      const _exhaustive: never = p;
      throw new Error(`describeType: unhandled ParameterPlan arm: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function describeParam(param: ExtractedParameter, plan: ParameterPlan): string {
  if (plan.path.length === 1) return param.description;
  // Tier 2 leaf: description should still hint at the parent property's
  // documentation, but we only have the parent's description in the IR.
  // Prefix with the dotted path so the reader knows which leaf this is.
  return param.description ? `${plan.path.join('.')} — ${param.description}` : plan.path.join('.');
}

/**
 * Escape pipe characters and backslashes in cell content so Markdown tables
 * don't break. Backslashes are escaped FIRST so a literal `\|` in input
 * doesn't get double-encoded; otherwise we'd emit `\\|` which a Markdown
 * parser reads as "escaped backslash then unescaped pipe" — a row break.
 */
function escape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}
