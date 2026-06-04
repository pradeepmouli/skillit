/**
 * Shared helpers for CLI-as-proxy invocation adapters
 * (`@skillit/target-mcpc`, `@skillit/target-fastmcp`, and any third-party
 * adapter following the same pattern).
 *
 * @remarks
 * These helpers were originally inlined into each adapter's `render.ts` /
 * `setup.ts`. They are byte-identical across adapters except where noted; this
 * module is the single source of truth so adapters import here instead of
 * copying.
 *
 * Exposed via the subpath export `@skillit/mcp/adapter-utils` (NOT from the
 * main `@skillit/mcp` entrypoint — these are adapter-author concerns, not
 * host concerns).
 *
 * @module adapter/cli-tools-helpers
 */

import type { AdapterRenderContext, ExtractedFunction, ExtractedParameter } from '@skillit/core';
import type { JSONSchema7 } from 'json-schema';
import { McpError } from '../errors.js';
import { classifyParameters, type ParameterPlan } from './classify.js';
import { renderCliParamTable } from './param-table.js';

/**
 * Stdio launch shape — mirrors the host's
 * `AdapterRenderContextStdio.launchCommand`.
 *
 * @public
 */
export interface StdioLaunchCommand {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * HTTP endpoint shape — mirrors the host's
 * `AdapterRenderContextHttp.httpEndpoint`.
 *
 * @public
 */
export interface HttpLaunchEndpoint {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Pick the launch shape an adapter's Setup-section renderer needs from an
 * `AdapterRenderContext`. Narrows on `ctx.mode`:
 *
 * 1. **`mode: 'http'`** — emit `{ url, headers? }` shape.
 * 2. **`mode: 'stdio'`** — verbatim stdio command.
 * 3. **`mode: 'bundle'`** — synthesize `{ command: 'npx', args: ['-y', <name>] }`
 *    (or the multi-bin `--package=` form, FR-034).
 *
 * The renderer's invocation-adapter dispatch guarantees `ctx.mode` is set; the
 * `default` branch exists solely for compile-time exhaustiveness.
 *
 * @public
 */
export function resolveLaunchCommand(
  ctx: AdapterRenderContext
): StdioLaunchCommand | HttpLaunchEndpoint {
  switch (ctx.mode) {
    case 'http':
      return ctx.httpEndpoint.headers
        ? { url: ctx.httpEndpoint.url, headers: ctx.httpEndpoint.headers }
        : { url: ctx.httpEndpoint.url };
    case 'stdio':
      return ctx.launchCommand;
    case 'bundle': {
      const args = ctx.binName
        ? ['-y', `--package=${ctx.packageName}`, ctx.binName]
        : ['-y', ctx.packageName];
      return { command: 'npx', args };
    }
    default: {
      // Exhaustiveness check: a new arm without a case here surfaces as a
      // type error on `_exhaustive`. The runtime throw is unreachable
      // because the renderer always sets `mode`.
      const _exhaustive: never = ctx;
      throw new McpError(
        `resolveLaunchCommand: unknown ctx.mode (${String(_exhaustive)})`,
        'MISSING_LAUNCH_COMMAND'
      );
    }
  }
}

/**
 * Format the `targetCliRange` (e.g. `mcpc@^2.1`) into the marker form used in
 * the human-readable fingerprint trace line (e.g. `mcpc 2.1.x`). Falls back
 * to the bare CLI name (or the input verbatim) when the range is missing or
 * unparseable so the fingerprint line remains stable.
 *
 * @public
 */
export function formatCliMarker(targetCliRange: string | undefined): string {
  if (!targetCliRange) return '';
  // Match `<name>@<range>` where range starts with ^/~/= followed by a
  // major.minor pair. Render as "<name> <major>.<minor>.x".
  const fullMatch = targetCliRange.match(/^([^@]+)@[\^~=]?(\d+)\.(\d+)/);
  if (fullMatch) {
    const [, name, major, minor] = fullMatch;
    return `${name} ${major}.${minor}.x`;
  }
  // Major-only fallback (e.g. `<name>@^2` → "<name> 2.x").
  const majorMatch = targetCliRange.match(/^([^@]+)@[\^~=]?(\d+)/);
  if (majorMatch) {
    const [, name, major] = majorMatch;
    return `${name} ${major}.x`;
  }
  // Operators outside [\^~=] (e.g. `>=`, `<`) — strip the @range suffix and
  // return just the package name so the fingerprint line stays human-readable.
  const nameOnly = targetCliRange.match(/^([^@]+)@/);
  if (nameOnly) return nameOnly[1]!;
  return targetCliRange;
}

/**
 * Minimal POSIX shell quoting for tokens emitted into a copy/paste-ready
 * Setup command. Tokens that match `[A-Za-z0-9_./@:=+-]+` are passed
 * verbatim; anything else is wrapped in single quotes with embedded `'`
 * escaped via `'\''`. This keeps the common case (npx, package names,
 * hyphenated args) readable while preventing shell injection or breakage
 * when a token contains spaces, `$`, backticks, or globs.
 *
 * @public
 */
export function shellQuote(token: string): string {
  if (token.length > 0 && /^[A-Za-z0-9_./@:=+-]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

/**
 * Trim runs of trailing newlines down to a single `\n`. We avoid the regex
 * `s.replace(/\n+$/, '\n')` because CodeQL flags the unbounded `+` repeat
 * as a polynomial-ReDoS risk on adversarial input. Manual slice is O(n) and
 * has the same observable behavior.
 *
 * @public
 */
export function collapseTrailingNewlines(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 0x0a) end--;
  return s.slice(0, end) + '\n';
}

/**
 * Adapter-supplied encoder turning a single classified `ParameterPlan` into a
 * one-token CLI flag string. Used by both the per-row table renderer (via
 * `renderCliParamTable`) and by the per-tool argv builder (via
 * `EncodedArgs.tier12`).
 *
 * @public
 */
export type EncodeOne = (plan: ParameterPlan) => string;

/**
 * Pre-encoded argv split — Tier 1+2 typed flags first, optional Tier 3
 * fallback (e.g. `--json '<JSON-payload>'`) appended.
 *
 * Adapters produce this from their per-CLI argument-syntax encoder
 * (`encodeMcpcArgs`, `encodeFastMcpArgs`, ...) and pass it via `EncodeArgv`
 * so `renderToolsBody` can interpolate the rendered command line.
 *
 * @public
 */
export interface EncodedArgs {
  tier12: string[];
  tier3Fallback: string | null;
}

/**
 * Adapter-supplied argv builder. Given the classified plan map, returns the
 * adapter's encoded argv split. This wraps the per-CLI argument-syntax
 * encoder so `renderToolsBody` can produce the command-line block without
 * knowing dialect specifics.
 *
 * @public
 */
export type EncodeArgv = (plan: Map<string, ParameterPlan>) => EncodedArgs;

/**
 * Render the textual body for a (possibly partial) tool list — the shared
 * Markdown layout used by all CLI-as-proxy adapters.
 *
 * Layout:
 * - `# Tools` header
 * - one section per tool: `## <name>`, optional description, fenced
 *   `sh` command line (`{cliVerb} {fn.name} {args...}`), and optional
 *   parameters table
 *
 * `cliVerb` is the per-CLI command prefix INCLUDING any positional skill
 * argument the dialect requires before the tool name. Examples:
 *
 * - mcpc: `'mcpc <skillName> tools-call'` (skillName is the second positional)
 * - fastmcp: `'pyfastmcp call <skillName>'` (skillName is the third positional)
 *
 * @param functions - the tools to document (must be non-empty for a useful body)
 * @param skillName - kebab-case skill identifier (currently unused; reserved for
 *                    future per-tool variations, kept in the signature so the
 *                    contract stays stable)
 * @param encodeOne - per-row encoder for the parameters table (typically a
 *                    closure over the adapter's dialect)
 * @param encodeArgv - per-tool argv builder for the command line
 * @param cliVerb - the CLI verb prefix (already-interpolated `<skillName>`
 *                  if the dialect needs it before the tool name)
 *
 * @public
 */
export function renderToolsBody(
  functions: readonly ExtractedFunction[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _skillName: string,
  encodeOne: EncodeOne,
  encodeArgv: EncodeArgv,
  cliVerb: string
): string {
  const lines: string[] = ['# Tools', ''];
  for (const fn of functions) {
    lines.push(`## ${fn.name}`);
    lines.push('');
    if (fn.description) {
      lines.push(fn.description);
      lines.push('');
    }

    const plan = planForTool(fn);
    const encoded = encodeArgv(plan);

    // Command line — adapter-specific verb prefix + the tool name + encoded
    // argv. Tier 3 fallback (a single token like `--json '...'` or
    // `--input-json '...'`) is appended at the end.
    const argv = [...encoded.tier12];
    if (encoded.tier3Fallback) argv.push(encoded.tier3Fallback);
    const argvSuffix = argv.length > 0 ? ' ' + argv.join(' ') : '';
    lines.push('```sh');
    lines.push(`${cliVerb} ${fn.name}${argvSuffix}`);
    lines.push('```');
    lines.push('');

    if (plan.size > 0) {
      lines.push('### Parameters');
      lines.push('');
      lines.push(renderCliParamTable(fn, plan, encodeOne));
      lines.push('');
    }
  }

  return collapseTrailingNewlines(lines.join('\n'));
}

/**
 * Synthesize a minimal JSON Schema from the IR's `ExtractedParameter` list
 * and classify it. The IR doesn't preserve the original `inputSchema`, so we
 * reconstruct enough structural information for `classifyParameters` to
 * decide tier and scalar type.
 *
 * Type-label mapping:
 * - `'string'` / `'number'` / `'integer'` / `'boolean'` → JSON Schema scalar
 * - `'string[]'` → string array (Tier 1 string-array)
 * - `'object'` → escalates to Tier 3 (we have no nested property info)
 * - anything else (`'union'`, `'array'`, custom labels) → Tier 3
 *
 * @public
 */
export function planForTool(fn: ExtractedFunction): Map<string, ParameterPlan> {
  const properties: Record<string, JSONSchema7> = {};
  const required: string[] = [];

  for (const p of fn.parameters) {
    properties[p.name] = parameterToSchema(p);
    if (!p.optional) required.push(p.name);
  }

  const schema: JSONSchema7 = {
    type: 'object',
    properties
  };
  if (required.length > 0) schema.required = required;

  return classifyParameters(schema);
}

/**
 * Convert a single `ExtractedParameter` to a minimal JSONSchema7 fragment so
 * the classifier can decide its tier and scalar type. Anything not in the
 * Tier 1 type-label whitelist returns an empty schema, which the classifier
 * resolves to Tier 3 (`type: 'json'`).
 *
 * @public
 */
export function parameterToSchema(param: ExtractedParameter): JSONSchema7 {
  const label = param.type.trim();
  if (label === 'string') return { type: 'string' };
  if (label === 'number') return { type: 'number' };
  if (label === 'integer') return { type: 'integer' };
  if (label === 'boolean') return { type: 'boolean' };
  if (label === 'string[]') return { type: 'array', items: { type: 'string' } };
  // Everything else is too ambiguous to classify Tier 1 — give the
  // classifier an empty schema so it falls through to Tier 3.
  return {};
}
