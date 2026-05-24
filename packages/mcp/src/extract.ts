// Top-level MCP extraction orchestrator.
//
// `extractMcpSkill(options)` connects to a live MCP server, runs the
// initialize handshake, enumerates tools/resources/prompts (with capability
// gating per FR-007), and returns an `ExtractedSkill` ready for the renderer.
//
// Design notes:
//  - The SDK's `Client` class structurally satisfies the `McpClient`
//    interface we use for introspection helpers, so we pass it directly to
//    `listTools`/`listResources`/`listPrompts` without an adapter wrapper.
//  - Cleanup is enforced via try/finally: `client.close()` runs on both
//    success and failure so the spawned child process can't leak.
//  - Error classification distinguishes spawn failures (ENOENT, EACCES, …)
//    from initialize handshake failures from process-early-exit.
//  - HTTP transport: StreamableHTTPClientTransport with content-
//    negotiation fallback to SSEClientTransport on 404/405.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ExtractedSkill } from '@to-skills/core';
import { runMcpAudit } from './audit/rules.js';
import { McpError, type McpErrorCode } from './errors.js';
import type { McpClient } from './introspect/client-types.js';
import { listPrompts } from './introspect/prompts.js';
import { listResources } from './introspect/resources.js';
import { listTools } from './introspect/tools.js';
import type { McpExtractOptions } from './types.js';
import { PACKAGE_VERSION } from './version.js';

/**
 * System error codes (Node `SystemError.code`) that indicate the spawn itself
 * failed — the child process never came up. These map to `TRANSPORT_FAILED`.
 * Anything else thrown out of `client.connect()` is treated as initialize
 * handshake failure (`INITIALIZE_FAILED`).
 */
const TRANSPORT_ERROR_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'EBUSY']);

/**
 * Maximum bytes of stderr we retain from the spawned MCP server. Bounded so a
 * chatty server can't OOM the extract process (FR-H007). Implemented as a
 * ring-buffer over a list of {@link Buffer} chunks: when the running total
 * exceeds the cap, the oldest chunk(s) are dropped. Buffer-level (not string-
 * level) accumulation avoids splitting multi-byte UTF-8 sequences during
 * capture; the {@link buildEarlyExitMessage} helper applies a separate
 * 2 KiB display-trim before returning a string.
 */
const MAX_STDERR_BYTES = 64 * 1024;

/**
 * Default cap (ms) on the SDK `client.connect()` call (the MCP `initialize`
 * handshake) for stdio transports (FR-H008). Caller-overridable via
 * {@link McpTransport} (`initializeTimeoutMs`); set to `0` to disable.
 */
const DEFAULT_INITIALIZE_TIMEOUT_MS = 30_000;

/**
 * Connect to a live MCP server, introspect its surface, and produce an
 * `ExtractedSkill`.
 *
 * For `transport.type === 'stdio'`:
 *   1. Spawn the server via `StdioClientTransport`. `stderr` is piped so a
 *      pre-initialize crash can surface readable diagnostics.
 *   2. Open the SDK `Client` and call `connect()`, which performs the MCP
 *      `initialize` handshake.
 *   3. Race `connect()` against the transport's `onclose` so a process exit
 *      before initialize resolves to `SERVER_EXITED_EARLY` (rather than a
 *      generic INITIALIZE_FAILED).
 *   4. Enumerate tools (always) and — only when the server's capabilities
 *      advertise them — resources and prompts (FR-007).
 *   5. Always call `client.close()` in `finally` so the child process is not
 *      leaked.
 *
 * For `transport.type === 'http'`:
 *   1. Construct `StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } })`.
 *   2. `client.connect()` performs the initialize handshake.
 *   3. If the server responds 404 or 405 to the initial POST, fall back to
 *      `SSEClientTransport` (SDK content-negotiation pattern). A fresh `Client`
 *      is constructed for the retry because the first transport is terminated.
 *   4. Auth failures (401/403) propagate as `INITIALIZE_FAILED` *without*
 *      protocol fallback — the user supplied creds for a specific protocol
 *      path, and switching protocols would silently change the request shape.
 *   5. Capability-gated introspection runs identically to the stdio path.
 *   6. Always `client.close()` in finally.
 *
 * Error mapping:
 * - Stdio process exits before connect resolves → `SERVER_EXITED_EARLY`
 * - Spawn failure (ENOENT/EACCES/EPERM/ENOTDIR/EBUSY) → `TRANSPORT_FAILED`
 * - Invalid HTTP URL → `TRANSPORT_FAILED`
 * - Any other error from `connect()` → `INITIALIZE_FAILED`
 * - Errors from inner introspection helpers that are already `McpError`
 *   instances (e.g. `SCHEMA_REF_CYCLE`) are re-thrown unchanged.
 *
 * Protocol-version compatibility:
 * The `checkProtocolVersion` helper is implemented and unit-tested but not
 * yet wired here, because SDK 1.29.0 does not expose a public getter for the
 * negotiated protocol version. The SDK already validates min/max protocol
 * version internally during `connect()`, so this gap is acceptable.
 *
 * @param options extraction options (transport + skill-name override)
 * @returns ExtractedSkill ready for the renderer
 * @throws {McpError} with one of the codes listed above
 *
 * @public
 */
