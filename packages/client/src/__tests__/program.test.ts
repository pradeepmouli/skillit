// packages/client/src/__tests__/program.test.ts
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { buildProgram } from '../program.js';

describe('buildProgram', () => {
  it('reports the version from package.json (not a hard-coded literal)', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    ) as { version: string };
    expect(buildProgram().version()).toBe(pkg.version);
  });

  it('registers the audit, gen, init, mcp, and refine subcommands', () => {
    const names = buildProgram()
      .commands.map((c) => c.name())
      .sort();
    expect(names).toEqual(['audit', 'gen', 'init', 'mcp', 'refine']);
  });
});
