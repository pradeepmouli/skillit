import { describe, it, expect } from 'vitest';
import { formatAuditText, formatAuditJson } from '@skillit/core';
import type { AuditResult } from '@skillit/core';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const MOCK_RESULT: AuditResult = {
  package: '@my-org/my-lib',
  summary: { fatal: 2, error: 3, warning: 1, alert: 0 },
  issues: [
    // fatal — two issues in different files
    {
      severity: 'fatal',
      code: 'F1',
      file: 'package.json',
      line: null,
      symbol: 'description',
      message: 'Missing package.json description',
      suggestion: 'Add a one-sentence description to package.json'
    },
    {
      severity: 'fatal',
      code: 'F4',
      file: 'src/renderer.ts',
      line: 42,
      symbol: 'renderSkill',
      message: 'renderSkill() — no JSDoc summary',
      suggestion: '/** Render a single extracted skill... */'
    },
    // error — three issues, two in same file
    {
      severity: 'error',
      code: 'E1',
      file: 'src/parser.ts',
      line: 10,
      symbol: 'parse#input',
      message: "Parameter 'input' in 'parse' is missing a description",
      suggestion: "Add @param input <description> to the JSDoc for 'parse'"
    },
    {
      severity: 'error',
      code: 'E1',
      file: 'src/parser.ts',
      line: 10,
      symbol: 'parse#options',
      message: "Parameter 'options' in 'parse' is missing a description",
      suggestion: "Add @param options <description> to the JSDoc for 'parse'"
    },
    {
      severity: 'error',
      code: 'E4',
      file: 'src/index.ts',
      line: null,
      symbol: '@my-org/my-lib',
      message: 'No @example tags found anywhere in the package',
      suggestion: 'Add @example code blocks to at least one exported function'
    },
    // warning — one issue
    {
      severity: 'warning',
      code: 'W1',
      file: 'src/index.ts',
      line: null,
      symbol: '@my-org/my-lib',
      message: 'Module-level @packageDocumentation JSDoc is missing',
      suggestion:
        'Add a /** @packageDocumentation */ comment with a detailed description (>50 chars)'
    }
  ],
  passing: [
    { code: 'F2', message: 'Keywords meet requirements', detail: '5 total, 4 domain-specific' },
    { code: 'F3', message: 'README description exists and is meaningful' },
    { code: 'E2', message: 'All non-void functions have @returns descriptions' },
    { code: 'E3', message: 'All interface/type properties have JSDoc descriptions' },
    {
      code: 'E5',
      message: 'Repository URL is present',
      detail: 'https://github.com/my-org/my-lib'
    },
    { code: 'W2', message: 'Every function has at least one @example' },
    { code: 'W3', message: 'At least one function uses notable JSDoc tags' },
    { code: 'W4', message: 'Excellent keyword coverage', detail: '12 domain-specific keywords' },
    { code: 'W5', message: 'README has a Features section' },
    { code: 'W6', message: 'README has a Pitfalls/Caveats section' },
    { code: 'A1', message: 'No generic keywords found' },
    { code: 'A2', message: 'No parameters trivially restate their name' },
    { code: 'A3', message: 'All examples are non-trivial' },
    { code: 'A4', message: 'Quick Start code blocks are concise' }
  ]
};

// ---------------------------------------------------------------------------
// formatAuditText
// ---------------------------------------------------------------------------

