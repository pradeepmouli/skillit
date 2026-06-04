/**
 * Compile-time assertions for the {@link AdapterRenderContext} discriminated
 * union (002-mcp-hardening US1, FR-H001/FR-H002/FR-H003).
 *
 * Each test below uses `// @ts-expect-error` to assert that an illegal
 * construction pattern fails to compile. If the union ever loses an arm or
 * gains a field that re-admits one of these patterns, the corresponding
 * `@ts-expect-error` becomes itself an error and surfaces on
 * `pnpm vitest --typecheck`.
 *
 * The runtime body is empty — Vitest's typecheck mode only inspects types.
 */

import { test } from 'vitest';
// Source-path import: @skillit/mcp's dist/ is not committed, so a clean
// checkout cannot resolve the package by name without a built workspace.
// The DU shape is the same whether imported from the public name or the
// source path — the negative compile-time assertions below exercise the
// type definitions directly.
import type { AdapterRenderContext } from '../../src/index.js';

test('(a) bundle arm rejects launchCommand (two arms set)', () => {
  // The bundle arm has no `launchCommand` field; including one is an
  // excess-property error on the object literal — TypeScript reports the
  // error on the `launchCommand:` line itself.
  const _bad: AdapterRenderContext = {
    mode: 'bundle',
    skillName: 'x',
    maxTokens: 4000,
    canonicalize: true,
    packageName: 'p',
    // @ts-expect-error — bundle arm cannot carry launchCommand
    launchCommand: { command: 'node' }
  };
  void _bad;
});

test('(b) http arm rejects packageName (wrong field for arm)', () => {
  // The http arm has no `packageName` field, and is missing the required
  // `httpEndpoint`. The excess `packageName` is reported by TypeScript
  // directly on the offending line.
  const _bad: AdapterRenderContext = {
    mode: 'http',
    skillName: 'x',
    maxTokens: 4000,
    canonicalize: true,
    httpEndpoint: { url: 'https://example.com/mcp' },
    // @ts-expect-error — http arm cannot carry packageName
    packageName: 'p'
  };
  void _bad;
});

test('(c) bundle arm requires packageName (missing required field)', () => {
  // The bundle arm's `packageName` is required — TypeScript reports the
  // error on the `const _bad:` declaration where the literal is assigned.
  // @ts-expect-error — bundle arm requires packageName
  const _bad: AdapterRenderContext = {
    mode: 'bundle',
    skillName: 'x',
    maxTokens: 4000,
    canonicalize: true
  };
  void _bad;
});
