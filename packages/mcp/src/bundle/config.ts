/**
 * Bundle-mode `package.json` config reader.
 *
 * Reads the host package's `package.json` and parses the `skillit.mcp` field
 * into a normalized array of {@link NormalizedBundleEntry} ready for the bundle
 * orchestrator. Entry-or-array shape, kebab-skill-name validation, invocation-
 * target validation, duplicate-skill-name detection, and `bin` derivation all
 * live here so the orchestrator can stay focused on per-server work.
 *
 * The schema is small — we validate inline rather than pulling in a JSON Schema
 * runtime so the package keeps its zero-dep stance for config parsing.
 *
 * Failure modes (all surface as {@link McpError}):
 *  - `TRANSPORT_FAILED` — package.json missing, malformed JSON, or `skillit.mcp`
 *    field absent. Validation errors (bad schema) also use this code so callers
 *    see a stable IO/config-failure code; the message carries the entry-index
 *    and key for actionable diagnosis.
 *  - `MISSING_LAUNCH_COMMAND` — entry has no `command`, AND `package.json.bin`
 *    is either absent or multi-bin (so it cannot be unambiguously derived).
 *  - `DUPLICATE_SKILL_NAME` — two entries share the same `skillName`.
 *
 * @module bundle/config
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { McpError } from '../errors.js';
import type { InvocationTarget } from '../adapter/types.js';

/**
 * A single MCP-server entry from `skillit.mcp`, normalized against the schema
 * in `contracts/package-json-config.md`.
 *
 * - `command`/`args` are populated either from the user's explicit fields or
 *   derived from `package.json.bin` (single-bin only).
 * - `invocation` is always an array post-normalization (per FR-IT-009).
 *
 * @public
 */
export interface NormalizedBundleEntry {
  readonly skillName: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly invocation: readonly InvocationTarget[];
  /**
   * Multi-bin selector. Set when the entry was derived from (or explicitly
   * targets) a specific key in package.json's multi-bin object. The bundle
   * orchestrator forwards this to the MCP adapter so the emitted skill uses
   * the npx `--package=<pkg> <binName>` form (FR-034).
   */
  readonly binName?: string;
}

/**
 * Internal representation of the host package.json — we only model the fields
 * we actually consume so additions to npm's spec don't churn the type.
 */
interface PackageJson {
  name?: string;
  bin?: string | Record<string, string>;
  files?: string[];
  skillit?: { mcp?: unknown };
}

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const INVOCATION_TARGET_PATTERN = /^(mcp-protocol|cli:[a-z0-9][a-z0-9-]*)$/;

/**
 * Read and normalize `skillit.mcp` from `<packageRoot>/package.json`.
 *
 * Validates each entry against the schema in `contracts/package-json-config.md`,
 * derives missing `command`/`args` from `package.json.bin` when possible, and
 * normalizes `invocation` to an array (defaulting to `['mcp-protocol']`).
 *
 * @param packageRoot — absolute path to the package root (where package.json lives).
 * @returns one {@link NormalizedBundleEntry} per server entry, in source order.
 * @throws McpError per the codes documented at the module level.
 *
 * @internal
 */
export async function readBundleConfig(packageRoot: string): Promise<NormalizedBundleEntry[]> {
  const pkgPath = path.join(packageRoot, 'package.json');
  let raw: string;
  try {
    raw = await readFile(pkgPath, 'utf8');
  } catch (err) {
    throw new McpError(
      `Config-file batch mode: package.json not found at ${packageRoot}`,
      'TRANSPORT_FAILED',
      err
    );
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw) as PackageJson;
  } catch (err) {
    throw new McpError(
      `Failed to parse ${pkgPath}: ${(err as Error).message}`,
      'TRANSPORT_FAILED',
      err
    );
  }

  // Distinguish "no skillit section at all" from "skillit exists but mcp is
  // missing/null" so the error message tells the user exactly what to add.
  const skillitConfig = pkg['skillit'];
  if (skillitConfig === undefined || skillitConfig === null) {
    throw new McpError(
      'skillit section is missing from package.json. Add { "skillit": { "mcp": { "skillName": "..." } } }. See contracts/package-json-config.md',
      'TRANSPORT_FAILED'
    );
  }
  const mcpField = skillitConfig.mcp;
  if (mcpField === undefined || mcpField === null) {
    throw new McpError(
      'skillit.mcp field is required in package.json. See contracts/package-json-config.md',
      'TRANSPORT_FAILED'
    );
  }

  // Normalize entry-or-array → array.
  const rawEntries: unknown[] = Array.isArray(mcpField) ? mcpField : [mcpField];
  if (rawEntries.length === 0) {
    throw new McpError('skillit.mcp must contain at least one server entry.', 'TRANSPORT_FAILED');
  }

  const seenNames = new Set<string>();
  const normalized: NormalizedBundleEntry[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const entry = validateAndNormalize(rawEntries[i], i, pkg, packageRoot);
    if (seenNames.has(entry.skillName)) {
      throw new McpError(
        `Duplicate skillName in skillit.mcp: ${entry.skillName}`,
        'DUPLICATE_SKILL_NAME'
      );
    }
    seenNames.add(entry.skillName);
    normalized.push(entry);
  }
  return normalized;
}

