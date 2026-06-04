/**
 * Smoke test for `@skillit/mcp/adapter-utils` subpath export.
 *
 * Two layers of protection:
 *
 * 1. **Source import callable check**: imports the 7 helpers via the source
 *    path (so the test runs without a built `dist/`) and asserts each is a
 *    function. Catches accidental symbol removal.
 *
 * 2. **`package.json` exports map check**: parses `packages/mcp/package.json`
 *    and asserts the `exports["./adapter-utils"]` mapping points to
 *    `dist/adapter/cli-tools-helpers.{js,d.ts}`. Catches breakage of the
 *    actual subpath consumers (`@skillit/target-mcpc`, `target-fastmcp`,
 *    third-party adapters) would hit at runtime — without requiring a built
 *    `dist/` for the test itself.
 *
 * Behavioral correctness is gated by the inline-snapshot tests in
 * `target-mcpc` and `target-fastmcp`.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collapseTrailingNewlines,
  formatCliMarker,
  parameterToSchema,
  planForTool,
  renderToolsBody,
  resolveLaunchCommand,
  shellQuote
} from '../../src/adapter/cli-tools-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = resolve(__dirname, '..', '..', 'package.json');

describe('@skillit/mcp/adapter-utils — public surface', () => {
  it('exports the 7 mandated helpers as functions (source-path probe)', () => {
    expect(typeof resolveLaunchCommand).toBe('function');
    expect(typeof formatCliMarker).toBe('function');
    expect(typeof shellQuote).toBe('function');
    expect(typeof collapseTrailingNewlines).toBe('function');
    expect(typeof renderToolsBody).toBe('function');
    expect(typeof planForTool).toBe('function');
    expect(typeof parameterToSchema).toBe('function');
  });

  it('declares the ./adapter-utils subpath in package.json exports', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as {
      exports?: Record<string, { types?: string; import?: string }>;
    };
    expect(pkg.exports).toBeDefined();
    expect(pkg.exports!['./adapter-utils']).toEqual({
      types: './dist/adapter/cli-tools-helpers.d.ts',
      import: './dist/adapter/cli-tools-helpers.js'
    });
  });
});
