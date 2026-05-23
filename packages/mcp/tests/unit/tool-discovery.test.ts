import { discoverTools } from '../../src/refine/build/tool-discovery.js';
import { describe, it, expect } from 'vitest';

const FIXTURE_ONE = `
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
const server = new McpServer({ name: 'test', version: '1' });
server.tool(
  'list_dir',
  { description: 'Lists a directory' },
  schema,
  handler
);
`;

const FIXTURE_TWO_TOOLS = `
server.tool('tool_a', { description: 'A' }, schema, handler);
server.tool('tool_b', { description: 'B' }, schema, handler);
`;

const FIXTURE_MINIMAL = `
server.tool('minimal_tool', schema, handler);
`;

describe('discoverTools', () => {
  it('finds a single tool with options object', () => {
    const result = discoverTools('test.ts', FIXTURE_ONE);
    expect(result.tools.has('list_dir')).toBe(true);
    expect(result.tools.get('list_dir')).toMatchObject({
      file: 'test.ts',
      line: expect.any(Number)
    });
  });

  it('finds multiple tools in one file', () => {
    const result = discoverTools('test.ts', FIXTURE_TWO_TOOLS);
    expect(result.tools.has('tool_a')).toBe(true);
    expect(result.tools.has('tool_b')).toBe(true);
  });

  it('skips minimal two-argument form and emits a warning', () => {
    const result = discoverTools('test.ts', FIXTURE_MINIMAL);
    expect(result.tools.has('minimal_tool')).toBe(false);
    expect(result.warnings.some((w) => w.includes('minimal_tool'))).toBe(true);
  });

  it('returns empty map for source with no tool calls', () => {
    const result = discoverTools('test.ts', 'const x = 1;');
    expect(result.tools.size).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('ignores server.tool() calls inside line comments', () => {
    const src = `
// server.tool('commented_out', { description: 'nope' }, schema, handler);
server.tool('real_tool', { description: 'yes' }, schema, handler);
`;
    const result = discoverTools('test.ts', src);
    expect(result.tools.has('commented_out')).toBe(false);
    expect(result.tools.has('real_tool')).toBe(true);
  });

  it('ignores server.tool() calls inside block comments', () => {
    const src = `
/*
 * server.tool('in_block', { description: 'ignored' }, schema, handler);
 */
server.tool('real_tool', { description: 'yes' }, schema, handler);
`;
    const result = discoverTools('test.ts', src);
    expect(result.tools.has('in_block')).toBe(false);
    expect(result.tools.has('real_tool')).toBe(true);
  });

  it('ignores server.tool() calls inside template literals (fixture strings)', () => {
    const src = `
const fixture = \`server.tool('fixture_tool', { description: 'fake' }, schema, handler);\`;
server.tool('real_tool', { description: 'yes' }, schema, handler);
`;
    const result = discoverTools('test.ts', src);
    expect(result.tools.has('fixture_tool')).toBe(false);
    expect(result.tools.has('real_tool')).toBe(true);
  });

  it('detects options object when a block comment appears between name and options', () => {
    const src = `server.tool('commented_gap', /* opts */ { description: 'x' }, schema, handler);`;
    const result = discoverTools('test.ts', src);
    expect(result.tools.has('commented_gap')).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('ignores server.tool() calls inside double-quoted string literals', () => {
    const src = `
const sample = "server.tool('string_tool', { description: 'fake' }, schema, handler);";
server.tool('real_tool', { description: 'yes' }, schema, handler);
`;
    const result = discoverTools('test.ts', src);
    expect(result.tools.has('string_tool')).toBe(false);
    expect(result.tools.has('real_tool')).toBe(true);
  });
});