export async function extractMcpSkill(options: McpExtractOptions): Promise<ExtractedSkill> {
  if (options.transport.type === 'http') {
    return extractHttp(options);
  }
  return extractStdio(options);
}

// ===========================================================================
// Stdio path — spawns a child process, races connect() vs onclose
// ===========================================================================

async function extractStdio(options: McpExtractOptions): Promise<ExtractedSkill> {
  // Narrow the discriminated union; type guard guaranteed by extractMcpSkill.
  if (options.transport.type !== 'stdio') {
    throw new McpError('expected stdio transport', 'TRANSPORT_FAILED');
  }
  const { command, args, env } = options.transport;

  // Pipe stderr so a pre-initialize crash can be surfaced. The transport
  // exposes the stream via `transport.stderr` once start() runs.
  const transport = new StdioClientTransport({
    command,
    args,
    env,
    stderr: 'pipe'
  });

  const client = new Client(
    { name: '@to-skills/mcp', version: PACKAGE_VERSION },
    { capabilities: {} }
  );

  // Capture stderr chunks so a pre-initialize crash can surface readable
  // diagnostics in the SERVER_EXITED_EARLY message. Bounded as a ring-buffer
  // so a chatty server can't OOM the extract process (US4 / FR-H007). The SDK
  // exposes `transport.stderr` as `Stream | null` — guard against null and
  // tolerate either Buffer or string chunks.
  //
  // Buffer-level (not string-level) accumulation avoids splitting multi-byte
  // UTF-8 sequences while we're still appending; the rendered message decodes
  // once at the very end and applies an additional 2 KiB display-trim on top
  // of the 64 KiB capture cap (both layers are intentional).
  const stderrBuffers: Buffer[] = [];
  let stderrBytes = 0;
  /**
   * Named listener so US5 (FR-H009) can `removeListener` it in `finally` —
   * EventEmitter looks listeners up by reference identity, so an anonymous
   * arrow would be unrecoverable across bundle iterations. Keep the cap logic
   * inline here (rather than a free helper) so the closure's hot-path stays
   * one allocation per chunk.
   */
  const onStderr = (chunk: Buffer | string): void => {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    stderrBuffers.push(buf);
    stderrBytes += buf.length;
    // Drop whole oldest chunks until either (a) we're under the cap, or (b)
    // we're down to the single most-recent chunk — at which point we slice
    // its tail to fit the budget exactly.
    while (stderrBytes > MAX_STDERR_BYTES && stderrBuffers.length > 1) {
      const dropped = stderrBuffers.shift()!;
      stderrBytes -= dropped.length;
    }
    if (stderrBytes > MAX_STDERR_BYTES && stderrBuffers.length === 1) {
      const tail = stderrBuffers[0]!.subarray(stderrBuffers[0]!.length - MAX_STDERR_BYTES);
      stderrBytes = tail.length;
      stderrBuffers[0] = tail;
    }
  };
  const stderrStream = (transport as { stderr?: unknown }).stderr;
  const stderrEmitter =
    stderrStream && typeof stderrStream === 'object' && 'on' in stderrStream
      ? (stderrStream as NodeJS.ReadableStream)
      : undefined;
  stderrEmitter?.on('data', onStderr);

  /** Compose the SERVER_EXITED_EARLY message including any captured stderr. */
  const buildEarlyExitMessage = (): string => {
    const stderrText = Buffer.concat(stderrBuffers, stderrBytes).toString('utf8');
    const trimmedStderr = stderrText.length > 2048 ? `…${stderrText.slice(-2048)}` : stderrText;
    return trimmedStderr
      ? `MCP server process exited before initialize completed.\nServer stderr:\n${trimmedStderr}`
      : 'MCP server process exited before initialize completed (no stderr captured).';
  };

  // Promise that rejects when the transport closes before connect resolves.
  // Raced against `client.connect()` so a process-death wins over a generic
  // INITIALIZE_FAILED.
  const exitPromise = new Promise<never>((_, reject) => {
    transport.onclose = () => {
      reject(new McpError(buildEarlyExitMessage(), 'SERVER_EXITED_EARLY'));
    };
  });

  // Optional initialize-handshake timeout (FR-H008). When `initializeTimeoutMs`
  // is `<= 0`, the caller has explicitly opted out of the race.
  const timeoutMs = options.transport.initializeTimeoutMs ?? DEFAULT_INITIALIZE_TIMEOUT_MS;
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise =
    timeoutMs > 0
      ? new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new McpError(
                `MCP server initialize handshake timed out after ${timeoutMs}ms`,
                'INITIALIZE_FAILED'
              )
            );
          }, timeoutMs);
        })
      : null;

  try {
    // Race connect() against the early-exit signal (process death) and, when
    // configured, the initialize-handshake timeout.
    const racers: Promise<unknown>[] = [client.connect(transport), exitPromise];
    if (timeoutPromise) racers.push(timeoutPromise);
    await Promise.race(racers);
    return await introspect(client, options);
  } catch (err) {
    if (err instanceof McpError) throw err;
    const code = classifyStdioError(err);
    if (code === 'TRANSPORT_FAILED') {
      throw new McpError(messageOf(err), 'TRANSPORT_FAILED', err);
    }
    throw new McpError(messageOf(err), 'INITIALIZE_FAILED', err);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    // US5 (FR-H009): detach the named stderr listener so bundle mode can't
    // accumulate listeners across iterations and trip Node's
    // MaxListenersExceeded warning. EventEmitter.removeListener finds the
    // listener by reference identity — that's why `onStderr` was hoisted to
    // a named const above (an anonymous arrow would be unrecoverable here).
    if (stderrEmitter && 'removeListener' in stderrEmitter) {
      stderrEmitter.removeListener('data', onStderr);
    }
    transport.onclose = undefined;
    try {
      await client.close();
    } catch {
      // Ignore — caller's primary error (if any) is more useful.
    }
  }
}

