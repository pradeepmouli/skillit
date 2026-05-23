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
});
