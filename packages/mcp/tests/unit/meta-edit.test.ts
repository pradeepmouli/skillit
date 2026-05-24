import { describe, it, expect } from 'vitest';
import { applyMetaEdit } from '../../src/refine/build/meta-edit.js';

const BASE = `server.tool(
  'list_dir',
  { description: 'Lists a directory' },
  schema,
  handler
);`;

const WITH_META = `server.tool(
  'list_dir',
  {
    description: 'Lists a directory',
    _meta: { useWhen: 'Old value' }
  },
  schema,
  handler
);`;

describe('applyMetaEdit', () => {
  it('inserts a new _meta block when none exists', () => {
    const result = applyMetaEdit(BASE, 'list_dir', 1, 'useWhen', 'When listing dir contents');
    expect(result).toContain('_meta:');
    expect(result).toContain("useWhen: 'When listing dir contents'");
  });

  it('inserts a comma before _meta when the options object has existing properties', () => {
    const result = applyMetaEdit(BASE, 'list_dir', 1, 'useWhen', 'When listing dir contents');
    // The comma must appear between 'description' and '_meta'
    expect(result).toMatch(/description:[^}]+,\s*\n\s*_meta:/);
  });

  it('does not insert a comma when the options object is empty', () => {
    const src = `server.tool('empty_tool', {}, schema, handler);`;
    const result = applyMetaEdit(src, 'empty_tool', 1, 'useWhen', 'x');
    expect(result).toContain("_meta: { useWhen: 'x' }");
    // No leading comma inside the braces
    expect(result).not.toMatch(/\{,/);
  });

  it('updates an existing _meta field', () => {
    const result = applyMetaEdit(WITH_META, 'list_dir', 1, 'useWhen', 'New value');
    expect(result).toContain("useWhen: 'New value'");
    expect(result).not.toContain("useWhen: 'Old value'");
  });

  it('adds a new field to existing _meta', () => {
    const result = applyMetaEdit(WITH_META, 'list_dir', 1, 'avoidWhen', 'When paths loop');
    expect(result).toContain('useWhen:');
    expect(result).toContain("avoidWhen: 'When paths loop'");
  });

  it('returns source unchanged when tool not found', () => {
    const result = applyMetaEdit(BASE, 'missing_tool', 1, 'useWhen', 'x');
    expect(result).toBe(BASE);
  });

  it('returns source unchanged when existing tag value is not a quoted string', () => {
    const src = `server.tool(
  'list_dir',
  { description: 'Lists', _meta: { useWhen: someVariable } },
  schema,
  handler
);`;
    const result = applyMetaEdit(src, 'list_dir', 1, 'useWhen', 'New value');
    // Must not corrupt the source — bail out unchanged
    expect(result).toBe(src);
  });

  it('handles template literals with ${...} in options without corrupting braces', () => {
    const src = `server.tool(
  'list_dir',
  { description: \`Lists \${something} directory\` },
  schema,
  handler
);`;
    const result = applyMetaEdit(src, 'list_dir', 1, 'useWhen', 'When listing');
    expect(result).toContain('_meta:');
    expect(result).toContain("useWhen: 'When listing'");
    // Original description must be untouched
    expect(result).toContain('`Lists ${something} directory`');
  });

  it('does not treat _metadata as _meta when inserting', () => {
    const src = `server.tool(
  'list_dir',
  { description: 'Lists', _metadata: { foo: 'bar' } },
  schema,
  handler
);`;
    const result = applyMetaEdit(src, 'list_dir', 1, 'useWhen', 'When listing');
    // Should add a proper _meta block, not treat _metadata as _meta
    expect(result).toContain('_meta:');
    expect(result).toContain("useWhen: 'When listing'");
    // _metadata must remain untouched
    expect(result).toContain("_metadata: { foo: 'bar' }");
  });

  it('preserves whitespace between : and value when updating an existing tag', () => {
    const result = applyMetaEdit(WITH_META, 'list_dir', 1, 'useWhen', 'New value');
    // The space after 'useWhen:' must be preserved
    expect(result).toContain("useWhen: 'New value'");
  });

  it('handles a line comment containing } inside options without corrupting brace depth', () => {
    const src = `server.tool(
  'list_dir',
  {
    description: 'Lists', // returns }
  },
  schema,
  handler
);`;
    const result = applyMetaEdit(src, 'list_dir', 1, 'useWhen', 'When listing');
    expect(result).toContain('_meta:');
    expect(result).toContain("useWhen: 'When listing'");
    expect(result).toContain('description:');
  });

  it('escapes newlines and tabs in value so the output is a valid single-quoted string', () => {
    const result = applyMetaEdit(BASE, 'list_dir', 1, 'useWhen', 'line1\nline2\ttabbed');
    // Must not contain a raw newline or tab inside the string literal
    expect(result).toContain("useWhen: 'line1\\nline2\\ttabbed'");
    expect(result).not.toMatch(/useWhen: '[^']*\n/);
  });

  it('does not insert a double comma when options body has a trailing block comment after comma', () => {
    const src = `server.tool(
  'list_dir',
  { description: 'Lists', /* trailing */ },
  schema,
  handler
);`;
    const result = applyMetaEdit(src, 'list_dir', 1, 'useWhen', 'When listing');
    expect(result).toContain('_meta:');
    expect(result).not.toMatch(/,,/);
  });

  it('does not insert a double comma when _meta body already has a trailing comma', () => {
    const src = `server.tool(
  'list_dir',
  { description: 'Lists', _meta: { useWhen: 'Old value', } },
  schema,
  handler
);`;
    const result = applyMetaEdit(src, 'list_dir', 1, 'avoidWhen', 'When paths loop');
    expect(result).toContain("avoidWhen: 'When paths loop'");
    expect(result).not.toMatch(/,,/);
  });

  it('handles an inline comment with a brace before the options object', () => {
    const src = `server.tool('list_dir', /* note: {example} */ { description: 'Lists' }, schema, handler);`;
    const result = applyMetaEdit(src, 'list_dir', 1, 'useWhen', 'When listing');
    expect(result).toContain('_meta:');
    expect(result).toContain("useWhen: 'When listing'");
    // The comment brace must not be treated as the options object open
    expect(result).toContain('description:');
  });

  it('inserts into an empty _meta object without a leading comma', () => {
    const src = `server.tool(
  'list_dir',
  { description: 'Lists', _meta: {} },
  schema,
  handler
);`;
    const result = applyMetaEdit(src, 'list_dir', 1, 'useWhen', 'When listing');
    expect(result).toContain("useWhen: 'When listing'");
    // Must not produce invalid syntax like {, useWhen:
    expect(result).not.toMatch(/\{,/);
  });
});