// ===========================================================================
// HTTP path — StreamableHTTP first, falls back to SSE on 404/405
// ===========================================================================

async function extractHttp(options: McpExtractOptions): Promise<ExtractedSkill> {
  if (options.transport.type !== 'http') {
    throw new McpError('expected http transport', 'TRANSPORT_FAILED');
  }
  const { url: urlStr, headers } = options.transport;

  // Validate URL syntax up front. `new URL()` throws TypeError on bad input;
  // wrap as TRANSPORT_FAILED so callers see a stable error code.
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch (err) {
    throw new McpError(`Invalid URL: ${urlStr}`, 'TRANSPORT_FAILED', err);
  }

  const requestInit: RequestInit = headers ? { headers } : {};

  // First attempt: StreamableHTTP. This is the modern protocol; most servers
  // speak it. SSE-only servers will respond 404 or 405 to the initial POST,
  // signaling we should retry over SSE.
  const httpTransport = new StreamableHTTPClientTransport(url, { requestInit });
  const client = new Client(
    { name: '@to-skills/mcp', version: PACKAGE_VERSION },
    { capabilities: {} }
  );

  // Cleanup discipline: each branch closes its own client exactly once.
  // - Happy path: close after introspect succeeds, then return.
  // - Primary-error path (no fallback): catch closes the failed client.
  // - SSE fallback path: inner try/finally owns the retry client's lifecycle.
  // No outer `finally` — that would double-close on the happy path and obscure
  // a future SDK regression where close() stops being idempotent.
  try {
    await client.connect(httpTransport);
    const skill = await introspect(client, options);
    await safeClose(client);
    return skill;
  } catch (err) {
    // The primary client is no longer usable regardless of which branch we
    // take below; close it once here.
    await safeClose(client);

    // Re-thrown McpError instances (e.g. SCHEMA_REF_CYCLE from inner helpers)
    // pass through unchanged.
    if (err instanceof McpError) throw err;

    if (shouldFallbackToSSE(err)) {
      // Fresh client for the retry — the first one's transport is terminated.
      const sseClient = new Client(
        { name: '@to-skills/mcp', version: PACKAGE_VERSION },
        { capabilities: {} }
      );
      const sseTransport = new SSEClientTransport(url, { requestInit });
      try {
        await sseClient.connect(sseTransport);
        return await introspect(sseClient, options);
      } catch (sseErr) {
        if (sseErr instanceof McpError) throw sseErr;
        throw new McpError(messageOf(sseErr), 'INITIALIZE_FAILED', sseErr);
      } finally {
        await safeClose(sseClient);
      }
    }
    // Non-fallbackable error: classify and propagate. Auth failures (401/403)
    // land here without protocol fallback — see JSDoc on extractMcpSkill.
    throw new McpError(messageOf(err), 'INITIALIZE_FAILED', err);
  }
}

