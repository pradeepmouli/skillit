import { join } from 'node:path';
import type { RefineSource } from '@skillit/core';
import { renderAndWriteMcpSkill } from '../bundle.js';
import { readMcpConfigFile } from '../config/file-reader.js';
import { extractMcpSkill } from '../extract.js';
import type { ConfigEntry } from '../types.js';
import { TypeScriptMcpRefineSource } from './build/ts-mcp-source.js';
import { McpRefineSource } from './runtime/mcp-source.js';

/**
 * Pick the MCP config entry to refine from a validated entry list.
 *
 * When `serverName` is supplied, the matching named entry is returned. When it
 * is omitted, the first non-disabled entry is returned (mirroring the CLI's
 * default-to-first-enabled behaviour). This is the shared selection logic for
 * both the `refine` and `audit` MCP source-dispatch paths.
 *
 * @param entries — validated config entries (e.g. from {@link readMcpConfigFile}).
 * @param serverName — optional name of the entry to select; when omitted, the
 *   first entry without `disabled: true` is chosen.
 * @returns the selected {@link ConfigEntry}.
 * @throws {Error} when `serverName` is given but absent from `entries`, or when
 *   no enabled entry exists. The message names the requested server (or notes
 *   that no enabled server was found) for actionable diagnosis.
 */
export function selectServerEntry(
  entries: readonly ConfigEntry[],
  serverName?: string
): ConfigEntry {
  const entry = serverName
    ? entries.find((e) => e.name === serverName)
    : entries.find((e) => !e.disabled);
  if (!entry) {
    const which = serverName ? `"${serverName}"` : 'any enabled server';
    throw new Error(`Could not find ${which} in the MCP config`);
  }
  return entry;
}

/**
 * Options for {@link createMcpRefineSource}.
 */
export interface CreateMcpRefineSourceOptions {
  /** Path to an `mcp.json` / `claude_desktop_config.json` file. */
  mcpPath: string;
  /**
   * Source dispatch mode:
   *  - `'build'`   → {@link TypeScriptMcpRefineSource} (TypeScript MCP server
   *    you own; edits source declarations in place).
   *  - `'runtime'` → {@link McpRefineSource} (any consuming project; edits an
   *    overlay JSON writeback).
   */
  mode: 'build' | 'runtime';
  /** Server name within the config (defaults to first enabled entry). */
  serverName?: string;
  /** Overlay JSON path (runtime mode only; defaults to `<cwd>/.skillit-overlay.json`). */
  overlayPath?: string;
  /** Glob of TypeScript source files to edit (build mode only; defaults to `<cwd>/**\/*.ts`). */
  sourceGlob?: string;
}

/**
 * Construct the appropriate {@link RefineSource} for an MCP server, centralising
 * the build/runtime dispatch that `refine` (and a future `audit` branch) share.
 *
 * Reads and validates the config file, selects the target entry via
 * {@link selectServerEntry}, then builds either a {@link TypeScriptMcpRefineSource}
 * (build mode) or a {@link McpRefineSource} (runtime mode).
 *
 * @param opts — see {@link CreateMcpRefineSourceOptions}.
 * @returns the constructed {@link RefineSource} for the selected mode.
 * @throws {import('../errors.js').McpError} when the config file cannot be read,
 *   parsed, or validated (propagated from {@link readMcpConfigFile}).
 * @throws {Error} when no matching/enabled server entry exists (propagated from
 *   {@link selectServerEntry}).
 */
export async function createMcpRefineSource(
  opts: CreateMcpRefineSourceOptions
): Promise<RefineSource> {
  const entries = await readMcpConfigFile(opts.mcpPath);
  const entry = selectServerEntry(entries, opts.serverName);
  if (opts.mode === 'build') {
    return new TypeScriptMcpRefineSource({
      transport: entry.transport,
      sourceGlob: opts.sourceGlob ?? join(process.cwd(), '**', '*.ts')
    });
  }
  return new McpRefineSource({
    overlayPath: opts.overlayPath ?? join(process.cwd(), '.skillit-overlay.json'),
    extract: () => extractMcpSkill({ transport: entry.transport })
  });
}

/** Options for {@link generateMcpSkill}. */
export interface GenerateMcpSkillOptions {
  /** Path to an `mcp.json` / `claude_desktop_config.json` file. */
  mcpPath: string;
  /** Server name within the config (defaults to first enabled entry). */
  serverName?: string;
  /** Absolute output directory. */
  outDir: string;
}

/**
 * GEN primitive for the mcp source: select the server, extract via the live
 * transport, then render + write deterministically.
 *
 * Mode-independent — extraction is identical for build and runtime; mode only
 * affects writeback (refine/audit), which `gen` does not perform. The render +
 * write is delegated to {@link renderAndWriteMcpSkill} so `gen` and `bundle`
 * emit byte-identical output for the no-adapter case.
 *
 * @param opts — mcp config path, optional server name, and output directory.
 * @throws {import('../errors.js').McpError} when the config file cannot be read,
 *   parsed, or validated (propagated from {@link readMcpConfigFile}).
 * @throws {Error} when no matching/enabled server entry exists (propagated from
 *   {@link selectServerEntry}).
 *
 * @public
 */
export async function generateMcpSkill(opts: GenerateMcpSkillOptions): Promise<void> {
  const entries = await readMcpConfigFile(opts.mcpPath);
  const entry = selectServerEntry(entries, opts.serverName);
  const skill = await extractMcpSkill({ transport: entry.transport });
  // renderAndWriteMcpSkill is synchronous (writeSkills is sync), so no await.
  renderAndWriteMcpSkill(skill, opts.outDir);
}
