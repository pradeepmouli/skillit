import { insertJsDocTag } from '../../src/refine/jsdoc-edit.js';
import { describe, it, expect } from 'vitest';

describe('insertJsDocTag', () => {
  it('inserts a tag into a new JSDoc block', () => {
    const source = `export function greet(name: string) {}\n`;
    const result = insertJsDocTag(source, 'greet', 'useWhen', 'greeting a user');
    expect(result).toContain('@useWhen greeting a user');
    expect(result).toContain('/**');
  });

  it('returns source unchanged when export not found', () => {
    const source = `export function other() {}\n`;
    const result = insertJsDocTag(source, 'missing', 'useWhen', 'x');
    expect(result).toBe(source);
  });
});
