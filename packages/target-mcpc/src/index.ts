/**
 * `@skillit/target-mcpc` — CLI-as-proxy invocation-target adapter.
 *
 * Resolved by `@skillit/mcp`'s adapter loader when target `cli:mcpc` is
 * requested. Emits SKILL.md output that routes tool calls through Apify's
 * `mcpc` CLI, making the skill consumable by any agent with a shell tool
 * (rather than only MCP-native harnesses).
 *
 * @packageDocumentation
 */

export { McpcAdapter } from './render.js';
export { encodeMcpcArgs } from './args.js';
export type { EncodedArgs } from './args.js';
export { renderMcpcSetup } from './setup.js';
export type { StdioLaunchCommand, HttpLaunchEndpoint } from './setup.js';
export { PACKAGE_VERSION } from './version.js';

import { McpcAdapter } from './render.js';

const adapter = new McpcAdapter();

/**
 * Default export — singleton adapter instance resolved by the adapter loader.
 *
 * @example
 * ```ts
 * import adapter from '@skillit/target-mcpc';
 * await adapter.render(skill, ctx);
 * ```
 */
export default adapter;