/**
 * Validate a single raw entry from `skillit.mcp` and produce a
 * {@link NormalizedBundleEntry}. Pulls `command`/`args` from the entry first
 * and falls back to `package.json.bin` derivation.
 */
function validateAndNormalize(
  raw: unknown,
  index: number,
  pkg: PackageJson,
  packageRoot: string
): NormalizedBundleEntry {
  const prefix = `entry[${index}]`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new McpError(`${prefix}: must be an object`, 'TRANSPORT_FAILED');
  }
  const obj = raw as Record<string, unknown>;

  // skillName — required, must match kebab pattern.
  const skillName = obj['skillName'];
  if (typeof skillName !== 'string') {
    throw new McpError(`${prefix}.skillName: required string field is missing`, 'TRANSPORT_FAILED');
  }
  if (!SKILL_NAME_PATTERN.test(skillName)) {
    throw new McpError(
      `${prefix}.skillName: '${skillName}' must match /^[a-z0-9][a-z0-9-]*$/`,
      'TRANSPORT_FAILED'
    );
  }

  // args — optional string[].
  let args: string[] | undefined;
  const rawArgs = obj['args'];
  if (rawArgs !== undefined) {
    if (!Array.isArray(rawArgs) || rawArgs.some((a) => typeof a !== 'string')) {
      throw new McpError(`${prefix}.args: must be a string[]`, 'TRANSPORT_FAILED');
    }
    args = rawArgs as string[];
  }

  // env — optional Record<string,string>.
  let env: Record<string, string> | undefined;
  const rawEnv = obj['env'];
  if (rawEnv !== undefined) {
    if (typeof rawEnv !== 'object' || rawEnv === null || Array.isArray(rawEnv)) {
      throw new McpError(`${prefix}.env: must be an object of string values`, 'TRANSPORT_FAILED');
    }
    const envObj = rawEnv as Record<string, unknown>;
    for (const [k, v] of Object.entries(envObj)) {
      if (typeof v !== 'string') {
        throw new McpError(`${prefix}.env.${k}: must be a string`, 'TRANSPORT_FAILED');
      }
    }
    env = envObj as Record<string, string>;
  }

  // binName — optional; selects a specific entry in package.json's multi-bin
  // object so the launch command can be unambiguously derived AND the emitted
  // mcp: frontmatter can use the `--package=<pkg> <binName>` form (FR-034).
  let binName: string | undefined;
  const rawBinName = obj['binName'];
  if (rawBinName !== undefined) {
    if (typeof rawBinName !== 'string' || rawBinName.length === 0) {
      throw new McpError(`${prefix}.binName: must be a non-empty string`, 'TRANSPORT_FAILED');
    }
    binName = rawBinName;
  }

  // command — optional; if absent, derive from bin (using binName when supplied
  // for multi-bin disambiguation).
  let command: string;
  let derivedArgs: string[] | undefined;
  let derivedBinName: string | undefined;
  const rawCommand = obj['command'];
  if (rawCommand !== undefined) {
    if (typeof rawCommand !== 'string' || rawCommand.length === 0) {
      throw new McpError(`${prefix}.command: must be a non-empty string`, 'TRANSPORT_FAILED');
    }
    command = rawCommand;
  } else {
    const derived = deriveFromBin(pkg, packageRoot, skillName, binName);
    command = derived.command;
    derivedArgs = derived.args;
    derivedBinName = derived.binName;
  }

  // invocation — optional; default ['mcp-protocol']. String → single-element array.
  const invocation = normalizeInvocation(obj['invocation'], prefix);

  // When command was user-provided, leave args alone (don't pull from bin).
  // When command was derived, prefer the derived args unless the user supplied
  // their own.
  const finalArgs = args ?? derivedArgs ?? [];
  // The explicit `binName` field always wins; otherwise, use whatever the
  // derivation step uncovered (single-bin object form gives a free binName).
  const finalBinName = binName ?? derivedBinName;

  const entry: NormalizedBundleEntry = {
    skillName,
    command,
    args: finalArgs,
    invocation,
    ...(env !== undefined ? { env } : {}),
    ...(finalBinName !== undefined ? { binName: finalBinName } : {})
  };
  return entry;
}

