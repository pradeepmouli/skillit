// packages/typedoc/src/refine/__tests__/jsdoc-edit.test.ts
import { describe, it, expect } from 'vitest';
import { insertJsDocTag } from '../jsdoc-edit.js';

const fnWithDoc = `
/**
 * List all files in a directory.
 */
export function listFiles(path: string): string[] {
  return [];
}
`;

const fnWithoutDoc = `
export function listFiles(path: string): string[] {
  return [];
}
`;

describe('insertJsDocTag', () => {
  it('adds tag to existing JSDoc block', () => {
    const result = insertJsDocTag(
      fnWithDoc,
      'listFiles',
      'useWhen',
      'When listing directory contents'
    );
    expect(result).toContain('@useWhen When listing directory contents');
    expect(result).toContain('List all files');
  });

  it('creates new JSDoc block when none exists', () => {
    const result = insertJsDocTag(fnWithoutDoc, 'listFiles', 'useWhen', 'When listing');
    expect(result).toContain('/**');
    expect(result).toContain('@useWhen When listing');
    expect(result).toContain('*/');
  });

  it('is a no-op when export is not found', () => {
    const result = insertJsDocTag(fnWithDoc, 'nonExistent', 'useWhen', 'value');
    expect(result).toBe(fnWithDoc);
  });

  it('does not duplicate an already-present tag', () => {
    const withTag = insertJsDocTag(fnWithDoc, 'listFiles', 'useWhen', 'When listing');
    const again = insertJsDocTag(withTag, 'listFiles', 'useWhen', 'When listing');
    const count = (again.match(/@useWhen/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('preserves surrounding code', () => {
    const source = `const x = 1;\n${fnWithDoc}\nconst y = 2;`;
    const result = insertJsDocTag(source, 'listFiles', 'useWhen', 'When listing');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('const y = 2;');
  });
});
