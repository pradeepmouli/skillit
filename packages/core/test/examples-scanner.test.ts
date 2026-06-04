import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanExamples, linkExamplesToSkill } from '../src/examples-scanner.js';
import type { ExtractedSkill } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function write(dir: string, relPath: string, content: string): void {
  const full = join(dir, relPath);
  const parts = relPath.split('/');
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(full, content, 'utf-8');
}

function makeSkill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: 'test-skill',
    description: 'A test skill',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `examples-scanner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// scanExamples – import extraction
// ---------------------------------------------------------------------------

describe('scanExamples – named imports', () => {
  it('extracts named imports from a single package', () => {
    write(
      tmpDir,
      'basic.ts',
      `import { renderSkill, writeSkills } from '@skillit/core';\n\nrenderSkill();\n`
    );

    const examples = scanExamples(tmpDir);

    expect(examples).toHaveLength(1);
    expect(examples[0]?.importedSymbols).toEqual(['renderSkill', 'writeSkills']);
    expect(examples[0]?.importedFrom).toEqual(['@skillit/core']);
  });

  it('extracts aliased imports using the original name', () => {
    write(
      tmpDir,
      'aliased.ts',
      `import { renderSkill as render, writeSkills as write } from '@skillit/core';\n`
    );

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.importedSymbols).toEqual(['renderSkill', 'writeSkills']);
  });

  it('extracts multiple import statements', () => {
    write(
      tmpDir,
      'multi.ts',
      [
        `import { renderSkill } from '@skillit/core';`,
        `import { join } from 'node:path';`,
        ``
      ].join('\n')
    );

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.importedSymbols).toContain('renderSkill');
    expect(examples[0]?.importedSymbols).toContain('join');
    expect(examples[0]?.importedFrom).toContain('@skillit/core');
    expect(examples[0]?.importedFrom).toContain('node:path');
  });
});

describe('scanExamples – default imports', () => {
  it('extracts default import symbol name', () => {
    write(tmpDir, 'default.ts', `import Commander from 'commander';\n`);

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.importedSymbols).toEqual(['Commander']);
    expect(examples[0]?.importedFrom).toEqual(['commander']);
  });
});

describe('scanExamples – namespace imports', () => {
  it('extracts namespace import (* as X)', () => {
    write(tmpDir, 'ns.ts', `import * as fs from 'node:fs';\n`);

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.importedSymbols).toContain('fs');
    expect(examples[0]?.importedFrom).toContain('node:fs');
  });
});

// ---------------------------------------------------------------------------
// scanExamples – title / description extraction
// ---------------------------------------------------------------------------

describe('scanExamples – title from JSDoc', () => {
  it('uses first JSDoc line as title', () => {
    write(
      tmpDir,
      'server.ts',
      [
        `/**`,
        ` * Minimal LSP Server Example`,
        ` * Demonstrates a basic hover server`,
        ` */`,
        `import { renderSkill } from '@skillit/core';`
      ].join('\n')
    );

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.title).toBe('Minimal LSP Server Example');
  });

  it('uses remaining JSDoc lines as description', () => {
    write(
      tmpDir,
      'server.ts',
      [
        `/**`,
        ` * Minimal LSP Server Example`,
        ` * Demonstrates a basic hover server`,
        ` * Second description line`,
        ` */`,
        `import { renderSkill } from '@skillit/core';`
      ].join('\n')
    );

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.description).toContain('Demonstrates a basic hover server');
  });

  it('uses single-line // comment as title', () => {
    write(
      tmpDir,
      'basic.ts',
      [`// Quick usage example`, `import { renderSkill } from '@skillit/core';`].join('\n')
    );

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.title).toBe('Quick usage example');
  });
});

describe('scanExamples – title fallback to filename', () => {
  it('converts kebab-case filename to title when no comment', () => {
    write(tmpDir, 'minimal-server.ts', `import { renderSkill } from '@skillit/core';\n`);

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.title).toBe('Minimal Server');
  });

  it('handles underscore filenames', () => {
    write(tmpDir, 'my_example.ts', `import { renderSkill } from '@skillit/core';\n`);

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.title).toBe('My Example');
  });
});

// ---------------------------------------------------------------------------
// scanExamples – file discovery
// ---------------------------------------------------------------------------

