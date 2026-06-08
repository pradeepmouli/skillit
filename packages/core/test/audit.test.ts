import { describe, it, expect } from 'vitest';
import { auditSkill } from '@skillit/core';
import type { AuditIssue, AuditPass } from '@skillit/core';
import type { ExtractedSkill, ExtractedFunction, ExtractedParameter } from '@skillit/core';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeParam(overrides: Partial<ExtractedParameter> = {}): ExtractedParameter {
  return {
    name: 'value',
    type: 'string',
    description: 'The value to process',
    optional: false,
    ...overrides
  };
}

function makeFunction(overrides: Partial<ExtractedFunction> = {}): ExtractedFunction {
  return {
    name: 'doSomething',
    description: 'Does something useful',
    signature: 'doSomething(value: string): string',
    parameters: [],
    returnType: 'void',
    examples: [],
    tags: {},
    ...overrides
  };
}

function makeSkill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: 'test-lib',
    description: '',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    ...overrides
  };
}

// Project metadata now lives on the IR; the audit reads it directly from the
// skill. `makeContext` produces that metadata subset (default values exercising
// the passing path); the helpers merge it onto the skill before auditing.
type ProjectMeta = Pick<
  ExtractedSkill,
  'packageDescription' | 'keywords' | 'repository' | 'readme'
>;

function makeContext(overrides: Partial<ProjectMeta> = {}): Partial<ProjectMeta> {
  return {
    packageDescription: 'A library for doing useful things with data',
    keywords: ['data', 'transform', 'parse', 'validate', 'schema'],
    repository: 'https://github.com/test/test',
    readme: {
      blockquote: 'A useful library for data transformation.',
      firstParagraph: 'Extended description of the library.'
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIssues(
  skill: ExtractedSkill,
  context: Partial<ProjectMeta>,
  code: string
): AuditIssue[] {
  const result = auditSkill({ ...skill, ...context });
  return result.issues.filter((i) => i.code === code);
}

function getPassing(
  skill: ExtractedSkill,
  context: Partial<ProjectMeta>,
  code: string
): AuditPass[] {
  const result = auditSkill({ ...skill, ...context });
  return result.passing.filter((p) => p.code === code);
}

// ---------------------------------------------------------------------------
// F1: package.json description
// ---------------------------------------------------------------------------

describe('F1: package.json description', () => {
  it('fails when packageDescription is missing', () => {
    const issues = getIssues(makeSkill(), makeContext({ packageDescription: undefined }), 'F1');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('fatal');
    expect(issues[0].message).toContain('missing');
  });

  it('fails when packageDescription is empty string', () => {
    const issues = getIssues(makeSkill(), makeContext({ packageDescription: '' }), 'F1');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('fatal');
  });

  it('fails when packageDescription is ≤10 chars', () => {
    const issues = getIssues(makeSkill(), makeContext({ packageDescription: 'Short' }), 'F1');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('too short');
  });

  it('fails when packageDescription is exactly 10 chars', () => {
    const issues = getIssues(makeSkill(), makeContext({ packageDescription: '1234567890' }), 'F1');
    expect(issues).toHaveLength(1);
  });

  it('passes when packageDescription is >10 chars', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({ packageDescription: 'A proper description here' }),
      'F1'
    );
    expect(passing).toHaveLength(1);
  });

  it('passes when packageDescription is 11 chars', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({ packageDescription: '12345678901' }),
      'F1'
    );
    expect(passing).toHaveLength(1);
  });
});

