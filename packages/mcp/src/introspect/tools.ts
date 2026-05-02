// MCP tools/list introspection — paginates and maps to ExtractedFunction.

import type { ExtractedFunction, ExtractedParameter } from '@to-skills/core';
import type { JSONSchema7, JSONSchema7TypeName } from 'json-schema';
import { McpError } from '../errors.js';
import type { McpClient, McpToolListEntry } from './client-types.js';
import { paginate } from './paginate.js';
import { resolveSchema } from './schema.js';

/**
 * Enumerate all tools exposed by an MCP server and convert each to the
 * `ExtractedFunction` shape consumed by the renderer.
 *
 * Pagination: the helper repeatedly calls `client.listTools({ cursor })` until
 * the server returns an undefined `nextCursor`. The first call passes no
 * cursor (per the MCP spec, an absent cursor requests the first page).
 *
 * Schema handling: each tool's `inputSchema` is deep-cloned and dereferenced
 * via `resolveSchema` before its top-level properties are mapped to
 * `ExtractedParameter` entries. Tools whose schema fails to resolve due to a
 * cycle, broken `$ref`, or external `$ref` are surfaced with empty
 * `parameters` and a `tags.schemaError === 'true'` marker so the M2 audit rule
 * can flag them. All other resolver errors are propagated.
 *
 * Tools whose `inputSchema` is missing (`undefined`/`null`) produce empty
 * `parameters` without an error — the absence of a schema is a valid signal
 * that the tool takes no input.
 *
 * Tool metadata: `_meta.toSkills.{useWhen, avoidWhen, pitfalls}` is read from
 * each tool's `_meta` envelope and stored in
 * `ExtractedFunction.mcpMetadata.toSkills`. For compatibility with existing
 * renderer paths it is also projected onto `ExtractedFunction.tags` as
 * newline-joined strings plus a `hasMetaToSkills` marker. Skill-level
 * aggregation (`ExtractedSkill.useWhen` etc.) happens in `extract.ts`, which
 * also reads server-level `_meta.toSkills`.
 *
 * @param client structural MCP client (real SDK `Client` or a test mock)
 * @returns one `ExtractedFunction` per tool, in the order returned by the server
 */
export async function listTools(client: McpClient): Promise<ExtractedFunction[]> {
  const all = await paginate<McpToolListEntry>(async (cursor) => {
    const page = await client.listTools(cursor === undefined ? undefined : { cursor });
    return { items: page.tools, nextCursor: page.nextCursor };
  });

  const results: ExtractedFunction[] = [];
  for (const tool of all) {
    results.push(await mapTool(tool));
  }
  return results;
}

/**
 * Convert one `McpToolListEntry` to an `ExtractedFunction`. Splits out so the
 * pagination loop above stays focused on cursor management.
 */
async function mapTool(tool: McpToolListEntry): Promise<ExtractedFunction> {
  const name = tool.name;
  const description = tool.description ?? '';
  const metadata = readToolMetadata(tool);

  // No schema → no parameters. This is not an error condition. Non-object
  // shapes (string/number/array) coming from a misbehaving SDK or server are
  // also treated as "no usable schema" rather than tagged as schemaError —
  // the schemaError tag is reserved for `$ref` cycle failures so that the
  // Phase-9 M2 audit rule can distinguish data-quality issues from cycles.
  if (
    tool.inputSchema === undefined ||
    tool.inputSchema === null ||
    !isPlainObject(tool.inputSchema)
  ) {
    return {
      name,
      description,
      signature: `${name}()`,
      parameters: [],
      returnType: 'unknown',
      examples: [],
      tags: { ...metadata.tags },
      ...(metadata.mcpMetadata ? { mcpMetadata: metadata.mcpMetadata } : {})
    };
  }

  // Deep-clone before passing to resolveSchema so that even if the resolver
  // were ever to mutate, the caller's tool object is safe. (resolveSchema
  // already clones internally — this is belt-and-braces given the schema
  // arrives typed as `unknown`.)
  const rawSchema = tool.inputSchema as JSONSchema7;
  const cloned = structuredClone(rawSchema);

  let resolved: JSONSchema7;
  try {
    resolved = await resolveSchema(cloned);
  } catch (err) {
    // Only swallow schema-cycle errors — every other error type is a bug or
    // environmental failure that should bubble.
    if (err instanceof McpError && err.code === 'SCHEMA_REF_CYCLE') {
      return {
        name,
        description,
        signature: `${name}()`,
        parameters: [],
        returnType: 'unknown',
        examples: [],
        // schemaErrorTool carries the offending tool name so the Phase-9 M2
        // audit rule can name the culprit when it surfaces this row.
        tags: { schemaError: 'true', schemaErrorTool: name, ...metadata.tags },
        mcpMetadata: {
          ...metadata.mcpMetadata,
          schemaError: { kind: 'ref-cycle' }
        }
      };
    }
    throw err;
  }

  const parameters = extractParameters(resolved);
  return {
    name,
    description,
    signature: synthesizeSignature(name, parameters),
    parameters,
    returnType: 'unknown',
    examples: [],
    tags: { ...metadata.tags },
    ...(metadata.mcpMetadata ? { mcpMetadata: metadata.mcpMetadata } : {})
  };
}

