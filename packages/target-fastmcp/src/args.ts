/**
 * fastmcp argument encoder — converts classifier output into fastmcp CLI argv shape.
 *
 * @remarks
 * fastmcp (the Python `fastmcp` / `pyfastmcp call` CLI,
 * https://gofastmcp.com) accepts tool arguments in a single uniform form:
 *
 * - `key=value` — fastmcp parses the right-hand side based on the tool's
 *   declared schema, so we do NOT use a typed `key:=value` variant the way
 *   mcpc does. Numbers, booleans, enums, and string-arrays all share the
 *   same `key=<placeholder>` shape; the placeholder text describes the
 *   accepted value(s) for human readers.
 *
 * For Tier 3 fallback (anything we couldn't safely flatten), we emit a
 * single `--input-json '<JSON-payload>'` argument. fastmcp's structured-input
 * convention for passing whole-object payloads is the `--input-json` flag.
 * The payload is a placeholder — this encoder is for documentation
 * rendering, not runtime invocation, so actual values are substituted by
 * the consumer at call time.
 *
 * @module args
 */

import type { ParameterPlan } from '@skillit/mcp';

/** Encoder result — separated into normal flags vs Tier 3 fallback. */
export interface EncodedArgs {
  /**
   * Encoded arguments for Tier 1 + Tier 2 plans, one string per CLI token.
   * Order matches insertion order of the input plan map (which itself
   * preserves classifier walk order).
   */
  tier12: string[];
  /**
   * When ANY plan in the input has `tier === 3`, this is the single
   * `--input-json '<JSON-payload>'` token string. Otherwise `null`. fastmcp
   * accepts one `--input-json` per call carrying the structural arguments
   * that couldn't be flattened into typed flags.
   */
  tier3Fallback: string | null;
}

/**
 * Encode a classifier plan map as fastmcp argv tokens (documentation form).
 *
 * Encoding rules per tier:
 *
 * - Tier 1 + `type === 'scalar'` + scalarType `string` → `<path>=<value>`.
 * - Tier 1 + `type === 'scalar'` + scalarType `number`/`integer` → `<path>=<value>`.
 * - Tier 1 + `type === 'scalar'` + scalarType `boolean` → `<path>=<true|false>`.
 * - Tier 1 + `type === 'enum'` → `<path>=<one-of-...>`.
 * - Tier 1 + `type === 'string-array'` → `<path>=<comma-separated>`
 *   (fastmcp accepts CSV for repeatable string args).
 * - Tier 2 → same as the leaf's Tier 1 form, with `<path>` joined by `.`.
 * - Tier 3 → contributes nothing to `tier12`; sets `tier3Fallback`.
 *
 * Path is always joined with `.` (matches mcpc convention; fastmcp resolves
 * dotted keys against nested schema properties).
 *
 * @param plan - classifier output (`Map<string, ParameterPlan>`)
 * @returns split encoding result — Tier 1/2 tokens + optional Tier 3 fallback string
 */
export function encodeFastMcpArgs(plan: Map<string, ParameterPlan>): EncodedArgs {
  const tier12: string[] = [];
  let hasTier3 = false;

  for (const [, p] of plan) {
    if (p.tier === 3) {
      hasTier3 = true;
      continue;
    }
    const key = p.path.join('.');
    tier12.push(encodeOne(key, p));
  }

  return {
    tier12,
    tier3Fallback: hasTier3 ? `--input-json '<JSON-payload>'` : null
  };
}

function encodeOne(key: string, plan: ParameterPlan): string {
  // Tier 1/2 leaves only — Tier 3 (`type: 'json'`) short-circuited in the
  // caller. We still cover the `'json'` arm explicitly so `switch` is
  // exhaustive and TS proves no arm is missed.
  switch (plan.type) {
    case 'scalar': {
      if (plan.scalarType === 'boolean') return `${key}=<true|false>`;
      // string / number / integer — fastmcp parses by schema.
      return `${key}=<value>`;
    }
    case 'enum':
      // DU guarantees `plan.enum.length >= 1`.
      return `${key}=<one-of-${plan.enum.join('|')}>`;
    case 'string-array':
      return `${key}=<comma-separated>`;
    case 'json':
      // Defensive: callers filter Tier 3 above. fastmcp accepts
      // `key=<value>` as a JSON literal when the schema demands it.
      return `${key}=<value>`;
    default: {
      const _exhaustive: never = plan;
      throw new Error(`encodeOne: unhandled ParameterPlan arm: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
