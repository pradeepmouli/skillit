/**
 * Setup-section renderer for the mcpc CLI-as-proxy adapter.
 *
 * @remarks
 * mcpc (Apify's MCP CLI, https://github.com/apify/mcpc) lets non-MCP agents
 * talk to MCP servers via shell commands. The Setup section embedded into
 * SKILL.md tells the consumer:
 *
 * 1. How to install mcpc (`npm install -g mcpc`).
 * 2. How to register the underlying MCP server (`mcpc connect <name> -- ...`)
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
 * Render the Markdown Setup section for an mcpc-proxied skill.
 *
 * @param skillName - kebab-case skill identifier; used as the mcpc connection name
 * @param launchCommand - stdio command (`{ command, args?, env? }`) or HTTP endpoint (`{ url, headers? }`)
 * @param fingerprint - adapter fingerprint embedded in the FR-IT-012 trace line
 * @returns Markdown string starting with `## Setup` and ending with the trace line
 */
export function renderMcpcSetup(
  skillName: string,
  launchCommand: StdioLaunchCommand | HttpLaunchEndpoint,
  fingerprint: AdapterFingerprint
): string {
  const lines: string[] = [];
  lines.push('## Setup');
  lines.push('');
  lines.push('This skill proxies through `mcpc`, the Apify MCP CLI.');
  lines.push('');
  lines.push('### One-time install');
  lines.push('');
  lines.push('```sh');
  lines.push('npm install -g mcpc');
  lines.push('```');
  lines.push('');
  lines.push(`### Connect to ${skillName}`);
  lines.push('');
  lines.push('```sh');
  lines.push(renderConnectCommand(skillName, launchCommand));
  lines.push('```');
  lines.push('');

  // FR-IT-012 trace line. The "mcpc 2.1.x" marker corresponds to this
  // adapter's `targetCliRange` (mcpc@^2.1) — keep them in sync. The
  // `via @skillit/target-mcpc <version>` suffix matches the spec wording.
  const cliMarker = formatCliMarker(fingerprint.targetCliRange);
  lines.push(`> Generated for ${cliMarker} via ${fingerprint.adapter} ${fingerprint.version}`);

  return lines.join('\n');
}

function renderConnectCommand(
  skillName: string,
  launchCommand: StdioLaunchCommand | HttpLaunchEndpoint
): string {
  if ('url' in launchCommand) {
    return `mcpc connect ${shellQuote(skillName)} --url ${shellQuote(launchCommand.url)}`;
  }
  const argv =
    launchCommand.args && launchCommand.args.length > 0
      ? ` ${launchCommand.args.map(shellQuote).join(' ')}`
      : '';
  return `mcpc connect ${shellQuote(skillName)} -- ${shellQuote(launchCommand.command)}${argv}`;
}

/**
 * Minimal POSIX shell quoting for tokens emitted into a copy/paste-ready
 * Setup command. Tokens that match `[A-Za-z0-9_./@:=+-]+` are passed
 * verbatim; anything else is wrapped in single quotes with embedded `'`
 * escaped via `'\''`. This keeps the common case (npx, package names,
 * hyphenated args) readable while preventing shell injection or breakage
 * when a token contains spaces, `$`, backticks, or globs.
 */
function shellQuote(token: string): string {
  if (token.length > 0 && /^[A-Za-z0-9_./@:=+-]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

/**
 * Format the targetCliRange (e.g. `mcpc@^2.1`) into the marker form used in
 * the human-readable fingerprint line ("mcpc 2.1.x"). Falls back to a
 * conservative "mcpc" if the range is missing or unparseable so the
 * fingerprint line remains stable.
 */
function formatCliMarker(targetCliRange: string | undefined): string {
  if (!targetCliRange) return 'mcpc';
  // Match `<name>@<range>` where range starts with ^/~/= followed by a
  // major.minor pair. Render as "<name> <major>.<minor>.x".
  const fullMatch = targetCliRange.match(/^([^@]+)@[\^~=]?(\d+)\.(\d+)/);
  if (fullMatch) {
    const [, name, major, minor] = fullMatch;
    return `${name} ${major}.${minor}.x`;
  }
  // Major-only fallback (e.g. mcpc@^2 → "mcpc 2.x").
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
