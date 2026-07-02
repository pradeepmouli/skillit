// Structural client types for MCP introspection helpers.
//
// These mirror the subset of the `@modelcontextprotocol/sdk` client surface
// that the introspection helpers (`listTools`, `listResources`, `listPrompts`)
// depend on. By depending on a structural interface rather than the SDK's
// concrete `Client` class, the helpers stay trivially mockable in unit tests
// while remaining call-site compatible with a real SDK client (whose response
// shapes are supersets of these).

/** A single entry in the response of an MCP `tools/list` call. */
export interface McpToolListEntry {
  /** Tool identifier — used as the `name` argument of `tools/call`. */
  name: string;
  /** Human-readable description (may be absent on minimally-documented servers). */
  description?: string;
  /**
   * JSON Schema describing the tool's input. The SDK types this as `unknown`
   * because servers are free to advertise any JSON value here; in practice it
   * is a JSON Schema object (or null/undefined when no input is required).
   */
  inputSchema?: unknown;
  /**
   * Server-supplied metadata. The MCP spec reserves the `_meta` envelope for
   * extension fields such as the flat `_meta.useWhen` string skillit reads (see US7).
   */
  _meta?: Record<string, unknown>;
}

/** A single entry in the response of an MCP `resources/list` call. */
export interface McpResourceListEntry {
  /** Canonical URI (may include RFC 6570 template expressions). */
  uri: string;
  /** Short human-readable name. */
  name: string;
  /** Prose description (single paragraph). */
  description?: string;
  /** MIME type of the resource content; absent when the server does not advertise one. */
  mimeType?: string;
}

/** A typed argument exposed by an MCP prompt. */
export interface McpPromptArgumentEntry {
  name: string;
  description?: string;
  required?: boolean;
}

/** A single entry in the response of an MCP `prompts/list` call. */
export interface McpPromptListEntry {
  name: string;
  description?: string;
  arguments?: McpPromptArgumentEntry[];
}

/**
 * Minimal structural interface for an MCP client used by introspection helpers.
 *
 * The real `Client` class from `@modelcontextprotocol/sdk/client/index.js` is
 * structurally compatible: its `listTools`, `listResources`, and `listPrompts`
 * methods accept `(params?, options?)` and return supersets of these shapes,
 * so passing a real `Client` satisfies this interface at the call site.
 */
export interface McpClient {
  listTools(params?: { cursor?: string }): Promise<{
    tools: McpToolListEntry[];
    nextCursor?: string;
  }>;
  listResources(params?: { cursor?: string }): Promise<{
    resources: McpResourceListEntry[];
    nextCursor?: string;
  }>;
  listPrompts(params?: { cursor?: string }): Promise<{
    prompts: McpPromptListEntry[];
    nextCursor?: string;
  }>;
}