describe('audit suggestions', () => {
  it('F4 suggestions use the problem-oriented JSDoc template', () => {
    const issues = getIssues(
      makeSkill({
        functions: [makeFunction({ name: 'renderSkill', description: '' })]
      }),
      makeContext(),
      'F4'
    );
    expect(issues[0]?.suggestion).toMatch(/\[One sentence: what problem renderSkill solves/i);
  });

  it('E1 suggestions use the @param template', () => {
    const issues = getIssues(
      makeSkill({
        functions: [
          makeFunction({
            parameters: [makeParam({ name: 'options', description: '' })]
          })
        ]
      }),
      makeContext(),
      'E1'
    );
    expect(issues[0]?.suggestion).toMatch(/@param options —/);
  });
});

// ---------------------------------------------------------------------------
// F2: keywords
// ---------------------------------------------------------------------------

describe('F2: keywords', () => {
  it('fails when keywords is missing', () => {
    const issues = getIssues(makeSkill(), makeContext({ keywords: undefined }), 'F2');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('fatal');
  });

  it('fails when fewer than 5 keywords', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({ keywords: ['data', 'transform', 'parse'] }),
      'F2'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('3 keyword(s)');
  });

  it('fails when 5 keywords but fewer than 3 domain-specific', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        keywords: ['typescript', 'javascript', 'library', 'utils', 'helper']
      }),
      'F2'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('domain-specific');
  });

  it('passes with 5 keywords and 3+ domain-specific', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({
        keywords: ['data', 'transform', 'parse', 'validate', 'schema']
      }),
      'F2'
    );
    expect(passing).toHaveLength(1);
  });

  it('generic keywords list covers expected terms', () => {
    const genericTerms = [
      'typescript',
      'javascript',
      'node',
      'nodejs',
      'npm',
      'library',
      'package',
      'utils',
      'utility',
      'helper',
      'tool',
      'framework'
    ];
    for (const term of genericTerms) {
      const issues = getIssues(
        makeSkill(),
        makeContext({
          keywords: [term, term, term, term, term]
        }),
        'F2'
      );
      expect(issues).toHaveLength(1);
    }
  });

  it('is case-insensitive for generic keywords', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        keywords: ['TypeScript', 'JavaScript', 'Library', 'Utils', 'Helper']
      }),
      'F2'
    );
    expect(issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// F3: README description
// ---------------------------------------------------------------------------

describe('F3: README description', () => {
  it('fails when readme is missing', () => {
    const issues = getIssues(makeSkill(), makeContext({ readme: undefined }), 'F3');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('fatal');
    expect(issues[0].message).toContain('missing');
  });

  it('fails when both blockquote and firstParagraph are missing', () => {
    const issues = getIssues(makeSkill(), makeContext({ readme: {} }), 'F3');
    expect(issues).toHaveLength(1);
  });

  it('fails when blockquote is ≤20 chars', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'Short desc.' }
      }),
      'F3'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('too short');
  });

  it('passes when blockquote is >20 chars', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'A sufficiently long description here.' }
      }),
      'F3'
    );
    expect(passing).toHaveLength(1);
  });

  it('passes when only firstParagraph is >20 chars', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({
        readme: { firstParagraph: 'A sufficiently long first paragraph here.' }
      }),
      'F3'
    );
    expect(passing).toHaveLength(1);
  });

  it('prefers blockquote over firstParagraph', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({
        readme: {
          blockquote: 'Valid blockquote that is long enough.',
          firstParagraph: 'x' // too short on its own
        }
      }),
      'F3'
    );
    expect(passing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// F4: JSDoc on exports
// ---------------------------------------------------------------------------

describe('F4: JSDoc on exports', () => {
  it('passes when there are no exports', () => {
    const passing = getPassing(makeSkill(), makeContext(), 'F4');
    expect(passing).toHaveLength(1);
  });

  it('fails for function missing description', () => {
    const skill = makeSkill({
      functions: [makeFunction({ name: 'myFn', description: '' })]
    });
    const issues = getIssues(skill, makeContext(), 'F4');
    expect(issues).toHaveLength(1);
    expect(issues[0].symbol).toBe('myFn');
    expect(issues[0].severity).toBe('fatal');
  });

  it('fails for class missing description', () => {
    const skill = makeSkill({
      classes: [
        {
          name: 'MyClass',
          description: '',
          constructorSignature: 'new MyClass()',
          methods: [],
          properties: [],
          examples: []
        }
      ]
    });
    const issues = getIssues(skill, makeContext(), 'F4');
    expect(issues).toHaveLength(1);
    expect(issues[0].symbol).toBe('MyClass');
  });

  it('fails for type missing description', () => {
    const skill = makeSkill({
      types: [{ name: 'MyType', description: '', definition: 'type MyType = string' }]
    });
    const issues = getIssues(skill, makeContext(), 'F4');
    expect(issues).toHaveLength(1);
    expect(issues[0].symbol).toBe('MyType');
  });

  it('fails for enum missing description', () => {
    const skill = makeSkill({
      enums: [{ name: 'MyEnum', description: '', members: [] }]
    });
    const issues = getIssues(skill, makeContext(), 'F4');
    expect(issues).toHaveLength(1);
    expect(issues[0].symbol).toBe('MyEnum');
  });

  it('fails for variable missing description', () => {
    const skill = makeSkill({
      variables: [{ name: 'MY_CONST', type: 'string', description: '', isConst: true }]
    });
    const issues = getIssues(skill, makeContext(), 'F4');
    expect(issues).toHaveLength(1);
    expect(issues[0].symbol).toBe('MY_CONST');
  });

  it('emits multiple issues for multiple missing descriptions', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({ description: '' }),
        makeFunction({ name: 'other', description: '' })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'F4');
    expect(issues).toHaveLength(2);
  });

  it('passes when all exports have descriptions', () => {
    const skill = makeSkill({
      functions: [makeFunction({ description: 'Does something' })],
      types: [{ name: 'T', description: 'A type', definition: 'type T = string' }]
    });
    const passing = getPassing(skill, makeContext(), 'F4');
    expect(passing).toHaveLength(1);
  });

  it('uses sourceModule in file path when available', () => {
    const skill = makeSkill({
      functions: [makeFunction({ description: '', sourceModule: 'myModule' })]
    });
    const issues = getIssues(skill, makeContext(), 'F4');
    expect(issues[0].file).toBe('myModule.ts');
  });
});

// ---------------------------------------------------------------------------
// E1: @param prose
// ---------------------------------------------------------------------------

describe('E1: @param prose', () => {
  it('passes when no functions', () => {
    const passing = getPassing(makeSkill(), makeContext(), 'E1');
    expect(passing).toHaveLength(1);
  });

  it('passes when all params have descriptions', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [makeParam({ description: 'The value to process' })]
        })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'E1');
    expect(passing).toHaveLength(1);
  });

  it('fails when a parameter has empty description', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [makeParam({ name: 'value', description: '' })]
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'E1');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].symbol).toContain('value');
  });

  it('fails for multiple missing param descriptions', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [
            makeParam({ name: 'a', description: '' }),
            makeParam({ name: 'b', description: '' })
          ]
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'E1');
    expect(issues).toHaveLength(2);
  });

  it('checks method parameters in classes', () => {
    const skill = makeSkill({
      classes: [
        {
          name: 'MyClass',
          description: 'A class',
          constructorSignature: 'new MyClass()',
          methods: [
            makeFunction({
              name: 'method',
              parameters: [makeParam({ name: 'x', description: '' })]
            })
          ],
          properties: [],
          examples: []
        }
      ]
    });
    const issues = getIssues(skill, makeContext(), 'E1');
    expect(issues).toHaveLength(1);
    expect(issues[0].symbol).toContain('MyClass.method');
  });
});

