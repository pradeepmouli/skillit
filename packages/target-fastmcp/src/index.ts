/**
 * `@skillit/target-fastmcp` — CLI-as-proxy invocation-target adapter.
 *
 * Resolved by `@skillit/mcp`'s adapter loader when target `cli:fastmcp` is
 * requested. Emits SKILL.md output that routes tool calls through the
 * Python `fastmcp` CLI, making the skill consumable by any agent with a
 * shell tool (rather than only MCP-native harnesses).
 *
 * @packageDocumentation
 */

export { FastMcpAdapter } from './render.js';
export { encodeFastMcpArgs } from './args.js';
export type { EncodedArgs } from './args.js';
export { renderFastMcpSetup } from './setup.js';
export type { StdioLaunchCommand, HttpLaunchEndpoint } from './setup.js';
export { PACKAGE_VERSION } from './version.js';

import { FastMcpAdapter } from './render.js';

const adapter = new FastMcpAdapter();

/**
 * Default export — singleton adapter instance resolved by the adapter loader.
 *
 * @example
 * ```ts
 * import adapter from '@skillit/target-fastmcp';
 * await adapter.render(skill, ctx);
 * ```
 */
export default adapter;
