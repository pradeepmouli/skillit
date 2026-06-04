// Unit tests for the `extractMcpSkill` orchestrator (T034–T037).
//
// Strategy: vi.mock both the SDK Client and the SDK StdioClientTransport so
// we can control connect/listTools/listResources/listPrompts behavior without
// spawning an actual child process. The mocks are state-tracked so each test
// can assert close() was called and connect() saw the right transport.

import { PassThrough } from 'node:stream';
import type { ExtractedSkill } from '@skillit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpPromptListEntry } from '../../src/introspect/client-types.js';

// Module-scope mock state — reset per test in beforeEach.
type CapShape = {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
} & Record<string, unknown>;

type ServerInfo = { name: string; version: string; title?: string };

interface MockState {
  capabilities: CapShape;
  serverInfo: ServerInfo | undefined;
  connectError: Error | undefined;
  // When true, simulate the transport's onclose firing before connect resolves.
  earlyExit: boolean;
  earlyExitMessage: string;
  closeCallCount: number;
  transportCloseCount: number;
  // Optional stderr stream installed on the mock transport. Tests can write
  // to this BEFORE triggering earlyExit to assert the SERVER_EXITED_EARLY
  // message includes captured stderr content.
  stderrStream: PassThrough | null;
  // Lets tests force list methods to throw when called (e.g. assert capability
  // gating actually skips the call).
  listToolsImpl: () => Promise<{ tools: unknown[]; nextCursor?: string }>;
  listResourcesImpl: () => Promise<{
    resources: unknown[];
    nextCursor?: string;
  }>;
  listPromptsImpl: () => Promise<{
    prompts: McpPromptListEntry[];
    nextCursor?: string;
  }>;
  // Spy: tracks which list methods were invoked.
  listToolsCalls: number;
  listResourcesCalls: number;
  listPromptsCalls: number;
}

const state: MockState = {
  capabilities: {},
  serverInfo: undefined,
  connectError: undefined,
  earlyExit: false,
  earlyExitMessage: '',
  closeCallCount: 0,
  transportCloseCount: 0,
  stderrStream: null,
  listToolsImpl: async () => ({ tools: [] }),
  listResourcesImpl: async () => ({ resources: [] }),
  listPromptsImpl: async () => ({ prompts: [] as McpPromptListEntry[] }),
  listToolsCalls: 0,
  listResourcesCalls: 0,
  listPromptsCalls: 0
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  // Defined inside factory because vi.mock is hoisted above module-scope
  // class declarations. Reads `state` (also a module-scope import) which is
  // resolved lazily at method-call time, so the hoisting doesn't bite.
  class Client {
    constructor(
      public readonly clientInfo: unknown,
      public readonly options: unknown
    ) {}
    async connect(transport: { onclose?: () => void }): Promise<void> {
      if (state.earlyExit) {
        // Simulate the transport's child process exiting before connect
        // resolves: the SDK transport fires `onclose` and we want extract.ts
        // to race that signal against the connect promise.
        setTimeout(() => transport.onclose?.(), 0);
        // Block forever — extract.ts must resolve via the onclose race.
        await new Promise(() => {
          /* never */
        });
        return;
      }
      if (state.connectError !== undefined) {
        throw state.connectError;
      }
    }
    getServerCapabilities(): CapShape {
      return state.capabilities;
    }
    getServerVersion(): ServerInfo | undefined {
      return state.serverInfo;
    }
    async listTools(): Promise<{ tools: unknown[]; nextCursor?: string }> {
      state.listToolsCalls++;
      return state.listToolsImpl();
    }
    async listResources(): Promise<{
      resources: unknown[];
      nextCursor?: string;
    }> {
      state.listResourcesCalls++;
      return state.listResourcesImpl();
    }
    async listPrompts(): Promise<{
      prompts: McpPromptListEntry[];
      nextCursor?: string;
    }> {
      state.listPromptsCalls++;
      return state.listPromptsImpl();
    }
    async close(): Promise<void> {
      state.closeCallCount++;
    }
  }
  return { Client };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  class StdioClientTransport {
    onclose?: () => void;
    // Lazily-resolved getter so individual tests can install a PassThrough
    // BEFORE extract.ts subscribes to it. Defaults to null (the real SDK
    // also types this as `Stream | null`).
    get stderr(): PassThrough | null {
      return state.stderrStream;
    }
    closed = false;
    constructor(public readonly params: unknown) {}
    async close(): Promise<void> {
      this.closed = true;
      state.transportCloseCount++;
    }
  }
  return { StdioClientTransport };
});

// Import the module under test AFTER vi.mock declarations.
import { McpError } from '../../src/errors.js';
import { extractMcpSkill } from '../../src/extract.js';