/**
 * Derive `command`/`args` from `package.json.bin` for an entry that did NOT
 * supply its own `command` field. Implements the two-shape rule plus
 * the multi-bin selector.
 *
 * - String bin → `node <binPath>` (no binName surfaced).
 * - Object bin with exactly one key → same as string bin; binName surfaces the
 *   single key so FR-034's `--package=` form can fire when packageName is set.
 * - Object bin with >1 key + binName supplied + matches → derives launch from
 *   that key.
 * - Object bin with >1 key + binName missing/non-matching → throws
 *   `MISSING_LAUNCH_COMMAND` (ambiguous).
 * - No bin at all → throws `MISSING_LAUNCH_COMMAND`.
 */
function deriveFromBin(
  pkg: PackageJson,
  packageRoot: string,
  skillName: string,
  selectedBin?: string
): { command: string; args: string[]; binName?: string } {
  const bin = pkg.bin;
  if (bin === undefined) {
    throw new McpError(
      `skillit.mcp entry "${skillName}" has no command set and package.json has no "bin" field; ` +
        `set command/args explicitly in skillit.mcp.`,
      'MISSING_LAUNCH_COMMAND'
    );
  }
  if (typeof bin === 'string') {
    return { command: 'node', args: [resolveBinPath(bin, packageRoot)] };
  }
  if (typeof bin !== 'object' || Array.isArray(bin)) {
    throw new McpError(
      `skillit.mcp entry "${skillName}": package.json "bin" has unsupported shape; ` +
        `set command/args explicitly in skillit.mcp.`,
      'MISSING_LAUNCH_COMMAND'
    );
  }
  const keys = Object.keys(bin);
  if (keys.length === 1) {
    const onlyKey = keys[0]!;
    const path = bin[onlyKey];
    if (typeof path !== 'string') {
      throw new McpError(
        `skillit.mcp entry "${skillName}": package.json "bin.${onlyKey}" is not a string; ` +
          `set command/args explicitly in skillit.mcp.`,
        'MISSING_LAUNCH_COMMAND'
      );
    }
    return { command: 'node', args: [resolveBinPath(path, packageRoot)], binName: onlyKey };
  }
  // Multi-bin: refuse to guess unless the entry supplied an explicit binName
  // that matches one of the keys.
  if (selectedBin !== undefined && Object.prototype.hasOwnProperty.call(bin, selectedBin)) {
    const selectedPath = bin[selectedBin];
    if (typeof selectedPath !== 'string') {
      throw new McpError(
        `skillit.mcp entry "${skillName}": package.json "bin.${selectedBin}" is not a string.`,
        'MISSING_LAUNCH_COMMAND'
      );
    }
    return {
      command: 'node',
      args: [resolveBinPath(selectedPath, packageRoot)],
      binName: selectedBin
    };
  }
  throw new McpError(
    `skillit.mcp entry "${skillName}" has no command set; package.json bin is multi-bin so ` +
      `the launch command cannot be derived. Set "binName": "<one of: ${keys.join(', ')}>" ` +
      `in skillit.mcp, or set command/args explicitly.`,
    'MISSING_LAUNCH_COMMAND'
  );
}

/**
 * Resolve a bin path relative to the package root. Absolute paths and bare
 * specifiers pass through unchanged so the user's explicit choice wins.
 */
function resolveBinPath(binPath: string, packageRoot: string): string {
  if (path.isAbsolute(binPath)) return binPath;
  return path.resolve(packageRoot, binPath);
}

/**
 * Normalize the `invocation` field — string → single-element array, undefined
 * → `['mcp-protocol']` (FR-IT-009). Validates each entry against
 * {@link INVOCATION_TARGET_PATTERN}.
 */
function normalizeInvocation(raw: unknown, prefix: string): readonly InvocationTarget[] {
  if (raw === undefined) return ['mcp-protocol'];

  if (typeof raw === 'string') {
    if (!INVOCATION_TARGET_PATTERN.test(raw)) {
      throw new McpError(
        `${prefix}.invocation: '${raw}' must match /^(mcp-protocol|cli:[a-z0-9][a-z0-9-]*)$/`,
        'TRANSPORT_FAILED'
      );
    }
    return [raw as InvocationTarget];
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new McpError(
        `${prefix}.invocation: array must have at least one element`,
        'TRANSPORT_FAILED'
      );
    }
    const result: InvocationTarget[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (typeof item !== 'string' || !INVOCATION_TARGET_PATTERN.test(item)) {
        throw new McpError(
          `${prefix}.invocation[${i}]: '${String(item)}' must match /^(mcp-protocol|cli:[a-z0-9][a-z0-9-]*)$/`,
          'TRANSPORT_FAILED'
        );
      }
      result.push(item as InvocationTarget);
    }
    return result;
  }

  throw new McpError(
    `${prefix}.invocation: must be a string or array of strings`,
    'TRANSPORT_FAILED'
  );
}
