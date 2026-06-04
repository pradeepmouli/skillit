import { describe, it, expect } from 'vitest';
import { renderLlmsTxt } from '@skillit/core';
import type { ExtractedSkill, LlmsTxtOptions } from '@skillit/core';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const emptySkill: ExtractedSkill = {
  name: 'empty-lib',
  description: '',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

const minimalSkill: ExtractedSkill = {
  name: 'my-lib',
  description: 'A helpful library',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

const fullSkill: ExtractedSkill = {
  name: 'full-lib',
  description: 'A library with everything',
  functions: [
    {
      name: 'greet',
      description: 'Says hello to someone',
      signature: 'greet(name: string): string',
      parameters: [{ name: 'name', type: 'string', description: 'Who to greet', optional: false }],
      returnType: 'string',
      examples: ['```ts\ngreet("world");\n```'],
      tags: {}
    },
    {
      name: 'add',
      description: '',
      signature: 'add(a: number, b: number): number',
      parameters: [
        { name: 'a', type: 'number', description: 'First number', optional: false },
        { name: 'b', type: 'number', description: 'Second number', optional: true }
      ],
      returnType: 'number',
      examples: [],
      tags: {}
    },
    {
      name: 'noop',
      description: 'Does nothing',
      signature: 'noop(): void',
      parameters: [],
      returnType: 'void',
      examples: [],
      tags: {}
    }
  ],
  classes: [
    {
      name: 'MyService',
      description: 'Main service class',
      constructorSignature: 'new MyService(options: ServiceOptions)',
      methods: [
        {
          name: 'start',
          description: 'Starts the service',
          signature: 'start(): Promise<void>',
          parameters: [],
          returnType: 'Promise<void>',
          examples: [],
          tags: {}
        }
      ],
      properties: [{ name: 'name', type: 'string', description: 'Service name', optional: false }],
      examples: []
    }
  ],
  types: [
    {
      name: 'ServiceOptions',
      description: 'Options for the service',
      definition: '{ host: string; port: number }'
    }
  ],
  enums: [
    {
      name: 'Status',
      description: 'Service status',
      members: [
        { name: 'Running', value: '"running"', description: 'Service is running' },
        { name: 'Stopped', value: '"stopped"', description: 'Service is stopped' }
      ]
    }
  ],
  variables: [
    {
      name: 'DEFAULT_PORT',
      type: 'number',
      description: 'Default port number',
      isConst: true
    }
  ]
};

const defaultOptions: LlmsTxtOptions = {
  projectName: 'My Project',
  projectDescription: 'An example project'
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function render(skills: ExtractedSkill[], options: LlmsTxtOptions = defaultOptions) {
  return renderLlmsTxt(skills, options);
}

// ---------------------------------------------------------------------------
// Summary rendering
// ---------------------------------------------------------------------------

describe('renderLlmsTxt — summary', () => {
  it('includes project name as H1', () => {
    const { summary } = render([emptySkill]);
    expect(summary).toContain('# My Project');
  });

  it('includes project description as blockquote', () => {
    const { summary } = render([emptySkill]);
    expect(summary).toContain('> An example project');
  });

  it('omits description blockquote when empty', () => {
    const { summary } = render([emptySkill], {
      projectName: 'No Desc',
      projectDescription: ''
    });
    expect(summary).not.toContain('>');
  });

  it('does not render API section when skill has no functions/classes/variables', () => {
    const { summary } = render([emptySkill]);
    expect(summary).not.toContain('### API');
  });

  it('renders ### API section for functions', () => {
    const { summary } = render([fullSkill]);
    expect(summary).toContain('### API');
  });

  it('lists functions under ### API', () => {
    const { summary } = render([fullSkill]);
    expect(summary).toContain('`greet`');
    expect(summary).toContain('`add`');
  });

  it('includes function description when present', () => {
    const { summary } = render([fullSkill]);
    expect(summary).toContain('`greet`: Says hello to someone');
  });

  it('omits description separator when function has no description', () => {
    const { summary } = render([fullSkill]);
    // `add` has no description — should just show the name without colon
    const lines = summary.split('\n');
    const addLine = lines.find((l) => l.includes('`add`'));
    expect(addLine).toBeDefined();
    expect(addLine).not.toContain(':');
  });

  it('lists classes under ### API', () => {
    const { summary } = render([fullSkill]);
    expect(summary).toContain('`MyService`');
  });

  it('renders ## Optional and ### Types sections for types/enums', () => {
    const { summary } = render([fullSkill]);
    expect(summary).toContain('## Optional');
    expect(summary).toContain('### Types');
  });

  it('lists types under ### Types', () => {
    const { summary } = render([fullSkill]);
    expect(summary).toContain('`ServiceOptions`');
  });

  it('lists enums under ### Types', () => {
    const { summary } = render([fullSkill]);
    expect(summary).toContain('`Status`');
  });

  it('lists variables under ### API', () => {
    const { summary } = render([fullSkill]);
    expect(summary).toContain('`DEFAULT_PORT`');
  });

  it('does not render ## Optional when no types or enums', () => {
    const noTypesSkill: ExtractedSkill = {
      ...emptySkill,
      functions: [fullSkill.functions[0]!]
    };
    const { summary } = render([noTypesSkill]);
    expect(summary).not.toContain('## Optional');
    expect(summary).not.toContain('### Types');
  });

  describe('long description truncation', () => {
    it('truncates long function descriptions to first sentence if short enough', () => {
      // Total desc > 150 chars, but first sentence <= 150 chars
      const longDesc =
        'Short first sentence. ' +
        'Then more text that would push it over the limit and should be excluded from the summary output because the total is way over one hundred and fifty characters.';
      const longDescSkill: ExtractedSkill = {
        ...emptySkill,
        functions: [
          {
            name: 'fn',
            description: longDesc,
            signature: 'fn(): void',
            parameters: [],
            returnType: 'void',
            examples: [],
            tags: {}
          }
        ]
      };
      expect(longDesc.length).toBeGreaterThan(150);
      const { summary } = render([longDescSkill]);
      expect(summary).toContain('Short first sentence.');
      expect(summary).not.toContain('should be excluded');
    });

    it('truncates with ellipsis when description has no short first sentence', () => {
      const veryLongDesc = 'A'.repeat(200);
      const longDescSkill: ExtractedSkill = {
        ...emptySkill,
        functions: [
          {
            name: 'fn',
            description: veryLongDesc,
            signature: 'fn(): void',
            parameters: [],
            returnType: 'void',
            examples: [],
            tags: {}
          }
        ]
      };
      const { summary } = render([longDescSkill]);
      expect(summary).toContain('...');
      // Should be truncated to ~150 chars
      const lines = summary.split('\n');
      const fnLine = lines.find((l) => l.includes('`fn`'));
      expect(fnLine).toBeDefined();
      // The description portion should end with ellipsis
      expect(fnLine).toMatch(/\.\.\.$/);
    });

    it('does not truncate descriptions within 150 chars', () => {
      const shortDesc = 'A short description that fits easily.';
      const skill: ExtractedSkill = {
        ...emptySkill,
        functions: [
          {
            name: 'fn',
            description: shortDesc,
            signature: 'fn(): void',
            parameters: [],
            returnType: 'void',
            examples: [],
            tags: {}
          }
        ]
      };
      const { summary } = render([skill]);
      expect(summary).toContain(shortDesc);
    });
  });

  describe('multi-skill', () => {
    it('adds H2 for each skill name', () => {
      const skill2: ExtractedSkill = { ...emptySkill, name: 'second-lib', description: 'Second' };
      const { summary } = render([minimalSkill, skill2]);
      expect(summary).toContain('## my-lib');
      expect(summary).toContain('## second-lib');
    });

    it('adds skill description as blockquote in multi-skill mode', () => {
      const skill2: ExtractedSkill = {
        ...emptySkill,
        name: 'second-lib',
        description: 'Second lib desc'
      };
      const { summary } = render([minimalSkill, skill2]);
      expect(summary).toContain('> A helpful library');
      expect(summary).toContain('> Second lib desc');
    });

    it('omits skill blockquote when skill has no description in multi-skill mode', () => {
      const skill2: ExtractedSkill = { ...emptySkill, name: 'no-desc-lib', description: '' };
      const { summary } = render([minimalSkill, skill2]);
      // Only one blockquote for my-lib; no-desc-lib should not add one
      const lines = summary.split('\n').filter((l) => l.startsWith('> '));
      // project description + my-lib description = 2 blockquotes
      expect(lines.length).toBe(2);
    });

    it('renders API sections per skill in multi-skill mode', () => {
      const skillA: ExtractedSkill = {
        ...emptySkill,
        name: 'skill-a',
        description: '',
        functions: [fullSkill.functions[0]!]
      };
      const skillB: ExtractedSkill = {
        ...emptySkill,
        name: 'skill-b',
        description: '',
        types: [fullSkill.types[0]!]
      };
      const { summary } = render([skillA, skillB]);
      expect(summary).toContain('## skill-a');
      expect(summary).toContain('### API');
      expect(summary).toContain('## skill-b');
      expect(summary).toContain('## Optional');
    });
  });
});

// ---------------------------------------------------------------------------
// Full rendering
// ---------------------------------------------------------------------------

describe('renderLlmsTxt — full', () => {
  it('includes project name as H1', () => {
    const { full } = render([emptySkill]);
    expect(full).toContain('# My Project');
  });

  it('includes project description as blockquote', () => {
    const { full } = render([emptySkill]);
    expect(full).toContain('> An example project');
  });

  it('omits description blockquote when empty', () => {
    const { full } = render([emptySkill], { projectName: 'X', projectDescription: '' });
    expect(full).not.toContain('>');
  });

  describe('functions', () => {
    it('renders function name as H3', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('### greet');
    });

    it('renders function description', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('Says hello to someone');
    });

    it('renders function signature in ts code block', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('```ts');
      expect(full).toContain('greet(name: string): string');
    });

    it('renders parameters section', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('**Parameters:**');
      expect(full).toContain('`name: string`');
      expect(full).toContain('Who to greet');
    });

    it('marks optional parameters', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('`b: number` (optional)');
    });

    it('renders return type when not void', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('**Returns:** `string`');
      expect(full).toContain('**Returns:** `number`');
    });

    it('does not render return type for void functions', () => {
      const { full } = render([fullSkill]);
      // noop returns void — should not appear in returns
      const lines = full.split('\n');
      const returnsLines = lines.filter((l) => l.startsWith('**Returns:**'));
      // Only greet (string) and add (number) should have returns
      expect(returnsLines.length).toBe(2);
    });

    it('renders function examples', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('```ts\ngreet("world");\n```');
    });

    it('omits parameters section when function has no parameters', () => {
      const { full } = render([fullSkill]);
      // noop has no parameters
      expect(full).not.toContain('`noop` (optional)');
    });
  });

  describe('classes', () => {
    it('renders class name as H3', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('### MyService');
    });

    it('renders class description', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('Main service class');
    });

    it('renders constructor signature in ts code block', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('new MyService(options: ServiceOptions)');
    });

    it('renders properties section', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('**Properties:**');
      expect(full).toContain('`name: string`');
      expect(full).toContain('Service name');
    });

    it('renders methods section', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('**Methods:**');
      expect(full).toContain('`start(): Promise<void>`');
    });

    it('omits properties section when class has no properties', () => {
      const noPropsSkill: ExtractedSkill = {
        ...emptySkill,
        classes: [
          {
            name: 'Simple',
            description: '',
            constructorSignature: 'new Simple()',
            methods: [],
            properties: [],
            examples: []
          }
        ]
      };
      const { full } = render([noPropsSkill]);
      expect(full).not.toContain('**Properties:**');
    });

    it('omits methods section when class has no methods', () => {
      const noMethodsSkill: ExtractedSkill = {
        ...emptySkill,
        classes: [
          {
            name: 'Simple',
            description: '',
            constructorSignature: 'new Simple()',
            methods: [],
            properties: [],
            examples: []
          }
        ]
      };
      const { full } = render([noMethodsSkill]);
      expect(full).not.toContain('**Methods:**');
    });
  });

  describe('types', () => {
    it('renders type name as H3', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('### ServiceOptions');
    });

    it('renders type description', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('Options for the service');
    });

    it('renders type definition in ts code block', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('type ServiceOptions = { host: string; port: number }');
    });
  });

  describe('enums', () => {
    it('renders enum name as H3', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('### Status');
    });

    it('renders enum description', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('Service status');
    });

    it('renders enum members with values and descriptions', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('`Running` = `"running"`');
      expect(full).toContain('Service is running');
      expect(full).toContain('`Stopped` = `"stopped"`');
    });
  });

  describe('variables', () => {
    it('renders variable name as H3', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('### DEFAULT_PORT');
    });

    it('renders variable description', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('Default port number');
    });

    it('renders const variable with const keyword', () => {
      const { full } = render([fullSkill]);
      expect(full).toContain('const DEFAULT_PORT: number');
    });

    it('renders let variable with let keyword', () => {
      const letVarSkill: ExtractedSkill = {
        ...emptySkill,
        variables: [{ name: 'counter', type: 'number', description: '', isConst: false }]
      };
      const { full } = render([letVarSkill]);
      expect(full).toContain('let counter: number');
    });
  });

  describe('multi-skill', () => {
    it('adds H2 per skill in full output', () => {
      const skillA: ExtractedSkill = { ...emptySkill, name: 'skill-a', description: 'Alpha' };
      const skillB: ExtractedSkill = { ...emptySkill, name: 'skill-b', description: 'Beta' };
      const { full } = render([skillA, skillB]);
      expect(full).toContain('## skill-a');
      expect(full).toContain('## skill-b');
    });

    it('adds skill description in full output for multi-skill', () => {
      const skillA: ExtractedSkill = { ...emptySkill, name: 'skill-a', description: 'Alpha desc' };
      const skillB: ExtractedSkill = { ...emptySkill, name: 'skill-b', description: 'Beta desc' };
      const { full } = render([skillA, skillB]);
      expect(full).toContain('Alpha desc');
      expect(full).toContain('Beta desc');
    });

    it('adds --- separator between skills in full output', () => {
      const skillA: ExtractedSkill = { ...emptySkill, name: 'skill-a', description: '' };
      const skillB: ExtractedSkill = { ...emptySkill, name: 'skill-b', description: '' };
      const { full } = render([skillA, skillB]);
      expect(full).toContain('---');
    });

    it('does not add --- separator for single skill', () => {
      const { full } = render([emptySkill]);
      expect(full).not.toContain('---');
    });
  });
});

