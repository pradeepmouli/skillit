// MCP resources/list introspection — paginates and maps to ExtractedResource.

import type { ExtractedResource } from '@skillit/core';
import type { McpClient, McpResourceListEntry } from './client-types.js';
import { paginate } from './paginate.js';

/**
 * Enumerate all resources exposed by an MCP server.
 *
 * Pagination follows the same pattern as `listTools`: repeatedly call
 * `client.listResources({ cursor })` until the server returns an undefined
 * `nextCursor`.
 *
 * Capability gating — i.e. skipping the call entirely when the server's
 * `initialize` capabilities omit `resources` — is the caller's responsibility
 * (see `extract.ts`). This function unconditionally calls the method.
 *
 * @param client structural MCP client (real SDK `Client` or a test mock)
 * @returns one `ExtractedResource` per entry, in server-returned order
 */
export async function listResources(client: McpClient): Promise<ExtractedResource[]> {
  const all = await paginate<McpResourceListEntry>(async (cursor) => {
    const page = await client.listResources(cursor === undefined ? undefined : { cursor });
    return { items: page.resources, nextCursor: page.nextCursor };
  });

  return all.map(mapResource);
}

/** Convert one `McpResourceListEntry` into the renderer-facing shape. */
function mapResource(entry: McpResourceListEntry): ExtractedResource {
  const out: ExtractedResource = {
    uri: entry.uri,
    name: entry.name,
    description: entry.description ?? ''
  };
  // Omit `mimeType` entirely when absent so callers can detect "not advertised"
  // distinct from "advertised as empty string".
  if (entry.mimeType !== undefined) {
    out.mimeType = entry.mimeType;
  }
  return out;
}