describe('scanExamples – file discovery', () => {
  it('scans .ts files', () => {
    write(tmpDir, 'a.ts', `import { renderSkill } from '@skillit/core';\n`);
    const examples = scanExamples(tmpDir);
    expect(examples).toHaveLength(1);
  });

  it('scans .js files', () => {
    write(tmpDir, 'a.js', `import { renderSkill } from '@skillit/core';\n`);
    const examples = scanExamples(tmpDir);
    expect(examples).toHaveLength(1);
  });

  it('scans .tsx files', () => {
    write(tmpDir, 'a.tsx', `import { renderSkill } from '@skillit/core';\n`);
    const examples = scanExamples(tmpDir);
    expect(examples).toHaveLength(1);
  });

  it('scans .jsx files', () => {
    write(tmpDir, 'a.jsx', `import { renderSkill } from '@skillit/core';\n`);
    const examples = scanExamples(tmpDir);
    expect(examples).toHaveLength(1);
  });

  it('skips non-JS/TS files', () => {
    write(tmpDir, 'readme.md', `# Not a script`);
    write(tmpDir, 'data.json', `{}`);
    write(tmpDir, 'valid.ts', `import { renderSkill } from '@skillit/core';\n`);

    const examples = scanExamples(tmpDir);

    expect(examples).toHaveLength(1);
  });

  it('scans subdirectories recursively', () => {
    write(tmpDir, 'basic.ts', `import { renderSkill } from '@skillit/core';\n`);
    write(tmpDir, 'advanced/complex.ts', `import { writeSkills } from '@skillit/core';\n`);

    const examples = scanExamples(tmpDir);

    expect(examples).toHaveLength(2);
    const paths = examples.map((e) => e.relativePath);
    expect(paths).toContain('basic.ts');
    expect(paths).toContain('advanced/complex.ts');
  });

  it('returns empty array for non-existent directory', () => {
    const examples = scanExamples(join(tmpDir, 'does-not-exist'));
    expect(examples).toEqual([]);
  });

  it('includes full file content in content field', () => {
    const src = `import { renderSkill } from '@skillit/core';\n\nconsole.log('hi');\n`;
    write(tmpDir, 'example.ts', src);

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.content).toBe(src);
  });

  it('sets relativePath relative to examples dir', () => {
    write(tmpDir, 'sub/demo.ts', `import { renderSkill } from '@skillit/core';\n`);

    const examples = scanExamples(tmpDir);

    expect(examples[0]?.relativePath).toBe('sub/demo.ts');
  });
});

// ---------------------------------------------------------------------------
// linkExamplesToSkill
// ---------------------------------------------------------------------------

describe('linkExamplesToSkill – matching by symbol', () => {
  it('links example to matching function by imported symbol name', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'renderSkill',
          description: 'Renders a skill',
          signature: 'function renderSkill(): void',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });

    const examples = [
      {
        relativePath: 'basic.ts',
        title: 'Basic',
        importedSymbols: ['renderSkill'],
        importedFrom: ['@skillit/core'],
        content: `import { renderSkill } from '@skillit/core';\nrenderSkill();`
      }
    ];

    linkExamplesToSkill(examples, skill);

    expect(skill.functions[0]?.examples).toHaveLength(1);
    expect(skill.functions[0]?.examples[0]).toContain('renderSkill');
  });

  it('wraps content in a fenced code block', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'renderSkill',
          description: '',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });

    const content = `import { renderSkill } from '@skillit/core';\nrenderSkill();`;
    const examples = [
      {
        relativePath: 'basic.ts',
        title: 'Basic',
        importedSymbols: ['renderSkill'],
        importedFrom: ['@skillit/core'],
        content
      }
    ];

    linkExamplesToSkill(examples, skill);

    const linked = skill.functions[0]?.examples[0] ?? '';
    expect(linked).toMatch(/^```/);
    expect(linked).toMatch(/```$/);
    expect(linked).toContain(content);
  });

  it('links to first matching function when multiple symbols match', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'renderSkill',
          description: '',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        },
        {
          name: 'writeSkills',
          description: '',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });

    const examples = [
      {
        relativePath: 'both.ts',
        title: 'Both',
        importedSymbols: ['renderSkill', 'writeSkills'],
        importedFrom: ['@skillit/core'],
        content: `import { renderSkill, writeSkills } from '@skillit/core';`
      }
    ];

    linkExamplesToSkill(examples, skill);

    // linked to first match (renderSkill)
    expect(skill.functions[0]?.examples).toHaveLength(1);
    expect(skill.functions[1]?.examples).toHaveLength(0);
  });

  it('attaches to skill.examples when no symbol matches any export', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'renderSkill',
          description: '',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });

    const examples = [
      {
        relativePath: 'unrelated.ts',
        title: 'Unrelated',
        importedSymbols: ['unknownFn'],
        importedFrom: ['some-lib'],
        content: `import { unknownFn } from 'some-lib';`
      }
    ];

    linkExamplesToSkill(examples, skill);

    expect(skill.examples).toHaveLength(1);
    expect(skill.functions[0]?.examples).toHaveLength(0);
  });

  it('links to matching class when symbol matches class name', () => {
    const skill = makeSkill({
      classes: [
        {
          name: 'MyClient',
          description: '',
          constructorSignature: '',
          methods: [],
          properties: [],
          examples: []
        }
      ]
    });

    const examples = [
      {
        relativePath: 'client.ts',
        title: 'Client',
        importedSymbols: ['MyClient'],
        importedFrom: ['my-lib'],
        content: `import { MyClient } from 'my-lib';`
      }
    ];

    linkExamplesToSkill(examples, skill);

    expect(skill.classes[0]?.examples).toHaveLength(1);
  });

  it('uses typescript language tag in fenced code block for .ts files', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'renderSkill',
          description: '',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });

    const examples = [
      {
        relativePath: 'basic.ts',
        title: 'Basic',
        importedSymbols: ['renderSkill'],
        importedFrom: ['@skillit/core'],
        content: `import { renderSkill } from '@skillit/core';`
      }
    ];

    linkExamplesToSkill(examples, skill);

    const linked = skill.functions[0]?.examples[0] ?? '';
    expect(linked).toMatch(/^```typescript/);
  });

  it('uses javascript language tag for .js files', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'renderSkill',
          description: '',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });

    const examples = [
      {
        relativePath: 'basic.js',
        title: 'Basic',
        importedSymbols: ['renderSkill'],
        importedFrom: ['@skillit/core'],
        content: `import { renderSkill } from '@skillit/core';`
      }
    ];

    linkExamplesToSkill(examples, skill);

    const linked = skill.functions[0]?.examples[0] ?? '';
    expect(linked).toMatch(/^```javascript/);
  });
});
