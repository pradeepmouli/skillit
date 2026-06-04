// MCP prompts/list introspection — paginates and maps to ExtractedPrompt.

import type { ExtractedPrompt, ExtractedPromptArgument } from '@skillit/core';
import type { McpClient, McpPromptListEntry } from './client-types.js';
import { paginate } from './paginate.js';

/**
 * Enumerate all prompts exposed by an MCP server.
 *
 * Pagination follows the same pattern as `listTools`: repeatedly call
 * `client.listPrompts({ cursor })` until the server returns an undefined
 * `nextCursor`.
 *
 * Capability gating — i.e. skipping the call entirely when the server's
 * `initialize` capabilities omit `prompts` — is the caller's responsibility
 * (see `extract.ts`). This function unconditionally calls the method.
 *
 * @param client structural MCP client (real SDK `Client` or a test mock)
 * @returns one `ExtractedPrompt` per entry, in server-returned order
 */
export async function listPrompts(client: McpClient): Promise<ExtractedPrompt[]> {
  const all = await paginate<McpPromptListEntry>(async (cursor) => {
    const page = await client.listPrompts(cursor === undefined ? undefined : { cursor });
    return { items: page.prompts, nextCursor: page.nextCursor };
  });

  return all.map(mapPrompt);
}

/** Convert one `McpPromptListEntry` into the renderer-facing shape. */
function mapPrompt(entry: McpPromptListEntry): ExtractedPrompt {
  const args: ExtractedPromptArgument[] = (entry.arguments ?? []).map((arg) => ({
    name: arg.name,
    description: arg.description ?? '',
    required: arg.required ?? false
  }));
  return {
    name: entry.name,
    description: entry.description ?? '',
    arguments: args
  };
}