/**
 * Read `_meta.toSkills.{useWhen, avoidWhen, pitfalls}` off a tool entry and
 * return structured MCP metadata plus a compatibility tag projection.
 *
 * The MCP spec reserves the `_meta` envelope for extension namespaces; this
 * helper looks for the `toSkills` namespace specifically. Per US7 the values
 * are arrays of strings, so we keep them losslessly on
 * `ExtractedFunction.mcpMetadata.toSkills` and also join them with newlines in
 * the compatibility tag projection.
 *
 * **Malformed handling (US6, FR-H010).** When a recognized field has the
 * wrong shape (non-array, contains non-string entries, contains empty
 * strings), or when `_meta.toSkills` itself is non-object, we write a
 * sentinel tag `metaToSkillsMalformed = <reason>` instead of (or in
 * addition to) the field. The audit rule M3 detects this sentinel and
 * surfaces a warning so authors get a diagnostic — silently dropping
 * malformed annotations is the historical behavior we are replacing.
 *
 * We do NOT throw — this is an additive feature and a healthy extract must
 * never crash because of bad annotation data.
 *
 * `hasMetaToSkills='true'` is set when at least one valid field was
 * populated AND no malformed reason was recorded. Mixed cases (one valid
 * field, one malformed) keep the malformed sentinel and skip the marker;
 * the audit warning is the canonical signal in that case.
 */
function readToolMetadata(tool: McpToolListEntry): {
  tags: Record<string, string>;
  mcpMetadata?: ExtractedFunction['mcpMetadata'];
} {
  const tags: Record<string, string> = {};
  const meta = tool._meta?.['toSkills'];
  if (meta === undefined) return { tags }; // absence is fine
  if (!isPlainObject(meta)) {
    tags['metaToSkillsMalformed'] = `toSkills must be object, got ${typeOfValue(meta)}`;
    return {
      tags,
      mcpMetadata: {
        toSkills: { malformedReason: tags['metaToSkillsMalformed'] }
      }
    };
  }

  const malformedReasons: string[] = [];
  const toSkills: {
    useWhen?: string[];
    avoidWhen?: string[];
    pitfalls?: string[];
  } = {};
  for (const key of ['useWhen', 'avoidWhen', 'pitfalls'] as const) {
    const raw = (meta as Record<string, unknown>)[key];
    if (raw === undefined) continue; // absence is fine
    if (!Array.isArray(raw)) {
      malformedReasons.push(`${key} must be string[], got ${typeOfValue(raw)}`);
      continue;
    }
    const allStrings = raw.every((v) => typeof v === 'string');
    if (!allStrings) {
      malformedReasons.push(`${key} contains non-string entries`);
      continue;
    }
    const allNonEmpty = raw.every((v) => typeof v === 'string' && v.length > 0);
    if (!allNonEmpty) {
      malformedReasons.push(`${key} contains empty strings`);
      continue;
    }
    if (raw.length === 0) continue; // empty array is OK (treated as absent)
    const values = raw as string[];
    tags[key] = values.join('\n');
    toSkills[key] = values;
  }

  if (malformedReasons.length > 0) {
    tags['metaToSkillsMalformed'] = malformedReasons.join('; ');
  }
  // Marker only fires for clean populated metadata. Mixed (some valid, some
  // malformed) cases prefer the explicit malformed sentinel.
  if (
    !tags['metaToSkillsMalformed'] &&
    (tags['useWhen'] !== undefined ||
      tags['avoidWhen'] !== undefined ||
      tags['pitfalls'] !== undefined)
  ) {
    tags['hasMetaToSkills'] = 'true';
  }
  return {
    tags,
    ...(Object.keys(toSkills).length > 0 || malformedReasons.length > 0
      ? {
          mcpMetadata: {
            toSkills: {
              ...toSkills,
              ...(malformedReasons.length > 0
                ? { malformedReason: malformedReasons.join('; ') }
                : {})
            }
          }
        }
      : {})
  };
}