describe('formatAuditText', () => {
  it('includes the package name in the summary header', () => {
    const text = formatAuditText(MOCK_RESULT);
    expect(text).toContain('@my-org/my-lib');
  });

  it('shows correct counts in the summary line', () => {
    const text = formatAuditText(MOCK_RESULT);
    expect(text).toContain('2 fatal · 3 error · 1 warning · 0 alert');
  });

  it('groups issues under FATAL section', () => {
    const text = formatAuditText(MOCK_RESULT);
    expect(text).toContain('FATAL (2)');
  });

  it('groups issues under ERROR section', () => {
    const text = formatAuditText(MOCK_RESULT);
    expect(text).toContain('ERROR (3)');
  });

  it('groups issues under WARNING section', () => {
    const text = formatAuditText(MOCK_RESULT);
    expect(text).toContain('WARNING (1)');
  });

  it('omits empty severity groups (alert has 0 issues)', () => {
    const text = formatAuditText(MOCK_RESULT);
    expect(text).not.toContain('ALERT');
  });

  it('orders severity sections fatal → error → warning', () => {
    const text = formatAuditText(MOCK_RESULT);
    const fatalIdx = text.indexOf('FATAL');
    const errorIdx = text.indexOf('ERROR');
    const warnIdx = text.indexOf('WARNING');
    expect(fatalIdx).toBeLessThan(errorIdx);
    expect(errorIdx).toBeLessThan(warnIdx);
  });

  it('includes file reference without line for line-null issues', () => {
    const text = formatAuditText(MOCK_RESULT);
    // F1 has line: null — should appear as just "package.json"
    expect(text).toContain('package.json');
    // Should NOT contain "package.json:null"
    expect(text).not.toContain('package.json:null');
  });

  it('includes file:line reference when line is present', () => {
    const text = formatAuditText(MOCK_RESULT);
    // F4 is in src/renderer.ts line 42
    expect(text).toContain('src/renderer.ts:42');
  });

  it('includes issue messages', () => {
    const text = formatAuditText(MOCK_RESULT);
    expect(text).toContain('Missing package.json description');
    expect(text).toContain('renderSkill() — no JSDoc summary');
  });

  it('includes suggestions for every issue', () => {
    const text = formatAuditText(MOCK_RESULT);
    expect(text).toContain('Add a one-sentence description to package.json');
    expect(text).toContain('/** Render a single extracted skill... */');
  });

  it('lists passing checks at the end', () => {
    const text = formatAuditText(MOCK_RESULT);
    expect(text).toContain('PASSING (14 checks)');
    expect(text).toContain('✓ Keywords meet requirements');
    expect(text).toContain('✓ README description exists and is meaningful');
    expect(text).toContain('✓ Repository URL is present');
  });

  it('includes detail for passing checks that have detail', () => {
    const text = formatAuditText(MOCK_RESULT);
    // F2 has detail "5 total, 4 domain-specific"
    expect(text).toContain('5 total, 4 domain-specific');
  });

  it('passing checks appear after all issue groups', () => {
    const text = formatAuditText(MOCK_RESULT);
    const warnIdx = text.indexOf('WARNING');
    const passingIdx = text.indexOf('PASSING');
    expect(passingIdx).toBeGreaterThan(warnIdx);
  });

  it('works when there are no issues (all passing)', () => {
    const allPassing: AuditResult = {
      package: 'clean-lib',
      summary: { fatal: 0, error: 0, warning: 0, alert: 0 },
      issues: [],
      passing: [{ code: 'F1', message: 'package.json description exists' }]
    };
    const text = formatAuditText(allPassing);
    expect(text).toContain('clean-lib');
    expect(text).toContain('0 fatal · 0 error · 0 warning · 0 alert');
    expect(text).toContain('PASSING (1 checks)');
    expect(text).not.toContain('FATAL');
    expect(text).not.toContain('ERROR');
  });

  it('works when there are no passing checks', () => {
    const allFailing: AuditResult = {
      package: 'bad-lib',
      summary: { fatal: 1, error: 0, warning: 0, alert: 0 },
      issues: [
        {
          severity: 'fatal',
          code: 'F1',
          file: 'package.json',
          line: null,
          symbol: 'description',
          message: 'Missing description',
          suggestion: 'Add a description'
        }
      ],
      passing: []
    };
    const text = formatAuditText(allFailing);
    expect(text).toContain('FATAL (1)');
    expect(text).not.toContain('PASSING');
  });

  it('groups multiple issues in the same file together', () => {
    const text = formatAuditText(MOCK_RESULT);
    // src/parser.ts:10 has two error issues — file ref should appear once as header
    const matches = text.match(/src\/parser\.ts:10/g);
    expect(matches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// formatAuditJson
// ---------------------------------------------------------------------------

describe('formatAuditJson', () => {
  it('returns valid JSON', () => {
    const json = formatAuditJson(MOCK_RESULT);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('round-trips the full result', () => {
    const json = formatAuditJson(MOCK_RESULT);
    const parsed = JSON.parse(json) as AuditResult;
    expect(parsed).toEqual(MOCK_RESULT);
  });

  it('preserves package name', () => {
    const json = formatAuditJson(MOCK_RESULT);
    const parsed = JSON.parse(json) as AuditResult;
    expect(parsed.package).toBe('@my-org/my-lib');
  });

  it('preserves summary counts', () => {
    const json = formatAuditJson(MOCK_RESULT);
    const parsed = JSON.parse(json) as AuditResult;
    expect(parsed.summary).toEqual({ fatal: 2, error: 3, warning: 1, alert: 0 });
  });

  it('preserves all issues', () => {
    const json = formatAuditJson(MOCK_RESULT);
    const parsed = JSON.parse(json) as AuditResult;
    expect(parsed.issues).toHaveLength(6);
  });

  it('preserves all passing checks', () => {
    const json = formatAuditJson(MOCK_RESULT);
    const parsed = JSON.parse(json) as AuditResult;
    expect(parsed.passing).toHaveLength(14);
  });

  it('uses 2-space indentation', () => {
    const json = formatAuditJson(MOCK_RESULT);
    // 2-space indented JSON has lines starting with exactly "  "
    const lines = json.split('\n');
    const indentedLines = lines.filter((l) => l.startsWith('  ') && !l.startsWith('    '));
    expect(indentedLines.length).toBeGreaterThan(0);
  });
});
