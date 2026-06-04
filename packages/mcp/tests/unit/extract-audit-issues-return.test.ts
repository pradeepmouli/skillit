// US3 (FR-H006) — `extractMcpSkill` surfaces audit findings on the return
// value via `ExtractedSkill.auditIssues` so programmatic callers can gate CI
// on structured `AuditIssue[]` without forking stderr.
//
// Tri-state semantics covered here:
//   undefined  — audit was skipped (`options.audit.skip === true`)
//   []         — audit ran clean
//   [...]      — audit found issues (we exercise Rule M1 — empty description)
//
// Mock strategy mirrors `extract.test.ts`: vi.mock the SDK Client +
// StdioClientTransport so we can drive `listTools` from per-test state and
// avoid spawning a real child process.

import type { ExtractedSkill } from '@skillit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpPromptListEntry } from '../../src/introspect/client-types.js';

type CapShape = {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
} & Record<string, unknown>;

type ServerInfo = { name: string; version: string; title?: string };

interface MockState {
  capabilities: CapShape;
  serverInfo: ServerInfo | undefined;
  listToolsImpl: () => Promise<{ tools: unknown[]; nextCursor?: string }>;
  listResourcesImpl: () => Promise<{ resources: unknown[]; nextCursor?: string }>;
  listPromptsImpl: () => Promise<{ prompts: McpPromptListEntry[]; nextCursor?: string }>;
}

const state: MockState = {
  capabilities: {},
  serverInfo: undefined,
  listToolsImpl: async () => ({ tools: [] }),
  listResourcesImpl: async () => ({ resources: [] }),
  listPromptsImpl: async () => ({ prompts: [] as McpPromptListEntry[] })
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class Client {
    constructor(
      public readonly clientInfo: unknown,
      public readonly options: unknown
    ) {}
    async connect(_transport: { onclose?: () => void }): Promise<void> {
      // No-op: tests in this file all want a clean handshake so we can
      // observe the audit-result side of the call.
    }
    getServerCapabilities(): CapShape {
      return state.capabilities;
    }
    getServerVersion(): ServerInfo | undefined {
      return state.serverInfo;
    }
    async listTools(): Promise<{ tools: unknown[]; nextCursor?: string }> {
      return state.listToolsImpl();
    }
    async listResources(): Promise<{ resources: unknown[]; nextCursor?: string }> {
      return state.listResourcesImpl();
    }
    async listPrompts(): Promise<{ prompts: McpPromptListEntry[]; nextCursor?: string }> {
      return state.listPromptsImpl();
    }
    async close(): Promise<void> {
      /* noop */
    }
  }
  return { Client };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  class StdioClientTransport {
    onclose?: () => void;
    get stderr(): null {
      return null;
    }
    closed = false;
    constructor(public readonly params: unknown) {}
    async close(): Promise<void> {
      this.closed = true;
    }
  }
  return { StdioClientTransport };
});

// Import after vi.mock declarations.
import { extractMcpSkill } from '../../src/extract.js';

beforeEach(() => {
  state.capabilities = { tools: {} };
  state.serverInfo = { name: 'audit-return-test', version: '1.0.0' };
  state.listToolsImpl = async () => ({ tools: [] });
  state.listResourcesImpl = async () => ({ resources: [] });
  state.listPromptsImpl = async () => ({ prompts: [] as McpPromptListEntry[] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const baseStdio = {
  transport: { type: 'stdio' as const, command: 'node', args: ['server.js'] }
};

describe('extractMcpSkill — auditIssues return value (US3, FR-H006)', () => {
  it('leaves auditIssues undefined when audit is skipped', async () => {
    // A tool with empty description would normally trip Rule M1 (fatal).
    // With skip:true we expect auditIssues to be undefined — the field's
    // absence is the signal that audit didn't run.
    state.listToolsImpl = async () => ({
      tools: [{ name: 'broken', description: '' }]
    });

    const skill: ExtractedSkill = await extractMcpSkill({
      ...baseStdio,
      audit: { skip: true }
    });

    expect(skill.audit).toEqual({ status: 'skipped' });
    expect(skill.auditIssues).toBeUndefined();
  });

  it('returns auditIssues as [] when audit ran and found no issues', async () => {
    // All metadata is well-formed:
    //   M1 — description is non-empty
    //   M2 — schema is valid (no `tags.schemaError` will be set)
    //   M3 — `_meta.toSkills.useWhen` provides a discovery trigger
    //   M4 — name is not in the generic-name set
    state.listToolsImpl = async () => ({
      tools: [
        {
          name: 'create_user',
          description: 'Creates a new user account with the given email.',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string', description: 'Email address of the new user.' }
            },
            required: ['email']
          },
          _meta: {
            useWhen: 'user wants to create a new user account'
          }
        }
      ]
    });

    const skill = await extractMcpSkill(baseStdio);

    expect(skill.audit).toEqual({ status: 'completed', issues: [] });
    expect(skill.auditIssues).toBeDefined();
    expect(skill.auditIssues).toEqual([]);
  });

  it('returns auditIssues with M1 finding when a tool has empty description', async () => {
    // Rule M1 — missing tool description — is fatal-severity. We expect at
    // least one issue with code 'M1' surfaced on the skill.
    state.listToolsImpl = async () => ({
      tools: [{ name: 'mystery', description: '' }]
    });

    const skill = await extractMcpSkill(baseStdio);

    expect(skill.audit?.status).toBe('completed');
    expect(skill.audit?.issues).toEqual(skill.auditIssues);
    expect(skill.auditIssues).toBeDefined();
    expect(skill.auditIssues!.length).toBeGreaterThan(0);
    expect(skill.auditIssues![0]!.code).toBe('M1');
    expect(skill.auditIssues![0]!.severity).toBe('fatal');
    expect(skill.auditIssues![0]!.location?.tool).toBe('mystery');
  });
});