// ---------------------------------------------------------------------------
// Token estimates
// ---------------------------------------------------------------------------

describe('renderLlmsTxt — token estimates', () => {
  it('returns positive summaryTokens', () => {
    const { summaryTokens } = render([fullSkill]);
    expect(summaryTokens).toBeGreaterThan(0);
  });

  it('returns positive fullTokens', () => {
    const { fullTokens } = render([fullSkill]);
    expect(fullTokens).toBeGreaterThan(0);
  });

  it('fullTokens is greater than summaryTokens for content-rich skills', () => {
    const { summaryTokens, fullTokens } = render([fullSkill]);
    expect(fullTokens).toBeGreaterThan(summaryTokens);
  });

  it('returns numeric token values', () => {
    const { summaryTokens, fullTokens } = render([emptySkill]);
    expect(typeof summaryTokens).toBe('number');
    expect(typeof fullTokens).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('renderLlmsTxt — edge cases', () => {
  it('handles empty skills array', () => {
    const result = render([]);
    expect(result.summary).toContain('# My Project');
    expect(result.full).toContain('# My Project');
  });

  it('handles skill with no description gracefully', () => {
    const { summary, full } = render([emptySkill]);
    expect(summary).toBeDefined();
    expect(full).toBeDefined();
  });

  it('handles function with no signature', () => {
    const noSigSkill: ExtractedSkill = {
      ...emptySkill,
      functions: [
        {
          name: 'bare',
          description: 'A bare function',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    };
    const { full } = render([noSigSkill]);
    expect(full).toContain('### bare');
    // No code block since no signature
    expect(full).not.toContain('```ts\n\n```');
  });

  it('handles type with no definition', () => {
    const noDefSkill: ExtractedSkill = {
      ...emptySkill,
      types: [{ name: 'MyType', description: '', definition: '' }]
    };
    const { full } = render([noDefSkill]);
    expect(full).toContain('### MyType');
  });

  it('handles class with no description or constructor', () => {
    const bareClassSkill: ExtractedSkill = {
      ...emptySkill,
      classes: [
        {
          name: 'BareClass',
          description: '',
          constructorSignature: '',
          methods: [],
          properties: [],
          examples: []
        }
      ]
    };
    const { full } = render([bareClassSkill]);
    expect(full).toContain('### BareClass');
  });

  it('handles skill with only variables (no functions/classes)', () => {
    const varOnlySkill: ExtractedSkill = {
      ...emptySkill,
      variables: [
        { name: 'VERSION', type: 'string', description: 'Library version', isConst: true }
      ]
    };
    const { summary, full } = render([varOnlySkill]);
    expect(summary).toContain('`VERSION`');
    expect(summary).toContain('### API');
    expect(full).toContain('### VERSION');
    expect(full).toContain('const VERSION: string');
  });

  it('returns all four result fields', () => {
    const result = render([minimalSkill]);
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('full');
    expect(result).toHaveProperty('summaryTokens');
    expect(result).toHaveProperty('fullTokens');
  });

  it('summary and full are strings', () => {
    const { summary, full } = render([minimalSkill]);
    expect(typeof summary).toBe('string');
    expect(typeof full).toBe('string');
  });
});