/**
 * Heuristic: should this connect-time error trigger an SSE fallback?
 *
 * The SDK's `StreamableHTTPError` carries the HTTP status as `.code`. A 404
 * or 405 on the initial POST means the server doesn't speak StreamableHTTP at
 * that path — retry over SSE. Other codes (network failures, 401/403 auth,
 * 5xx) propagate without fallback because:
 *  - 401/403: user supplied creds for a specific protocol; switching protocols
 *    would silently change the request shape.
 *  - 5xx: server error not specific to protocol negotiation.
 *  - network: address/DNS issues affect both protocols equally.
 */
function shouldFallbackToSSE(err: unknown): boolean {
  if (err instanceof Error && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'number' && (code === 404 || code === 405)) return true;
  }
  return false;
}

async function safeClose(c: { close: () => Promise<void> }): Promise<void> {
  try {
    await c.close();
  } catch {
    // Ignore.
  }
}

// ===========================================================================
// Shared post-connect introspection
// ===========================================================================

/**
 * After a successful `client.connect()`, enumerate the server's surface and
 * assemble an ExtractedSkill. Shared between stdio and http paths.
 */
async function introspect(client: Client, options: McpExtractOptions): Promise<ExtractedSkill> {
  // Cast: the SDK Client's listTools/listResources/listPrompts return supersets
  // of our McpClient structural types — assignable at the method-call site,
  // not at the binding site (TS is stricter about `Client` because of its
  // `[x: string]: unknown` index signatures).
  const introspectClient = client as unknown as McpClient;

  const serverInfo = client.getServerVersion();
  const capabilities = client.getServerCapabilities() ?? {};

  // skillName fallback: when the user doesn't supply an explicit override,
  // we kebab-case the server-reported name so a name like
  // "Filesystem MCP Server" becomes "filesystem-mcp-server".
  const transformed = serverInfo?.name ? toKebabSkillName(serverInfo.name) : '';
  const skillName = options.skillName ?? (transformed || 'mcp-server');
  const description =
    (serverInfo as { title?: string } | undefined)?.title ?? serverInfo?.name ?? skillName;

  // tools/list is always called.
  const functions = await listTools(introspectClient);

  // FR-007: only call listResources / listPrompts when the corresponding
  // capability is advertised.
  const resources = capabilities.resources ? await listResources(introspectClient) : undefined;
  const prompts = capabilities.prompts ? await listPrompts(introspectClient) : undefined;

  // Annotation enrichment via flat `_meta`. Server- and tool-level metadata
  // in `_meta.{useWhen, avoidWhen, pitfalls, remarks, packageDescription}`
  // is read here and projected onto the skill so the core renderer's existing
  // "When to Use" / "NEVER" / remarks sections light up automatically.
  // Strictly additive: absent or wrong-type metadata leaves the skill unchanged.
  const metaEnrichment = collectMetaEnrichment(serverInfo, functions);
  const skillWithoutAudit: ExtractedSkill = {
    name: skillName,
    description,
    functions,
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    ...(resources !== undefined ? { resources } : {}),
    ...(prompts !== undefined ? { prompts } : {}),
    ...metaEnrichment
  };

  // Surface audit findings to stderr at extract time.
  //
  // Extract returns a single ExtractedSkill — there is no AuditResult slot to
  // populate, and we don't have an embedded fingerprint or installed adapter
  // here (those come from bundle context). Running M1–M4 is still useful: a
  // missing description or generic name shows up immediately, before the user
  // pipes the IR into a renderer that won't know to flag the same problems.
  //
  // Severity-gated logging — `warning` and worse go to stderr unconditionally.
  // `alert` issues (currently produced only by Rule M4 — generic tool names)
  // are emitted only when `options.audit.includeAlerts` is set, so a clean
  // server's stderr stays uncluttered while authors investigating naming can
  // opt in. We don't change exit codes here because extract is informational
  // at the IR layer; bundle mode owns the failure-on-fatal/error policy.
  if (options.audit?.skip !== true) {
    const issues = runMcpAudit(skillWithoutAudit);
    // US3 (FR-H006): surface audit findings on the return value so
    // programmatic callers can gate CI on structured results without forking
    // stderr. `audit` is the source-of-truth state machine; `auditIssues`
    // stays populated for backward compatibility with earlier callers.
    const includeAlerts = options.audit?.includeAlerts === true;
    for (const issue of issues) {
      if (issue.severity === 'alert' && !includeAlerts) continue;
      const tool = issue.location?.tool;
      const where = tool ? ` [${tool}]` : '';
      process.stderr.write(`[audit ${issue.code} ${issue.severity}]${where} ${issue.message}\n`);
    }
    return {
      ...skillWithoutAudit,
      audit: { status: 'completed', issues },
      auditIssues: issues
    };
  }

  return {
    ...skillWithoutAudit,
    audit: { status: 'skipped' }
  };
}

