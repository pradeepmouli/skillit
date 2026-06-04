/**
 * Single source of truth for the `@skillit/mcp` package version.
 *
 * MUST match `packages/mcp/package.json` `version`. The literal lives here
 * (not derived from `package.json` at runtime) so consumers don't have to
 * deal with JSON imports / `--experimental-json-modules` flags. A future
 * release-automation step may rewrite this file when bumping the package.
 *
 * Used as the `version` field in `Implementation` advertised during the MCP
 * `initialize` handshake (see `extract.ts`).
 */
export const PACKAGE_VERSION = '0.1.0';