beforeEach(() => {
  state.capabilities = {};
  state.serverInfo = { name: 'test-server', version: '1.0.0' };
  state.connectError = undefined;
  state.earlyExit = false;
  state.earlyExitMessage = '';
  state.closeCallCount = 0;
  state.transportCloseCount = 0;
  state.stderrStream = null;
  state.listToolsImpl = async () => ({ tools: [] });
  state.listResourcesImpl = async () => ({ resources: [] });
  state.listPromptsImpl = async () => ({ prompts: [] as McpPromptListEntry[] });
  state.listToolsCalls = 0;
  state.listResourcesCalls = 0;
  state.listPromptsCalls = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const baseStdio = {
  transport: { type: 'stdio' as const, command: 'node', args: ['server.js'] }
};

describe('extractMcpSkill — happy path', () => {
  it('returns ExtractedSkill with functions, resources, prompts when all caps advertised', async () => {
    state.capabilities = { tools: {}, resources: {}, prompts: {} };
    state.serverInfo = {
      name: 'demo',
      version: '1.0.0',
      title: 'Demo MCP Server'
    };
    state.listToolsImpl = async () => ({
      tools: [{ name: 'echo', description: 'Echo input' }]
    });
    state.listResourcesImpl = async () => ({
      resources: [{ uri: 'demo://x', name: 'x', description: 'a thing' }]
    });
    state.listPromptsImpl = async () => ({
      prompts: [{ name: 'greet', description: 'say hi', arguments: [] }]
    });

    const skill: ExtractedSkill = await extractMcpSkill(baseStdio);

    expect(skill.name).toBe('demo');
    expect(skill.description).toBe('Demo MCP Server');
    expect(skill.functions).toHaveLength(1);
    expect(skill.functions[0]?.name).toBe('echo');
    expect(skill.resources).toHaveLength(1);
    expect(skill.prompts).toHaveLength(1);
    // Cleanup invariant.
    expect(state.closeCallCount + state.transportCloseCount).toBeGreaterThan(0);
  });
});

describe('extractMcpSkill — capability gating (T036)', () => {
  it('skips listResources/listPrompts when those caps are absent', async () => {
    state.capabilities = { tools: {} };
    state.listToolsImpl = async () => ({ tools: [] });
    // Mark these as throwing — the test asserts they're NOT invoked.
    state.listResourcesImpl = async () => {
      throw new Error('listResources should not have been called');
    };
    state.listPromptsImpl = async () => {
      throw new Error('listPrompts should not have been called');
    };

    const skill = await extractMcpSkill(baseStdio);

    expect(state.listToolsCalls).toBe(1);
    expect(state.listResourcesCalls).toBe(0);
    expect(state.listPromptsCalls).toBe(0);
    expect(skill.resources).toBeUndefined();
    expect(skill.prompts).toBeUndefined();
  });

  it('still calls listTools when capabilities object is empty', async () => {
    state.capabilities = {};
    state.listToolsImpl = async () => ({ tools: [] });

    const skill = await extractMcpSkill(baseStdio);

    expect(state.listToolsCalls).toBe(1);
    expect(skill.functions).toEqual([]);
    expect(skill.resources).toBeUndefined();
    expect(skill.prompts).toBeUndefined();
  });
});

describe('extractMcpSkill — cleanup on failure (T035)', () => {
  it('still closes the client when connect throws (INITIALIZE_FAILED)', async () => {
    const original = new Error('handshake failed');
    state.connectError = original;

    await expect(extractMcpSkill(baseStdio)).rejects.toMatchObject({
      code: 'INITIALIZE_FAILED'
    });

    // Cleanup: either client.close() (preferred) or transport.close() must
    // have run. We accept either since extract.ts may choose either path,
    // but at least one MUST happen.
    expect(state.closeCallCount + state.transportCloseCount).toBeGreaterThan(0);
  });

  it('wraps the original error as cause', async () => {
    const original = new Error('boom');
    state.connectError = original;

    try {
      await extractMcpSkill(baseStdio);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe('INITIALIZE_FAILED');
      expect((err as McpError).cause).toBe(original);
    }
  });
});

describe('extractMcpSkill — error mapping (T035)', () => {
  it('maps spawn ENOENT to TRANSPORT_FAILED', async () => {
    const enoent = Object.assign(new Error('spawn nonexistent ENOENT'), {
      code: 'ENOENT'
    });
    state.connectError = enoent;

    await expect(extractMcpSkill(baseStdio)).rejects.toMatchObject({
      code: 'TRANSPORT_FAILED'
    });
  });

  it('maps EACCES to TRANSPORT_FAILED', async () => {
    const eacces = Object.assign(new Error('permission denied'), {
      code: 'EACCES'
    });
    state.connectError = eacces;

    await expect(extractMcpSkill(baseStdio)).rejects.toMatchObject({
      code: 'TRANSPORT_FAILED'
    });
  });

  it('reports SERVER_EXITED_EARLY when the transport closes before connect resolves', async () => {
    state.earlyExit = true;

    await expect(extractMcpSkill(baseStdio)).rejects.toMatchObject({
      code: 'SERVER_EXITED_EARLY'
    });
  });

  it('SERVER_EXITED_EARLY message includes captured stderr content', async () => {
    // Install the stderr stream BEFORE triggering early exit so extract.ts's
    // subscription captures the bytes. The mock's connect() schedules onclose
    // on a setTimeout, giving us a microtask window to write before the
    // rejection composes its message.
    const stderrStream = new PassThrough();
    state.stderrStream = stderrStream;
    state.earlyExit = true;

    // Write stderr data synchronously after kicking off extract — extract.ts
    // subscribes to `transport.stderr` BEFORE awaiting connect, so the data
    // event fires before the (zero-delay) onclose timer.
    const promise = extractMcpSkill(baseStdio);
    stderrStream.write('Error: configuration missing\n');
    stderrStream.write('Stack trace: line 42\n');

    await expect(promise).rejects.toMatchObject({
      code: 'SERVER_EXITED_EARLY',
      message: expect.stringContaining('Error: configuration missing')
    });
  });

  it('SERVER_EXITED_EARLY message indicates "no stderr captured" when stderr is silent', async () => {
    // No stderr stream installed — message should fall back to the
    // "no stderr captured" variant.
    state.earlyExit = true;

    await expect(extractMcpSkill(baseStdio)).rejects.toMatchObject({
      code: 'SERVER_EXITED_EARLY',
      message: expect.stringMatching(/no stderr captured/i)
    });
  });

  it('preserves McpError instances thrown by inner callees (no double-wrap)', async () => {
    state.capabilities = { tools: {} };
    const inner = new McpError('cycle detected', 'SCHEMA_REF_CYCLE');
    state.listToolsImpl = async () => {
      throw inner;
    };

    try {
      await extractMcpSkill(baseStdio);
      throw new Error('expected throw');
    } catch (err) {
      // The McpError is re-thrown as-is (same instance) so its code is
      // preserved end-to-end.
      expect(err).toBe(inner);
    }
  });
});

describe('extractMcpSkill — HTTP transport URL validation', () => {
  it('rejects malformed URL with TRANSPORT_FAILED', async () => {
    await expect(
      extractMcpSkill({
        transport: { type: 'http', url: 'not-a-valid-url' }
      })
    ).rejects.toMatchObject({
      code: 'TRANSPORT_FAILED',
      message: expect.stringMatching(/Invalid URL/i)
    });
  });
});

describe('extractMcpSkill — skillName override', () => {
  it('uses options.skillName when provided', async () => {
    state.capabilities = { tools: {} };
    state.serverInfo = { name: 'underlying', version: '1.0.0' };
    state.listToolsImpl = async () => ({ tools: [] });

    const skill = await extractMcpSkill({ ...baseStdio, skillName: 'custom' });
    expect(skill.name).toBe('custom');
  });

  it('falls back to serverInfo.name when skillName not provided', async () => {
    state.capabilities = { tools: {} };
    state.serverInfo = { name: 'underlying', version: '1.0.0' };
    state.listToolsImpl = async () => ({ tools: [] });

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.name).toBe('underlying');
  });

  it('kebab-cases serverInfo.name when falling back (multi-word with spaces)', async () => {
    state.capabilities = { tools: {} };
    state.serverInfo = { name: 'Filesystem MCP Server', version: '1.0.0' };
    state.listToolsImpl = async () => ({ tools: [] });

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.name).toBe('filesystem-mcp-server');
  });

  it('falls through to "mcp-server" when serverInfo.name is empty', async () => {
    state.capabilities = { tools: {} };
    state.serverInfo = { name: '', version: '1.0.0' };
    state.listToolsImpl = async () => ({ tools: [] });

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.name).toBe('mcp-server');
  });

  it('falls through to "mcp-server" when serverInfo.name is all special chars', async () => {
    state.capabilities = { tools: {} };
    state.serverInfo = { name: '!!!', version: '1.0.0' };
    state.listToolsImpl = async () => ({ tools: [] });

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.name).toBe('mcp-server');
  });

  it('falls through to "mcp-server" when serverInfo is undefined', async () => {
    state.capabilities = { tools: {} };
    state.serverInfo = undefined;
    state.listToolsImpl = async () => ({ tools: [] });

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.name).toBe('mcp-server');
  });

  it('does NOT transform options.skillName — user input is authoritative', async () => {
    state.capabilities = { tools: {} };
    state.serverInfo = { name: 'underlying', version: '1.0.0' };
    state.listToolsImpl = async () => ({ tools: [] });

    const skill = await extractMcpSkill({
      ...baseStdio,
      skillName: 'My Custom Name'
    });
    expect(skill.name).toBe('My Custom Name');
  });
});
