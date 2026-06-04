// packages/core/src/refine/__tests__/ast-edit.test.ts
import { describe, it, expect } from 'vitest';
import { upsertJsDocTag, readJsDocTags } from '../ast-edit.js';
import type { RefineTag } from '../types.js';

describe('upsertJsDocTag', () => {
  it('creates a JSDoc block when the export has none', () => {
    const src = `export function loadConfig(path: string) {}\n`;
    const out = upsertJsDocTag(src, 'loadConfig', 'useWhen', 'Loading config');
    expect(out).toContain('/**');
    expect(out).toContain('@useWhen Loading config');
    expect(out.indexOf('/**')).toBeLessThan(out.indexOf('export function loadConfig'));
  });

  it('appends a tag into an existing JSDoc block', () => {
    const src = `/**\n * Parse.\n */\nexport function parse() {}\n`;
    const out = upsertJsDocTag(src, 'parse', 'pitfalls', 'NEVER trust input');
    expect(out).toContain('* Parse.');
    expect(out).toContain('@pitfalls NEVER trust input');
    // Exact alignment: the appended line must keep the surrounding ` * ` indent
    expect(out).toMatch(/\n \* @pitfalls NEVER trust input\n/);
    expect(out.match(/\/\*\*/g)).toHaveLength(1);
  });

  it('is idempotent for an identical tag', () => {
    const src = `/**\n * @useWhen X\n */\nexport const f = () => {};\n`;
    expect(upsertJsDocTag(src, 'f', 'useWhen', 'X')).toBe(src);
  });

  it('annotates an interface declaration', () => {
    const src = `export interface GenOptions {\n  grammar: string;\n}\n`;
    const out = upsertJsDocTag(src, 'GenOptions', 'useWhen', 'Generating');
    expect(out).toContain('@useWhen Generating');
  });

  it('annotates an enum declaration', () => {
    const src = `export enum Color {\n  Red,\n  Green\n}\n`;
    const out = upsertJsDocTag(src, 'Color', 'useWhen', 'Picking a color');
    expect(out).toContain('@useWhen Picking a color');
    expect(out.indexOf('/**')).toBeLessThan(out.indexOf('export enum Color'));
  });

  it('annotates an abstract class declaration', () => {
    const src = `export abstract class Base {}\n`;
    const out = upsertJsDocTag(src, 'Base', 'useWhen', 'Subclassing');
    expect(out).toContain('@useWhen Subclassing');
    expect(out.indexOf('/**')).toBeLessThan(out.indexOf('export abstract class Base'));
  });

  it('returns source unchanged when the declaration is absent', () => {
    const src = `export const other = 1;\n`;
    expect(upsertJsDocTag(src, 'missing', 'useWhen', 'X')).toBe(src);
  });

  it('does not match a comment mentioning the name', () => {
    const src = `// loadConfig is great\nexport const loadConfig = () => {};\n`;
    const out = upsertJsDocTag(src, 'loadConfig', 'useWhen', 'Y');
    expect(out).toContain('@useWhen Y');
    expect(out.indexOf('@useWhen Y')).toBeGreaterThan(out.indexOf('// loadConfig is great'));
  });

  it('inserts a JSDoc block above a non-exported interface', () => {
    const src = `interface GenOptions {\n  grammar: string;\n}\n`;
    const out = upsertJsDocTag(src, 'GenOptions', 'useWhen', 'Generating');
    expect(out).toContain('@useWhen Generating');
    // The tag must land immediately before the bare `interface GenOptions`.
    expect(out.indexOf('/**')).toBeLessThan(out.indexOf('interface GenOptions'));
    expect(out.indexOf('@useWhen Generating')).toBeLessThan(out.indexOf('interface GenOptions'));
  });

  it('merges a tag into an existing JSDoc block on a non-exported interface', () => {
    const src = `/**\n * Options.\n */\ninterface GenOptions {\n  grammar: string;\n}\n`;
    const out = upsertJsDocTag(src, 'GenOptions', 'pitfalls', 'NEVER trust input');
    expect(out).toContain('* Options.');
    expect(out).toContain('@pitfalls NEVER trust input');
    expect(out.match(/\/\*\*/g)).toHaveLength(1);
  });
});

describe('readJsDocTags', () => {
  it('returns tag content from an existing leading JSDoc block', () => {
    const src = `/**\n * @useWhen Foo\n */\nexport function f() {}\n`;
    expect(readJsDocTags(src, 'f')).toEqual({ useWhen: 'Foo' });
  });

  it('returns empty object for absent declaration', () => {
    const src = `export const other = 1;\n`;
    expect(readJsDocTags(src, 'missing')).toEqual({});
  });

  it('returns empty object when no JSDoc block is present', () => {
    const src = `export function f() {}\n`;
    expect(readJsDocTags(src, 'f')).toEqual({});
  });

  it('parses multiple tags', () => {
    const src = `/**\n * @useWhen Foo\n * @pitfalls Bar\n */\nexport function f() {}\n`;
    expect(readJsDocTags(src, 'f')).toEqual({ useWhen: 'Foo', pitfalls: 'Bar' });
  });

  it('reads a tag from a non-exported interface leading JSDoc', () => {
    const src = `/**\n * @useWhen Generating\n */\ninterface GenOptions {\n  grammar: string;\n}\n`;
    expect(readJsDocTags(src, 'GenOptions')).toEqual({ useWhen: 'Generating' });
  });

  it('round-trips every RefineTag value', () => {
    const allTags: readonly RefineTag[] = [
      'useWhen',
      'avoidWhen',
      'pitfalls',
      'remarks',
      'example'
    ];
    for (const tag of allTags) {
      const content = `value-for-${tag}`;
      const src = upsertJsDocTag(`export function f() {}\n`, 'f', tag, content);
      expect(readJsDocTags(src, 'f')).toEqual({ [tag]: content });
    }
  });
});