/**
 * Project flat `_meta` (server-level + per-tool aggregate) onto the skill.
 *
 * Server-level fields read off `serverInfo._meta` (flat strings):
 *  - `remarks: string`             → `skill.remarks`
 *  - `packageDescription: string`  → `skill.packageDescription`
 *  - `useWhen: string`             → seeds `skill.useWhen`
 *  - `avoidWhen: string`           → seeds `skill.avoidWhen`
 *  - `pitfalls: string`            → seeds `skill.pitfalls`
 *
 * @remarks
 * **SDK 1.29.0 strips server-level `_meta`.** The SDK's `ImplementationSchema`
 * uses Zod `$strip`, so unknown keys (including `_meta`) are dropped during
 * initialize-response validation on the client side — `serverInfo._meta` is
 * NOT observable today even when the server emits it. This reader is forward-
 * compat: when the SDK relaxes the schema (or a non-SDK MCP client passes a
 * raw `Implementation`), server-level meta will work with no further changes.
 * Per-tool meta uses the looser `Tool` schema and is unaffected — works today.
 * The unit tests bypass the SDK via vi.mock, so they exercise both layers.
 *
 * Per-tool meta is aggregated on top via `pushLines`. The primary path reads
 * `fn.mcpMetadata.toSkills.{useWhen,avoidWhen,pitfalls}` (each a
 * single-element `string[]` set by `readToolMetadata` in tools.ts). The
 * fallback path splits `fn.tags[key]` on `\n` for compatibility with older
 * ExtractedFunction producers that never set `mcpMetadata`.
 *
 * All inputs are validated for type before consumption — absent or wrong-type
 * values are silently dropped so a malformed annotation cannot crash a healthy
 * extract.
 */
