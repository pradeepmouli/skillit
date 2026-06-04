// packages/mcp/src/__tests__/mcp-command.test.ts
import { describe, it, expect } from 'vitest';
import { buildMcpCommand, mcpErrorExitCode } from '../index.js';
import { McpError } from '../errors.js';

describe('buildMcpCommand', () => {
  it('returns a command named "mcp" carrying the extract/bundle subcommands', () => {
    const cmd = buildMcpCommand();
    expect(cmd.name()).toBe('mcp');
    const names = cmd.commands.map((c) => c.name()).sort();
    expect(names).toContain('extract');
    expect(names).toContain('bundle');
  });
});

describe('mcpErrorExitCode', () => {
  it('preserves the documented exit-code mapping', () => {
    expect(mcpErrorExitCode(new McpError('x', 'AUDIT_FAILED'))).toBe(3);
    expect(mcpErrorExitCode(new McpError('x', 'DUPLICATE_SKILL_NAME'))).toBe(4);
    expect(mcpErrorExitCode(new McpError('x', 'TRANSPORT_FAILED'))).toBe(2);
    expect(mcpErrorExitCode(new McpError('x', 'UNKNOWN_TARGET'))).toBe(5);
    expect(mcpErrorExitCode(new Error('plain'))).toBe(1);
  });
});