// ---------------------------------------------------------------------------
// E2: @returns
// ---------------------------------------------------------------------------

describe('E2: @returns', () => {
  it('passes for void functions without returnsDescription', () => {
    const skill = makeSkill({
      functions: [makeFunction({ returnType: 'void', returnsDescription: undefined })]
    });
    const passing = getPassing(skill, makeContext(), 'E2');
    expect(passing).toHaveLength(1);
  });

  it('passes for non-void functions with returnsDescription', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({ returnType: 'string', returnsDescription: 'The processed string' })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'E2');
    expect(passing).toHaveLength(1);
  });

  it('fails for non-void function without returnsDescription', () => {
    const skill = makeSkill({
      functions: [makeFunction({ returnType: 'string', returnsDescription: undefined })]
    });
    const issues = getIssues(skill, makeContext(), 'E2');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('string');
  });

  it('fails for non-void function with empty returnsDescription', () => {
    const skill = makeSkill({
      functions: [makeFunction({ returnType: 'string', returnsDescription: '   ' })]
    });
    const issues = getIssues(skill, makeContext(), 'E2');
    expect(issues).toHaveLength(1);
  });

  it('checks methods in classes', () => {
    const skill = makeSkill({
      classes: [
        {
          name: 'MyClass',
          description: 'A class',
          constructorSignature: 'new MyClass()',
          methods: [
            makeFunction({ name: 'get', returnType: 'string', returnsDescription: undefined })
          ],
          properties: [],
          examples: []
        }
      ]
    });
    const issues = getIssues(skill, makeContext(), 'E2');
    expect(issues).toHaveLength(1);
    expect(issues[0].symbol).toContain('MyClass.get');
  });

  it('passes when there are no functions', () => {
    const passing = getPassing(makeSkill(), makeContext(), 'E2');
    expect(passing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// E3: Interface property JSDoc
// ---------------------------------------------------------------------------

describe('E3: Interface property JSDoc', () => {
  it('passes when types have no properties', () => {
    const skill = makeSkill({
      types: [{ name: 'Foo', description: 'A type alias', definition: 'type Foo = string' }]
    });
    const passing = getPassing(skill, makeContext(), 'E3');
    expect(passing).toHaveLength(1);
  });

  it('passes when all properties have descriptions', () => {
    const skill = makeSkill({
      types: [
        {
          name: 'Options',
          description: 'Options type',
          definition: 'interface Options',
          properties: [
            { name: 'timeout', type: 'number', description: 'Timeout in ms', optional: false }
          ]
        }
      ]
    });
    const passing = getPassing(skill, makeContext(), 'E3');
    expect(passing).toHaveLength(1);
  });

  it('fails when a property has no description', () => {
    const skill = makeSkill({
      types: [
        {
          name: 'Options',
          description: 'Options type',
          definition: 'interface Options',
          properties: [{ name: 'timeout', type: 'number', description: '', optional: false }]
        }
      ]
    });
    const issues = getIssues(skill, makeContext(), 'E3');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].symbol).toBe('Options.timeout');
  });

  it('fails for multiple properties missing descriptions', () => {
    const skill = makeSkill({
      types: [
        {
          name: 'Options',
          description: 'Options type',
          definition: 'interface Options',
          properties: [
            { name: 'a', type: 'string', description: '', optional: false },
            { name: 'b', type: 'number', description: '', optional: true }
          ]
        }
      ]
    });
    const issues = getIssues(skill, makeContext(), 'E3');
    expect(issues).toHaveLength(2);
  });

  it('passes when there are no types', () => {
    const passing = getPassing(makeSkill(), makeContext(), 'E3');
    expect(passing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// E4: @example exists
// ---------------------------------------------------------------------------

describe('E4: @example exists', () => {
  it('fails when no examples anywhere', () => {
    const skill = makeSkill({
      functions: [makeFunction({ examples: [] })]
    });
    const issues = getIssues(skill, makeContext(), 'E4');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('passes when skill.examples has entries', () => {
    const skill = makeSkill({
      examples: ['const x = doSomething();']
    });
    const passing = getPassing(skill, makeContext(), 'E4');
    expect(passing).toHaveLength(1);
  });

  it('passes when a function has examples', () => {
    const skill = makeSkill({
      functions: [makeFunction({ examples: ['doSomething()'] })]
    });
    const passing = getPassing(skill, makeContext(), 'E4');
    expect(passing).toHaveLength(1);
  });

  it('passes when there are no functions and no examples (empty package)', () => {
    // Empty package has nothing to require examples for
    const skill = makeSkill({ examples: [] });
    // With no functions, E4 fails since there are no examples at all
    const issues = getIssues(skill, makeContext(), 'E4');
    expect(issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// E5: Repository
// ---------------------------------------------------------------------------

describe('E5: Repository', () => {
  it('fails when repository is missing', () => {
    const issues = getIssues(makeSkill(), makeContext({ repository: undefined }), 'E5');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('fails when repository is empty string', () => {
    const issues = getIssues(makeSkill(), makeContext({ repository: '' }), 'E5');
    expect(issues).toHaveLength(1);
  });

  it('fails when repository is whitespace', () => {
    const issues = getIssues(makeSkill(), makeContext({ repository: '   ' }), 'E5');
    expect(issues).toHaveLength(1);
  });

  it('passes when repository is present', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({ repository: 'https://github.com/test/repo' }),
      'E5'
    );
    expect(passing).toHaveLength(1);
    expect(passing[0].detail).toContain('github.com');
  });
});

// ---------------------------------------------------------------------------
// W1: @packageDocumentation
// ---------------------------------------------------------------------------

describe('W1: @packageDocumentation', () => {
  it('fails when description is empty', () => {
    const issues = getIssues(makeSkill({ description: '' }), makeContext(), 'W1');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('fails when description is ≤50 chars', () => {
    const issues = getIssues(makeSkill({ description: 'Too short' }), makeContext(), 'W1');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('9 chars');
  });

  it('fails when description is exactly 50 chars', () => {
    const issues = getIssues(makeSkill({ description: 'a'.repeat(50) }), makeContext(), 'W1');
    expect(issues).toHaveLength(1);
  });

  it('passes when description is >50 chars', () => {
    const passing = getPassing(
      makeSkill({
        description:
          'A very detailed description of the module that is longer than fifty characters.'
      }),
      makeContext(),
      'W1'
    );
    expect(passing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// W2: Per-function @example
// ---------------------------------------------------------------------------

describe('W2: Per-function @example', () => {
  it('passes when there are no functions', () => {
    const passing = getPassing(makeSkill(), makeContext(), 'W2');
    expect(passing).toHaveLength(1);
  });

  it('fails when a function has no examples', () => {
    const skill = makeSkill({
      functions: [makeFunction({ examples: [] })]
    });
    const issues = getIssues(skill, makeContext(), 'W2');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].symbol).toBe('doSomething');
  });

  it('fails for each function missing examples', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({ name: 'fn1', examples: [] }),
        makeFunction({ name: 'fn2', examples: [] })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'W2');
    expect(issues).toHaveLength(2);
  });

  it('passes when all functions have examples', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({ name: 'fn1', examples: ['fn1()'] }),
        makeFunction({ name: 'fn2', examples: ['fn2()'] })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'W2');
    expect(passing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// W3: Tag usage
// ---------------------------------------------------------------------------

describe('W3: Tag usage', () => {
  it('fails when no functions', () => {
    const issues = getIssues(makeSkill(), makeContext(), 'W3');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('fails when functions have no notable tags', () => {
    const skill = makeSkill({
      functions: [makeFunction({ tags: {} })]
    });
    const issues = getIssues(skill, makeContext(), 'W3');
    expect(issues).toHaveLength(1);
  });

  it('fails when notable tags are present but empty', () => {
    const skill = makeSkill({
      functions: [makeFunction({ tags: { deprecated: '' } })]
    });
    const issues = getIssues(skill, makeContext(), 'W3');
    expect(issues).toHaveLength(1);
  });

  it('passes when a function has @deprecated', () => {
    const skill = makeSkill({
      functions: [makeFunction({ tags: { deprecated: 'Use newFn instead' } })]
    });
    const passing = getPassing(skill, makeContext(), 'W3');
    expect(passing).toHaveLength(1);
  });

  it('passes when a function has @since', () => {
    const skill = makeSkill({
      functions: [makeFunction({ tags: { since: '1.0.0' } })]
    });
    const passing = getPassing(skill, makeContext(), 'W3');
    expect(passing).toHaveLength(1);
  });

  it('passes when a function has @throws', () => {
    const skill = makeSkill({
      functions: [makeFunction({ tags: { throws: 'Error when invalid' } })]
    });
    const passing = getPassing(skill, makeContext(), 'W3');
    expect(passing).toHaveLength(1);
  });

  it('passes when a function has @see', () => {
    const skill = makeSkill({
      functions: [makeFunction({ tags: { see: 'otherFn' } })]
    });
    const passing = getPassing(skill, makeContext(), 'W3');
    expect(passing).toHaveLength(1);
  });

  it('ignores irrelevant tags', () => {
    const skill = makeSkill({
      functions: [makeFunction({ tags: { internal: 'some value', alpha: 'yes' } })]
    });
    const issues = getIssues(skill, makeContext(), 'W3');
    expect(issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// W4: 10+ keywords
// ---------------------------------------------------------------------------

describe('W4: 10+ keywords', () => {
  it('fails with 5 domain-specific keywords', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        keywords: ['data', 'transform', 'parse', 'validate', 'schema']
      }),
      'W4'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('fails with 9 domain-specific keywords', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        keywords: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
      }),
      'W4'
    );
    expect(issues).toHaveLength(1);
  });

  it('passes with 10+ domain-specific keywords', () => {
    const keywords = [
      'data',
      'transform',
      'parse',
      'validate',
      'schema',
      'query',
      'filter',
      'sort',
      'map',
      'reduce'
    ];
    const passing = getPassing(makeSkill(), makeContext({ keywords }), 'W4');
    expect(passing).toHaveLength(1);
    expect(passing[0].detail).toContain('10 domain-specific');
  });

  it('generic keywords do not count toward domain-specific', () => {
    const keywords = [
      'typescript',
      'data',
      'transform',
      'parse',
      'validate',
      'schema',
      'query',
      'filter',
      'sort',
      'map'
    ];
    // 10 total, 9 domain-specific (typescript is generic)
    const issues = getIssues(makeSkill(), makeContext({ keywords }), 'W4');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('9 domain-specific');
  });
});

// ---------------------------------------------------------------------------
// W5: README Features
// ---------------------------------------------------------------------------

describe('W5: README Features', () => {
  it('fails when readme has no features section', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'A useful library.' }
      }),
      'W5'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('fails when readme is missing', () => {
    const issues = getIssues(makeSkill(), makeContext({ readme: undefined }), 'W5');
    expect(issues).toHaveLength(1);
  });

  it('fails when features is empty string', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'A useful library.', features: '' }
      }),
      'W5'
    );
    expect(issues).toHaveLength(1);
  });

  it('passes when features is present', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'A useful library.', features: '- Feature 1\n- Feature 2' }
      }),
      'W5'
    );
    expect(passing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// W6: README Troubleshooting
// ---------------------------------------------------------------------------

describe('W6: README Troubleshooting', () => {
  it('fails when readme has no troubleshooting section', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'A useful library.' }
      }),
      'W6'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('fails when readme is missing', () => {
    const issues = getIssues(makeSkill(), makeContext({ readme: undefined }), 'W6');
    expect(issues).toHaveLength(1);
  });

  it('passes when troubleshooting is present', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'A useful library.', troubleshooting: 'If X fails, try Y.' }
      }),
      'W6'
    );
    expect(passing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// W7: @useWhen on at least one export
// ---------------------------------------------------------------------------

describe('W7: @useWhen on at least one export', () => {
  it('fails when skill.useWhen is undefined', () => {
    const issues = getIssues(makeSkill({ useWhen: undefined }), makeContext(), 'W7');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('@useWhen');
  });

  it('fails when skill.useWhen is an empty array', () => {
    const issues = getIssues(makeSkill({ useWhen: [] }), makeContext(), 'W7');
    expect(issues).toHaveLength(1);
  });

  it('passes when skill.useWhen has at least one entry', () => {
    const passing = getPassing(
      makeSkill({ useWhen: ['when transforming data'] }),
      makeContext(),
      'W7'
    );
    expect(passing).toHaveLength(1);
  });

  it('passes with multiple useWhen entries', () => {
    const passing = getPassing(
      makeSkill({ useWhen: ['condition A', 'condition B'] }),
      makeContext(),
      'W7'
    );
    expect(passing).toHaveLength(1);
  });

  it('passes when a configSurface carries useWhen (no top-level useWhen)', () => {
    const passing = getPassing(
      makeSkill({
        useWhen: undefined,
        configSurfaces: [
          {
            name: 'build',
            description: 'Build the project',
            sourceType: 'cli',
            options: [],
            useWhen: ['when bundling for production']
          }
        ]
      }),
      makeContext(),
      'W7'
    );
    expect(passing).toHaveLength(1);
  });

  it('fails when neither top-level nor configSurface carries useWhen', () => {
    const issues = getIssues(
      makeSkill({
        useWhen: undefined,
        configSurfaces: [
          {
            name: 'build',
            description: 'Build the project',
            sourceType: 'cli',
            options: [],
            useWhen: []
          }
        ]
      }),
      makeContext(),
      'W7'
    );
    expect(issues).toHaveLength(1);
  });

  it('passes when a config surface OPTION carries useWhen (per-option routing)', () => {
    const passing = getPassing(
      makeSkill({
        useWhen: undefined,
        configSurfaces: [
          {
            name: 'ZodFormsConfig',
            description: 'Config',
            sourceType: 'config',
            useWhen: [],
            options: [
              {
                name: 'ssr',
                configKey: 'ssr',
                type: 'boolean',
                description: 'Enable SSR',
                required: false,
                useWhen: ['targeting a server runtime']
              }
            ]
          }
        ]
      }),
      makeContext(),
      'W7'
    );
    expect(passing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// W8: @avoidWhen on at least one export
// ---------------------------------------------------------------------------

describe('W8: @avoidWhen on at least one export', () => {
  it('fails when skill.avoidWhen is undefined', () => {
    const issues = getIssues(makeSkill({ avoidWhen: undefined }), makeContext(), 'W8');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('@avoidWhen');
  });

  it('fails when skill.avoidWhen is an empty array', () => {
    const issues = getIssues(makeSkill({ avoidWhen: [] }), makeContext(), 'W8');
    expect(issues).toHaveLength(1);
  });

  it('passes when skill.avoidWhen has at least one entry', () => {
    const passing = getPassing(
      makeSkill({ avoidWhen: ['when performance is critical'] }),
      makeContext(),
      'W8'
    );
    expect(passing).toHaveLength(1);
  });

  it('passes with multiple avoidWhen entries', () => {
    const passing = getPassing(makeSkill({ avoidWhen: ['case A', 'case B'] }), makeContext(), 'W8');
    expect(passing).toHaveLength(1);
  });

  it('passes when a configSurface carries avoidWhen (no top-level avoidWhen)', () => {
    const passing = getPassing(
      makeSkill({
        avoidWhen: undefined,
        configSurfaces: [
          {
            name: 'build',
            description: 'Build the project',
            sourceType: 'cli',
            options: [],
            avoidWhen: ['when in watch mode']
          }
        ]
      }),
      makeContext(),
      'W8'
    );
    expect(passing).toHaveLength(1);
  });

  it('fails when neither top-level nor configSurface carries avoidWhen', () => {
    const issues = getIssues(
      makeSkill({
        avoidWhen: undefined,
        configSurfaces: [
          {
            name: 'build',
            description: 'Build the project',
            sourceType: 'cli',
            options: [],
            avoidWhen: []
          }
        ]
      }),
      makeContext(),
      'W8'
    );
    expect(issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// W9: @never on at least one export
// ---------------------------------------------------------------------------

describe('W9: @never on at least one export', () => {
  it('fails when skill.pitfalls is undefined', () => {
    const issues = getIssues(makeSkill({ pitfalls: undefined }), makeContext(), 'W9');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('@never');
  });

  it('fails when skill.pitfalls is an empty array', () => {
    const issues = getIssues(makeSkill({ pitfalls: [] }), makeContext(), 'W9');
    expect(issues).toHaveLength(1);
  });

  it('passes when skill.pitfalls has at least one entry', () => {
    const passing = getPassing(
      makeSkill({ pitfalls: ['mutates the original array'] }),
      makeContext(),
      'W9'
    );
    expect(passing).toHaveLength(1);
  });

  it('passes with multiple pitfall entries', () => {
    const passing = getPassing(
      makeSkill({ pitfalls: ['pitfall A', 'pitfall B'] }),
      makeContext(),
      'W9'
    );
    expect(passing).toHaveLength(1);
  });

  it('passes when a configSurface carries pitfalls (no top-level pitfalls)', () => {
    const passing = getPassing(
      makeSkill({
        pitfalls: undefined,
        configSurfaces: [
          {
            name: 'build',
            description: 'Build the project',
            sourceType: 'cli',
            options: [],
            pitfalls: ['never run with --force in CI']
          }
        ]
      }),
      makeContext(),
      'W9'
    );
    expect(passing).toHaveLength(1);
  });

  it('fails when neither top-level nor configSurface carries pitfalls', () => {
    const issues = getIssues(
      makeSkill({
        pitfalls: undefined,
        configSurfaces: [
          {
            name: 'build',
            description: 'Build the project',
            sourceType: 'cli',
            options: [],
            pitfalls: []
          }
        ]
      }),
      makeContext(),
      'W9'
    );
    expect(issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// W10: @remarks on complex functions (3+ params)
// ---------------------------------------------------------------------------

describe('W10: @remarks on complex functions', () => {
  it('passes when no functions exist', () => {
    const passing = getPassing(makeSkill({ functions: [] }), makeContext(), 'W10');
    expect(passing).toHaveLength(1);
  });

  it('passes when functions have fewer than 3 params (no remarks needed)', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({ parameters: [makeParam({ name: 'a' }), makeParam({ name: 'b' })] })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'W10');
    expect(passing).toHaveLength(1);
  });

  it('fails when a function has 3 params and no remarks', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          name: 'complexFn',
          parameters: [
            makeParam({ name: 'a' }),
            makeParam({ name: 'b' }),
            makeParam({ name: 'c' })
          ],
          remarks: undefined
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'W10');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].symbol).toBe('complexFn');
    expect(issues[0].message).toContain('3 parameters');
  });

  it('fails when a function has 5 params and no remarks', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          name: 'manyParams',
          parameters: [
            makeParam({ name: 'a' }),
            makeParam({ name: 'b' }),
            makeParam({ name: 'c' }),
            makeParam({ name: 'd' }),
            makeParam({ name: 'e' })
          ],
          remarks: undefined
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'W10');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('5 parameters');
  });

  it('passes when a function has 3 params and has remarks', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [
            makeParam({ name: 'a' }),
            makeParam({ name: 'b' }),
            makeParam({ name: 'c' })
          ],
          remarks: 'Use this when you need all three options set together.'
        })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'W10');
    expect(passing).toHaveLength(1);
  });

  it('emits one issue per complex function missing remarks', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          name: 'fn1',
          parameters: [makeParam({ name: 'a' }), makeParam({ name: 'b' }), makeParam({ name: 'c' })]
        }),
        makeFunction({
          name: 'fn2',
          parameters: [makeParam({ name: 'x' }), makeParam({ name: 'y' }), makeParam({ name: 'z' })]
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'W10');
    expect(issues).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// W11: @category for intentional grouping
// ---------------------------------------------------------------------------

describe('W11: @category for intentional grouping', () => {
  it('fails when no exports have a category', () => {
    const skill = makeSkill({
      functions: [makeFunction({ category: undefined })]
    });
    const issues = getIssues(skill, makeContext(), 'W11');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('@category');
  });

  it('fails when skill has no exports at all', () => {
    const issues = getIssues(makeSkill(), makeContext(), 'W11');
    expect(issues).toHaveLength(1);
  });

  it('passes when a function has a category', () => {
    const skill = makeSkill({
      functions: [makeFunction({ category: 'Utilities' })]
    });
    const passing = getPassing(skill, makeContext(), 'W11');
    expect(passing).toHaveLength(1);
  });

  it('passes when a class has a category', () => {
    const skill = makeSkill({
      classes: [
        {
          name: 'MyClass',
          description: 'A class',
          constructorSignature: 'new MyClass()',
          methods: [],
          properties: [],
          examples: [],
          category: 'Core'
        }
      ]
    });
    const passing = getPassing(skill, makeContext(), 'W11');
    expect(passing).toHaveLength(1);
  });

  it('passes when a type has a category', () => {
    const skill = makeSkill({
      types: [
        {
          name: 'MyType',
          description: 'A type',
          definition: 'type MyType = string',
          category: 'Types'
        }
      ]
    });
    const passing = getPassing(skill, makeContext(), 'W11');
    expect(passing).toHaveLength(1);
  });

  it('passes when an enum has a category', () => {
    const skill = makeSkill({
      enums: [
        {
          name: 'MyEnum',
          description: 'An enum',
          members: [],
          category: 'Enums'
        }
      ]
    });
    const passing = getPassing(skill, makeContext(), 'W11');
    expect(passing).toHaveLength(1);
  });

  it('passes when a variable has a category', () => {
    const skill = makeSkill({
      variables: [
        {
          name: 'MY_CONST',
          type: 'string',
          description: 'A constant',
          isConst: true,
          category: 'Constants'
        }
      ]
    });
    const passing = getPassing(skill, makeContext(), 'W11');
    expect(passing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// A1: Generic keywords
// ---------------------------------------------------------------------------

describe('A1: Generic keywords', () => {
  it('emits an alert for each generic keyword', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        keywords: ['data', 'typescript', 'javascript', 'transform']
      }),
      'A1'
    );
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.severity === 'alert')).toBe(true);
    expect(issues.map((i) => i.symbol)).toContain('keywords[typescript]');
    expect(issues.map((i) => i.symbol)).toContain('keywords[javascript]');
  });

  it('passes when no generic keywords', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({
        keywords: ['data', 'transform', 'parse', 'validate', 'schema']
      }),
      'A1'
    );
    expect(passing).toHaveLength(1);
  });

  it('passes when keywords is undefined', () => {
    const passing = getPassing(makeSkill(), makeContext({ keywords: undefined }), 'A1');
    expect(passing).toHaveLength(1);
  });

  it('emits alerts for all generic terms', () => {
    const allGeneric = [
      'typescript',
      'javascript',
      'node',
      'nodejs',
      'npm',
      'library',
      'package',
      'utils',
      'utility',
      'helper',
      'tool',
      'framework'
    ];
    const issues = getIssues(makeSkill(), makeContext({ keywords: allGeneric }), 'A1');
    expect(issues).toHaveLength(allGeneric.length);
  });

  it('is case-insensitive', () => {
    const issues = getIssues(
      makeSkill(),
      makeContext({
        keywords: ['data', 'TypeScript', 'transform', 'parse', 'validate']
      }),
      'A1'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].symbol).toBe('keywords[TypeScript]');
  });
});

// ---------------------------------------------------------------------------
// A2: @param restates type
// ---------------------------------------------------------------------------

describe('A2: @param restates name', () => {
  it('passes when params have good descriptions', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [
            makeParam({ name: 'options', description: 'Configuration object for the request' })
          ]
        })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'A2');
    expect(passing).toHaveLength(1);
  });

  it('flags description that is just "The options" for param named "options"', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [makeParam({ name: 'options', description: 'The options' })]
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'A2');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('alert');
    expect(issues[0].symbol).toContain('options');
  });

  it('flags description that is just the param name (no "The")', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [makeParam({ name: 'value', description: 'value' })]
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'A2');
    expect(issues).toHaveLength(1);
  });

  it('does NOT flag empty descriptions (E1 handles those)', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [makeParam({ name: 'value', description: '' })]
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'A2');
    expect(issues).toHaveLength(0);
  });

  it('is case-insensitive for trivial restatements', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [makeParam({ name: 'Options', description: 'The options' })]
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'A2');
    expect(issues).toHaveLength(1);
  });

  it('does not flag substantive descriptions', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          parameters: [
            makeParam({
              name: 'options',
              description: 'The options to configure request timeout and retries'
            })
          ]
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'A2');
    expect(issues).toHaveLength(0);
  });

  it('checks method parameters in classes', () => {
    const skill = makeSkill({
      classes: [
        {
          name: 'MyClass',
          description: 'A class',
          constructorSignature: 'new MyClass()',
          methods: [
            makeFunction({
              name: 'method',
              parameters: [makeParam({ name: 'value', description: 'The value' })]
            })
          ],
          properties: [],
          examples: []
        }
      ]
    });
    const issues = getIssues(skill, makeContext(), 'A2');
    expect(issues).toHaveLength(1);
    expect(issues[0].symbol).toContain('MyClass.method');
  });
});