function collectMetaEnrichment(
  serverInfo: unknown,
  functions: ExtractedSkill['functions']
): Pick<ExtractedSkill, 'avoidWhen' | 'packageDescription' | 'pitfalls' | 'remarks' | 'useWhen'> {
  const serverMeta = readServerMetaToSkills(serverInfo);
  const enrichment: Pick<
    ExtractedSkill,
    'avoidWhen' | 'packageDescription' | 'pitfalls' | 'remarks' | 'useWhen'
  > = {};

  const remarks = serverMeta['remarks'];
  if (typeof remarks === 'string' && remarks.length > 0) {
    enrichment.remarks = remarks;
  }
  const packageDescription = serverMeta['packageDescription'];
  if (typeof packageDescription === 'string' && packageDescription.length > 0) {
    enrichment.packageDescription = packageDescription;
  }

  const useWhen: string[] = [];
  const avoidWhen: string[] = [];
  const pitfalls: string[] = [];

  const serverUseWhen = serverMeta['useWhen'];
  if (typeof serverUseWhen === 'string' && serverUseWhen.trim()) {
    useWhen.push(serverUseWhen);
  }
  const serverAvoidWhen = serverMeta['avoidWhen'];
  if (typeof serverAvoidWhen === 'string' && serverAvoidWhen.trim()) {
    avoidWhen.push(serverAvoidWhen);
  }
  const serverPitfalls = serverMeta['pitfalls'];
  if (typeof serverPitfalls === 'string' && serverPitfalls.trim()) {
    pitfalls.push(serverPitfalls);
  }

  // Per-tool aggregation. Typed MCP metadata is preferred; tags stay as a
  // compatibility fallback for older ExtractedFunction producers.
  for (const fn of functions) {
    pushLines(useWhen, fn.mcpMetadata?.toSkills?.useWhen, fn.tags['useWhen']);
    pushLines(avoidWhen, fn.mcpMetadata?.toSkills?.avoidWhen, fn.tags['avoidWhen']);
    pushLines(pitfalls, fn.mcpMetadata?.toSkills?.pitfalls, fn.tags['pitfalls']);
  }

  if (useWhen.length > 0) enrichment.useWhen = useWhen;
  if (avoidWhen.length > 0) enrichment.avoidWhen = avoidWhen;
  if (pitfalls.length > 0) enrichment.pitfalls = pitfalls;
  return enrichment;
}

/** Append each non-empty metadata line to `target`. */
function pushLines(
  target: string[],
  lines: readonly string[] | undefined,
  fallbackJoined: string | undefined
): void {
  if (lines !== undefined) {
    target.push(...lines.filter((line) => line.trim().length > 0));
    return;
  }
  if (!fallbackJoined) return;
  for (const line of fallbackJoined.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) target.push(trimmed);
  }
}

/**
 * Pluck `_meta` off the SDK's `serverInfo` (Implementation), guarding
 * each layer against malformed shapes. Returns an empty object on absence.
 */
function readServerMetaToSkills(serverInfo: unknown): Record<string, unknown> {
  if (typeof serverInfo !== 'object' || serverInfo === null) return {};
  const meta = (serverInfo as { _meta?: unknown })._meta;
  if (typeof meta !== 'object' || meta === null) return {};
  return meta as Record<string, unknown>;
}

/**
 * Decide whether an unknown error from `connect()` (stdio path) is a spawn-
 * level transport failure or an initialize handshake failure.
 *
 * Heuristic: Node `SystemError.code` is in `TRANSPORT_ERROR_CODES` →
 * TRANSPORT_FAILED. Otherwise → INITIALIZE_FAILED.
 */
function classifyStdioError(err: unknown): McpErrorCode {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && TRANSPORT_ERROR_CODES.has(code)) {
      return 'TRANSPORT_FAILED';
    }
  }
  return 'INITIALIZE_FAILED';
}

/** Extract a printable message from an unknown error value. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown error';
}

/**
 * Lower-case and kebab-case an arbitrary string into a safe skill identifier.
 *
 * Examples:
 *   "Filesystem MCP Server" → "filesystem-mcp-server"
 *   "GitHub_Tools"          → "github-tools"
 *   "!!!"                   → ""   (caller falls back to 'mcp-server')
 */
function toKebabSkillName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // any non-alphanumeric run → single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}
