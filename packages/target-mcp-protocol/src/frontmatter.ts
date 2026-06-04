/**
 * Frontmatter composition for the `mcp-protocol` invocation target.
 *
 * @remarks
 * MCP-native agent harnesses (OpenCode, Codex, Cursor) discover MCP server
 * launch parameters from a `mcp:` frontmatter block in `SKILL.md`. This module
 * builds the structured object that the core renderer's `additionalFrontmatter`
 * mechanism serializes via the `yaml` package.
 *
 * Per research.md §7, the shape is one of:
 *
 * Stdio (command-based):
 *
 * ```yaml
 * mcp:
 *   <skillName>:
 *     command: npx
 *     args:
 *       - -y
 *       - "@modelcontextprotocol/server-filesystem"
 *     env:
 *       FOO: bar
 * ```
 *
 * HTTP (url-based):
 *
 * ```yaml
 * mcp:
 *   <skillName>:
 *     url: https://example.com/mcp
 *     headers:
 *       Authorization: Bearer test
 * ```
 *
 * @module frontmatter
 */

/**
 * Stdio launch shape — what the agent harness should spawn to talk to this server
 * over stdio.
 */
export interface McpStdioLaunchCommand {
  /** Executable to spawn (e.g. `npx`, `node`, `uvx`). */
  readonly command: string;
  /** Argument vector. Omitted from emitted YAML when empty/undefined. */
  readonly args?: readonly string[];
  /** Environment variables. Omitted from emitted YAML when empty/undefined. */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * HTTP endpoint shape — used when the MCP server speaks Streamable HTTP/SSE
 * rather than stdio. Conventional shape supported by Claude Desktop / OpenCode
 * for HTTP-transport servers.
 */
export interface McpHttpLaunchCommand {
  /** HTTP(S) URL of the MCP endpoint. */
  readonly url: string;
  /** Optional headers (e.g. `Authorization`). Omitted from emitted YAML when empty/undefined. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * MCP launch descriptor — discriminated union of stdio (`command`) and HTTP
 * (`url`) shapes.
 */
export type McpLaunchCommand = McpStdioLaunchCommand | McpHttpLaunchCommand;

/**
 * Build the structured `mcp:` frontmatter object for the default invocation target.
 *
 * The returned object is a plain JavaScript object — NOT a YAML string. The host
 * renderer (in `@skillit/core`) merges it into the SKILL.md frontmatter via
 * `SkillRenderOptions.additionalFrontmatter` and serializes through the `yaml`
 * package, which handles quoting and indentation.
 *
 * Field order:
 *
 * Stdio shape — `{ command, args?, env? }`:
 * 1. `command` (always present)
 * 2. `args` (omitted when undefined or empty)
 * 3. `env` (omitted when undefined or empty)
 *
 * HTTP shape — `{ url, headers? }`:
 * 1. `url` (always present)
 * 2. `headers` (omitted when undefined or empty)
 *
 * @param skillName - kebab-case skill identifier; becomes the inner mapping key.
 * @param launchCommand - command+args+env (stdio) or url+headers (http) to embed.
 * @returns `{ mcp: { [skillName]: <inner> } }` ready for yaml serialization.
 */
export function emitMcpFrontmatter(
  skillName: string,
  launchCommand: McpLaunchCommand
): Record<string, unknown> {
  const inner: Record<string, unknown> = {};

  if ('url' in launchCommand) {
    inner['url'] = launchCommand.url;
    if (launchCommand.headers && Object.keys(launchCommand.headers).length > 0) {
      inner['headers'] = { ...launchCommand.headers };
    }
  } else {
    inner['command'] = launchCommand.command;
    if (launchCommand.args && launchCommand.args.length > 0) {
      // Copy to a mutable plain array so YAML lib treats it as a sequence.
      inner['args'] = [...launchCommand.args];
    }
    if (launchCommand.env && Object.keys(launchCommand.env).length > 0) {
      inner['env'] = { ...launchCommand.env };
    }
  }

  return { mcp: { [skillName]: inner } };
}