/** Return a human-friendly type label for diagnostic messages. */
function typeOfValue(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * Walk the top-level `properties` of a resolved JSON Schema and produce one
 * `ExtractedParameter` per entry. Nested object structure is summarized via
 * the `type` field only — deep flattening is the renderer adapter's concern,
 * not this introspector's.
 */
function extractParameters(schema: JSONSchema7): ExtractedParameter[] {
  if (!isPlainObject(schema)) return [];
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object') return [];

  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const params: ExtractedParameter[] = [];

  for (const [paramName, raw] of Object.entries(properties)) {
    // JSON Schema `true`/`false` whole-schema is rare but legal. Treat as
    // unknown — there's no structural information to extract.
    if (typeof raw === 'boolean') {
      params.push({
        name: paramName,
        type: 'unknown',
        description: '',
        optional: !required.has(paramName)
      });
      continue;
    }

    const child: JSONSchema7 = raw;
    const param: ExtractedParameter = {
      name: paramName,
      type: deriveTypeLabel(child),
      description: child.description ?? '',
      optional: !required.has(paramName)
    };
    if (child.default !== undefined) {
      param.defaultValue = JSON.stringify(child.default);
    }
    params.push(param);
  }

  return params;
}

/**
 * Render a JSON Schema fragment into a short type label suitable for the
 * `ExtractedParameter.type` field. Order of precedence:
 *   1. `anyOf`/`oneOf`/`allOf` → `'union'`
 *   2. `type === 'array'` → `T[]` if items have a single resolvable type, else `'array'`
 *   3. `type === 'object'` → `'object'`
 *   4. Single primitive → the type name (`'string'`, `'number'`, ...)
 *   5. Fallback → `'unknown'`
 */
function deriveTypeLabel(schema: JSONSchema7): string {
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf) || Array.isArray(schema.allOf)) {
    return 'union';
  }

  const types = normalizeTypes(schema);
  if (!types) return 'unknown';

  if (types.length === 1 && types[0] === 'array') {
    const items = schema.items;
    // items-as-array (tuple form) → falls back to 'array'; only single-schema form gets element-type derivation.
    if (isPlainObject(items)) {
      const itemLabel = deriveTypeLabel(items);
      return `${itemLabel}[]`;
    }
    return 'array';
  }

  if (types.length === 1 && types[0] === 'object') {
    return 'object';
  }

  if (types.length === 1) {
    return types[0] as string;
  }

  // e.g. ['string', 'number'] without anyOf — surface as union.
  return 'union';
}

/**
 * Normalize JSON Schema's `type` field (single string or array of strings)
 * into the non-null type list. Returns null when no usable type is set.
 */
function normalizeTypes(schema: JSONSchema7): JSONSchema7TypeName[] | null {
  const t = schema.type;
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) {
    const nonNull = t.filter((x): x is JSONSchema7TypeName => x !== 'null');
    return nonNull.length > 0 ? nonNull : null;
  }
  return null;
}

function isPlainObject(value: unknown): value is JSONSchema7 {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build a tool signature like `name(arg1, arg2?)`. Required parameters appear
 * bare; optional parameters are suffixed with `?`. Order matches the parameters
 * list (which itself follows `Object.entries` insertion order on `properties`).
 */
function synthesizeSignature(name: string, parameters: ExtractedParameter[]): string {
  if (parameters.length === 0) return `${name}()`;
  const parts = parameters.map((p) => (p.optional ? `${p.name}?` : p.name));
  return `${name}(${parts.join(', ')})`;
}