// ---------------------------------------------------------------------------
// A3: Trivial @example
// ---------------------------------------------------------------------------

describe('A3: Trivial @example', () => {
  it('passes when there are no examples', () => {
    const passing = getPassing(makeSkill(), makeContext(), 'A3');
    expect(passing).toHaveLength(1);
  });

  it('passes when function has multi-line example', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          examples: ['import { fn } from "lib";\nconst result = fn();\nconsole.log(result);']
        })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'A3');
    expect(passing).toHaveLength(1);
  });

  it('passes when example has an import statement', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          examples: ["import { doSomething } from 'test-lib'"]
        })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'A3');
    expect(passing).toHaveLength(1);
  });

  it('passes when example has an assignment', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          examples: ['const result = doSomething()']
        })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'A3');
    expect(passing).toHaveLength(1);
  });

  it('passes when example has a comment', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          examples: ['// call the function\ndoSomething()']
        })
      ]
    });
    const passing = getPassing(skill, makeContext(), 'A3');
    expect(passing).toHaveLength(1);
  });

  it('flags a single-line example with no import, assignment, or comment', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          examples: ['doSomething()']
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'A3');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('alert');
  });

  it('flags trivial package-level examples', () => {
    const skill = makeSkill({
      examples: ['doSomething()']
    });
    const issues = getIssues(skill, makeContext(), 'A3');
    expect(issues).toHaveLength(1);
  });

  it('does not double-flag multi-line examples with a trivial line', () => {
    const skill = makeSkill({
      functions: [
        makeFunction({
          examples: ['doSomething()\nconst x = 1']
        })
      ]
    });
    const issues = getIssues(skill, makeContext(), 'A3');
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A4: Verbose Quick Start
// ---------------------------------------------------------------------------

describe('A4: Verbose Quick Start', () => {
  it('passes when quickStart is absent', () => {
    const passing = getPassing(
      makeSkill(),
      makeContext({ readme: { blockquote: 'A useful library.' } }),
      'A4'
    );
    expect(passing).toHaveLength(1);
    expect(passing[0].message).toContain('No Quick Start');
  });

  it('passes when readme is missing', () => {
    const passing = getPassing(makeSkill(), makeContext({ readme: undefined }), 'A4');
    expect(passing).toHaveLength(1);
  });

  it('passes when code block is ≤15 lines', () => {
    // fences count as lines: "```\n" + 13×"line\n" + "```" = 15 lines
    const shortCode = '```\n' + 'line\n'.repeat(13) + '```';
    const passing = getPassing(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'A useful library.', quickStart: shortCode }
      }),
      'A4'
    );
    expect(passing).toHaveLength(1);
    expect(passing[0].message).toContain('concise');
  });

  it('recommends @example when Quick Start is long and no examples exist', () => {
    const longQuickStart = 'line\n'.repeat(25);
    const issues = getIssues(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'A useful library.', quickStart: longQuickStart }
      }),
      'A4'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].suggestion).toContain('@example');
  });

  it('falls back to per-block check when @example exists', () => {
    const verboseCode = '```\n' + 'line\n'.repeat(20) + '```';
    const issues = getIssues(
      makeSkill({
        functions: [
          {
            name: 'foo',
            description: 'Foo',
            signature: 'foo()',
            parameters: [],
            returnType: 'void',
            examples: ['```ts\nfoo()\n```'],
            tags: {}
          }
        ]
      }),
      makeContext({
        readme: { blockquote: 'A useful library.', quickStart: verboseCode }
      }),
      'A4'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('alert');
  });
});

