// packages/core/src/refine/__tests__/ast-edit.test.ts
import { describe, it, expect } from 'vitest';
import { upsertJsDocTag, upsertPropertyJsDocTag, readJsDocTags } from '../ast-edit.js';
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

  it('merges a tag into a single-line JSDoc block without mangling it', () => {
    const src = `/** Parsed options. */\nexport interface RefineCommandOpts {\n  source: string;\n}\n`;
    const out = upsertJsDocTag(src, 'RefineCommandOpts', 'pitfalls', 'NEVER trust input');
    // Exactly one comment opener, one closer, and a well-formed multi-line body.
    expect(out.match(/\/\*\*/g)).toHaveLength(1);
    expect(out.match(/\*\//g)).toHaveLength(1);
    expect(out).toContain(' * Parsed options.');
    expect(out).toMatch(/\n \* @pitfalls NEVER trust input\n \*\//);
    expect(readJsDocTags(out, 'RefineCommandOpts')).toEqual({ pitfalls: 'NEVER trust input' });
  });

  it('prefixes every line of multi-line tag content with ` * `', () => {
    const src = `/** Parsed options. */\nexport interface Opts {\n  a: string;\n}\n`;
    const out = upsertJsDocTag(src, 'Opts', 'avoidWhen', '- first reason\n- second reason');
    expect(out).toContain(' * @avoidWhen - first reason');
    expect(out).toContain(' * - second reason');
    expect(out.match(/\/\*\*/g)).toHaveLength(1);
  });

  it('does not duplicate a tag on re-run when the content is multi-line', () => {
    const src = `/** Opts. */\nexport interface O {\n  a: string;\n}\n`;
    const once = upsertJsDocTag(src, 'O', 'pitfalls', '- one\n- two');
    const twice = upsertJsDocTag(once, 'O', 'pitfalls', '- one\n- two');
    expect(twice).toBe(once);
    expect((once.match(/@pitfalls/g) ?? []).length).toBe(1);
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

describe('upsertPropertyJsDocTag', () => {
  it('creates a JSDoc block on a config-type property that has none', () => {
    const src = `export interface Cfg {\n  outDir?: string;\n}\n`;
    const out = upsertPropertyJsDocTag(src, 'Cfg', 'outDir', 'useWhen', 'emitting build artifacts');
    expect(out).toContain('@useWhen emitting build artifacts');
    expect(out.indexOf('@useWhen')).toBeLessThan(out.indexOf('outDir'));
    expect(readJsDocTags(out, 'Cfg')).toEqual({}); // tag is on the property, not the type
  });

  it('merges into an existing property JSDoc without mangling', () => {
    const src = `export interface Cfg {\n  /** Output dir. */\n  outDir?: string;\n}\n`;
    const out = upsertPropertyJsDocTag(src, 'Cfg', 'outDir', 'pitfalls', 'must be writable');
    expect(out).toContain('* Output dir.');
    expect(out).toContain('@pitfalls must be writable');
    expect(out.match(/\/\*\*/g)).toHaveLength(1);
  });

  it('rebuilds a same-line property JSDoc without over-indenting or packing the declaration', () => {
    // `/** desc */ outDir` — comment and property share a line. The indent must
    // come from the COMMENT, not the property's (post-comment) column, and the
    // declaration must drop to its own line rather than trail the closing `*/`.
    const src = `export interface Cfg {\n  /** Output directory. */ outDir?: string;\n}\n`;
    const out = upsertPropertyJsDocTag(src, 'Cfg', 'outDir', 'useWhen', 'emitting build artifacts');
    expect(out).toContain('* Output directory.');
    expect(out).toContain('@useWhen emitting build artifacts');
    // Continuation lines align at the comment's indent (2 → ` * ` star at col 3),
    // not the property's ~27-space column.
    expect(out).toMatch(/\n {3}\* Output directory\./);
    expect(out).not.toMatch(/ {6,}\*/); // no runaway indentation
    // The declaration starts on its own line, not packed after `*/`.
    expect(out).not.toMatch(/\*\/ *outDir/);
    expect(out).toMatch(/\*\/\n {2}outDir\?: string;/);
    // Still exactly one block, and a second upsert round-trips (declaration parses).
    expect(out.match(/\/\*\*/g)).toHaveLength(1);
    const twice = upsertPropertyJsDocTag(out, 'Cfg', 'outDir', 'pitfalls', 'must be writable');
    expect(twice).toContain('@pitfalls must be writable');
    expect(twice.match(/\/\*\*/g)).toHaveLength(1);
  });

  it('targets a nested property via dot path', () => {
    const src = `export interface Cfg {\n  components: { prefix: string };\n}\n`;
    const out = upsertPropertyJsDocTag(src, 'Cfg', 'components.prefix', 'useWhen', 'namespacing');
    expect(out).toContain('@useWhen namespacing');
    // landed inside the nested object, right before `prefix`
    expect(out.indexOf('@useWhen')).toBeLessThan(out.indexOf('prefix'));
  });

  it('returns source unchanged when the type or property is absent', () => {
    const src = `export interface Cfg {\n  outDir?: string;\n}\n`;
    expect(upsertPropertyJsDocTag(src, 'Nope', 'outDir', 'useWhen', 'X')).toBe(src);
    expect(upsertPropertyJsDocTag(src, 'Cfg', 'missing', 'useWhen', 'X')).toBe(src);
  });

  it('prefixes every line when CREATING a block with multi-line content', () => {
    const src = `export interface Cfg {\n  outDir?: string;\n}\n`;
    const out = upsertPropertyJsDocTag(src, 'Cfg', 'outDir', 'pitfalls', '- one\n- two\n- three');
    // No continuation bullet may sit at column 0 — every line carries ` * `.
    expect(out).not.toMatch(/\n- two/);
    expect(out).toMatch(/\* @pitfalls - one/);
    expect(out).toMatch(/\* - two/);
    expect(out).toMatch(/\* - three/);
  });

  it('escapes a comment-close sequence in content so the block stays parseable', () => {
    const src = `export interface Cfg {\n  include?: string[];\n}\n`;
    const withGlob = upsertPropertyJsDocTag(
      src,
      'Cfg',
      'include',
      'pitfalls',
      'avoid the `**/*.ts` glob — too broad'
    );
    // The glob's terminator is escaped (`*\/`), so it does not close the block.
    expect(withGlob).toContain('**\\/*.ts');
    // The declaration still parses afterward — a corrupted comment would make
    // this second upsert a no-op (property not found), returning the input.
    expect(upsertPropertyJsDocTag(withGlob, 'Cfg', 'include', 'useWhen', 'x')).not.toBe(withGlob);
  });

  it('a second tag merges cleanly onto a multi-line-created block (no malformation)', () => {
    const src = `export interface Cfg {\n  outDir?: string;\n}\n`;
    const once = upsertPropertyJsDocTag(src, 'Cfg', 'outDir', 'pitfalls', '- a\n- b');
    const twice = upsertPropertyJsDocTag(once, 'Cfg', 'outDir', 'useWhen', 'when emitting');
    // Both tags present, exactly one comment, every body line prefixed.
    expect(twice).toContain('@pitfalls - a');
    expect(twice).toContain('@useWhen when emitting');
    expect(twice.match(/\/\*\*/g)).toHaveLength(1);
    expect(twice).not.toMatch(/\n- b/);
    expect(readJsDocTags(twice, 'outDir')).toBeDefined(); // declaration still parses
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

  it('captures multi-line tag content (continuation lines), not just the first line', () => {
    const src = upsertJsDocTag(`export interface O {}\n`, 'O', 'pitfalls', '- one\n- two\n- three');
    expect(readJsDocTags(src, 'O')).toEqual({ pitfalls: '- one\n- two\n- three' });
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
