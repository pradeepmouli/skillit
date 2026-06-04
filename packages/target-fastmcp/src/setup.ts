/**
 * Setup-section renderer for the fastmcp CLI-as-proxy adapter.
 *
 * @remarks
 * fastmcp (the Python `fastmcp` / `pyfastmcp` CLI, https://gofastmcp.com)
 * lets non-MCP agents talk to MCP servers via shell commands. The Setup
 * section embedded into SKILL.md tells the consumer:
 *
 * 1. How to install fastmcp (`pip install fastmcp`).
 * 2. How to register the underlying MCP server (`pyfastmcp connect <name> -- ...`)
 *    using the launch command we received from the host.
 * 3. The adapter fingerprint (FR-IT-012) — a human-readable line so
 *    freshness audits can detect drift between the rendered SKILL.md and
 *    the adapter version that produced it.
 *
 * @module setup
 */

import type { AdapterFingerprint } from '@skillit/mcp';

/**
 * Stdio launch shape — mirrors the host's `AdapterRenderContext.launchCommand`.
 */
export interface StdioLaunchCommand {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * HTTP endpoint shape — mirrors the host's `AdapterRenderContext.httpEndpoint`.
 */
export interface HttpLaunchEndpoint {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Render the Markdown Setup section for a fastmcp-proxied skill.
 *
 * @param skillName - kebab-case skill identifier; used as the fastmcp connection name
 * @param launchCommand - stdio command (`{ command, args?, env? }`) or HTTP endpoint (`{ url, headers? }`)
 * @param fingerprint - adapter fingerprint embedded in the FR-IT-012 trace line
 * @returns Markdown string starting with `## Setup` and ending with the trace line
 */
export function renderFastMcpSetup(
  skillName: string,
  launchCommand: StdioLaunchCommand | HttpLaunchEndpoint,
  fingerprint: AdapterFingerprint
): string {
  const lines: string[] = [];
  lines.push('## Setup');
  lines.push('');
  lines.push('This skill proxies through `fastmcp`, the Python MCP CLI.');
  lines.push('');
  lines.push('### One-time install');
  lines.push('');
  lines.push('```sh');
  lines.push('pip install fastmcp');
  lines.push('```');
  lines.push('');
  lines.push(`### Connect to ${skillName}`);
  lines.push('');
  lines.push('```sh');
  lines.push(renderConnectCommand(skillName, launchCommand));
  lines.push('```');
  lines.push('');

  // FR-IT-012 trace line. The "fastmcp 2.x" marker corresponds to this
  // adapter's `targetCliRange` (fastmcp@^2) — keep them in sync. The
  // `via @skillit/target-fastmcp <version>` suffix matches the spec wording.
  const cliMarker = formatCliMarker(fingerprint.targetCliRange);
  lines.push(`> Generated for ${cliMarker} via ${fingerprint.adapter} ${fingerprint.version}`);

  return lines.join('\n');
}

function renderConnectCommand(
  skillName: string,
  launchCommand: StdioLaunchCommand | HttpLaunchEndpoint
): string {
  if ('url' in launchCommand) {
    return `pyfastmcp connect ${shellQuote(skillName)} --url ${shellQuote(launchCommand.url)}`;
  }
  const argv =
    launchCommand.args && launchCommand.args.length > 0
      ? ` ${launchCommand.args.map(shellQuote).join(' ')}`
      : '';
  return `pyfastmcp connect ${shellQuote(skillName)} -- ${shellQuote(launchCommand.command)}${argv}`;
}

/**
 * Minimal POSIX shell quoting for tokens emitted into a copy/paste-ready
 * Setup command. See target-mcpc's `setup.ts` for full rationale; the
 * heuristic is identical (`safe charset` passthrough, single-quote with
 * `'\''` escape otherwise).
 */
function shellQuote(token: string): string {
  if (token.length > 0 && /^[A-Za-z0-9_./@:=+-]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

/**
 * Format the targetCliRange (e.g. `fastmcp@^2`) into the marker form used in
 * the human-readable fingerprint line ("fastmcp 2.x"). Falls back to a
 * conservative "fastmcp" if the range is missing or unparseable so the
 * fingerprint line remains stable.
 */
function formatCliMarker(targetCliRange: string | undefined): string {
  if (!targetCliRange) return 'fastmcp';
  // Match `<name>@<range>` where range starts with ^/~/= followed by a
  // major version (with optional minor). Render as either "<name>
  // <major>.<minor>.x" when both are present or "<name> <major>.x" when
  // only major is provided.
  const fullMatch = targetCliRange.match(/^([^@]+)@[\^~=]?(\d+)\.(\d+)/);
  if (fullMatch) {
    const [, name, major, minor] = fullMatch;
    return `${name} ${major}.${minor}.x`;
  }
  const majorMatch = targetCliRange.match(/^([^@]+)@[\^~=]?(\d+)/);
  if (majorMatch) {
    const [, name, major] = majorMatch;
    return `${name} ${major}.x`;
  }
  // Operators outside [\^~=] (e.g. `>=`, `<`) — strip the @range suffix and
  // return just the package name so the fingerprint line stays human-readable.
  // The fingerprint frontmatter still carries the precise raw range.
  const nameOnly = targetCliRange.match(/^([^@]+)@/);
  if (nameOnly) return nameOnly[1]!;
  return targetCliRange;
}
