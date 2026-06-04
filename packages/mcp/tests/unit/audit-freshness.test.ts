/**
 * Unit tests (T087) for `auditAdapterFreshness` — FR-IT-013 rule M5.
 *
 * Covers:
 *   1. Same version → no issue.
 *   2. Embedded older (1.0.0 < 1.1.0) → 1 warning.
 *   3. Embedded newer (consumer downgrade) → no issue.
 *   4. Multi-digit version components (1.0.10 vs 1.0.2) → numeric compare.
 *   5. Major-version difference, embedded newer (2.0.0 vs 1.99.99) → no issue.
 *   6. Patch-only difference, embedded older (1.0.0 vs 1.0.1) → 1 warning.
 */

import type { AdapterFingerprint, ExtractedSkill } from '@skillit/core';
import { describe, expect, it } from 'vitest';
import { auditAdapterFreshness } from '../../src/audit/freshness.js';
import type { InvocationAdapter } from '../../src/adapter/types.js';

const skill: ExtractedSkill = {
  name: 'fixture',
  description: 'fixture skill for freshness audit unit tests',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

function makeAdapter(version: string): InvocationAdapter {
  return {
    target: 'cli:mcpc',
    fingerprint: {
      adapter: '@skillit/target-mcpc',
      version,
      targetCliRange: 'mcpc@^2.1'
    },
    // The freshness rule never invokes render; a no-op stub keeps the
    // structural type satisfied without coupling the test to the real
    // adapter package.
    render: async () => {
      throw new Error('not used in freshness tests');
    }
  };
}

function makeEmbeddedFingerprint(version: string): AdapterFingerprint {
  return {
    adapter: '@skillit/target-mcpc',
    version,
    targetCliRange: 'mcpc@^2.1'
  };
}

describe('auditAdapterFreshness — rule M5', () => {
  it('returns no issue when embedded version equals installed version', () => {
    const issues = auditAdapterFreshness(
      skill,
      makeEmbeddedFingerprint('1.2.3'),
      makeAdapter('1.2.3')
    );
    expect(issues).toEqual([]);
  });

  it('returns one M5 warning when embedded is older than installed', () => {
    const issues = auditAdapterFreshness(
      skill,
      makeEmbeddedFingerprint('1.0.0'),
      makeAdapter('1.1.0')
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('M5');
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.message).toContain('1.0.0');
    expect(issues[0]!.message).toContain('1.1.0');
    expect(issues[0]!.message).toContain('@skillit/target-mcpc');
  });

  it('returns no issue when embedded is newer than installed (consumer downgraded)', () => {
    const issues = auditAdapterFreshness(
      skill,
      makeEmbeddedFingerprint('1.1.0'),
      makeAdapter('1.0.0')
    );
    expect(issues).toEqual([]);
  });

  it('compares multi-digit version components numerically (1.0.10 > 1.0.2)', () => {
    // Embedded 1.0.10, installed 1.0.2 — embedded is NEWER so no issue.
    // A naive lexicographic compare would mis-flag this.
    const issues = auditAdapterFreshness(
      skill,
      makeEmbeddedFingerprint('1.0.10'),
      makeAdapter('1.0.2')
    );
    expect(issues).toEqual([]);

    // Inverse: embedded 1.0.2, installed 1.0.10 — embedded is OLDER, expect warning.
    const inverseIssues = auditAdapterFreshness(
      skill,
      makeEmbeddedFingerprint('1.0.2'),
      makeAdapter('1.0.10')
    );
    expect(inverseIssues).toHaveLength(1);
    expect(inverseIssues[0]!.code).toBe('M5');
  });

  it('handles major-version difference where embedded is newer (2.0.0 vs 1.99.99)', () => {
    const issues = auditAdapterFreshness(
      skill,
      makeEmbeddedFingerprint('2.0.0'),
      makeAdapter('1.99.99')
    );
    expect(issues).toEqual([]);
  });

  it('flags patch-only difference where embedded is older (1.0.0 vs 1.0.1)', () => {
    const issues = auditAdapterFreshness(
      skill,
      makeEmbeddedFingerprint('1.0.0'),
      makeAdapter('1.0.1')
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('M5');
    expect(issues[0]!.severity).toBe('warning');
  });

  it('skips audit when embedded version is malformed (empty / non-semver)', () => {
    // Without the early-exit guard, parseSemver would return [0] for these
    // and emit a spurious M5 against any real installed version.
    expect(auditAdapterFreshness(skill, makeEmbeddedFingerprint(''), makeAdapter('1.2.3'))).toEqual(
      []
    );
    expect(
      auditAdapterFreshness(skill, makeEmbeddedFingerprint('unknown'), makeAdapter('1.2.3'))
    ).toEqual([]);
    expect(
      auditAdapterFreshness(skill, makeEmbeddedFingerprint('dev'), makeAdapter('1.2.3'))
    ).toEqual([]);
  });

  it('skips audit when installed version is malformed', () => {
    expect(auditAdapterFreshness(skill, makeEmbeddedFingerprint('1.2.3'), makeAdapter(''))).toEqual(
      []
    );
    expect(
      auditAdapterFreshness(skill, makeEmbeddedFingerprint('1.2.3'), makeAdapter('unknown'))
    ).toEqual([]);
  });
});
