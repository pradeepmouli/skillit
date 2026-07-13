import { detectRefineMode } from './detect-mode.js';

/** The subset of command options `resolveMcpMode` reads. */
export interface McpModeOpts {
  mode?: string;
  mcp?: string;
}

/** Resolved mode, or a user-facing error message. */
export type McpModeResult = { mode: 'build' | 'runtime' } | { error: string };

/**
 * Resolve the MCP refine/audit mode: honor an explicit `--mode build|runtime`,
 * otherwise auto-detect via {@link detectRefineMode}, returning an actionable
 * error when the mode is invalid or detection is ambiguous.
 *
 * @param cwd - project directory to inspect for build/runtime signals.
 * @param opts - parsed `--mode` / `--mcp` options.
 * @returns the resolved mode, or `{ error }` for the caller to print + exit 1.
 */
export async function resolveMcpMode(cwd: string, opts: McpModeOpts): Promise<McpModeResult> {
  if (opts.mode === 'build' || opts.mode === 'runtime') return { mode: opts.mode };
  if (opts.mode !== undefined) {
    return { error: `Invalid --mode value: ${opts.mode}. Use 'build' or 'runtime'.` };
  }
  const detected = await detectRefineMode(cwd, opts.mcp ?? cwd);
  if (detected === 'ambiguous') {
    return {
      error: `Cannot determine MCP mode.
Use --mode build    (TypeScript MCP server you own)
    --mode runtime  (consuming project, any MCP server)`
    };
  }
  return { mode: detected };
}