// ---------------------------------------------------------------------------
// AuditResult structure
// ---------------------------------------------------------------------------

describe('auditSkill — AuditResult structure', () => {
  it('returns the package name', () => {
    const result = auditSkill({ ...makeSkill({ name: 'my-package' }), ...makeContext() });
    expect(result.package).toBe('my-package');
  });

  it('summary counts match actual issues', () => {
    const skill = makeSkill({
      functions: [makeFunction({ description: '' })]
    });
    const result = auditSkill({ ...skill, ...makeContext({ packageDescription: undefined }) });
    expect(result.summary.fatal).toBe(result.issues.filter((i) => i.severity === 'fatal').length);
    expect(result.summary.error).toBe(result.issues.filter((i) => i.severity === 'error').length);
    expect(result.summary.warning).toBe(
      result.issues.filter((i) => i.severity === 'warning').length
    );
    expect(result.summary.alert).toBe(result.issues.filter((i) => i.severity === 'alert').length);
  });

  it('all passing checks have a code and message', () => {
    const result = auditSkill({ ...makeSkill(), ...makeContext() });
    for (const p of result.passing) {
      expect(p.code).toBeTruthy();
      expect(p.message).toBeTruthy();
    }
  });

  it('all issues have required fields', () => {
    const result = auditSkill({
      ...makeSkill({ functions: [makeFunction({ description: '' })] }),
      ...makeContext({ packageDescription: '' })
    });
    for (const iss of result.issues) {
      expect(iss.code).toBeTruthy();
      expect(iss.severity).toMatch(/^(fatal|error|warning|alert)$/);
      expect(iss.file).toBeTruthy();
      expect(iss.symbol).toBeTruthy();
      expect(iss.message).toBeTruthy();
      expect(iss.suggestion).toBeTruthy();
    }
  });

  it('a fully-documented skill passes all 20 checks', () => {
    const skill = makeSkill({
      name: 'full-lib',
      description:
        'A comprehensive library that does many things well and has excellent documentation throughout.',
      functions: [
        makeFunction({
          name: 'transform',
          description: 'Transforms data from one format to another',
          returnType: 'string',
          returnsDescription: 'The transformed string',
          parameters: [makeParam({ name: 'input', description: 'The input data to transform' })],
          examples: [
            'import { transform } from "full-lib";\nconst result = transform("data");\nconsole.log(result);'
          ],
          tags: { since: '1.0.0' }
        })
      ],
      examples: ['import { transform } from "full-lib";\ntransform("data");']
    });

    const context = makeContext({
      packageDescription: 'A comprehensive library for doing useful things with data',
      keywords: [
        'data',
        'transform',
        'parse',
        'validate',
        'schema',
        'query',
        'filter',
        'sort',
        'map',
        'reduce',
        'pipeline'
      ],
      repository: 'https://github.com/test/full-lib',
      readme: {
        blockquote: 'A fully-documented library for data transformation.',
        firstParagraph: 'Extended description of the full library capabilities.',
        features: '- Feature 1\n- Feature 2',
        troubleshooting: 'If X fails, try Y.',
        quickStart: '```\nimport { transform } from "full-lib";\ntransform("data");\n```'
      }
    });

    const result = auditSkill({ ...skill, ...context });
    const fatalAndError = result.issues.filter(
      (i) => i.severity === 'fatal' || i.severity === 'error'
    );
    expect(fatalAndError).toHaveLength(0);
  });
});
