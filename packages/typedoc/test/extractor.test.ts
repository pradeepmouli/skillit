import { describe, it, expect } from 'vitest';
import { ReflectionKind } from 'typedoc';
import { extractSkills, parseBulletList } from '../src/extractor.js';

// ── Mock helpers ────────────────────────────────────────────────────────────

function mockComment(
  text: string,
  examples: string[] = [],
  returnsText?: string,
  blockTags: any[] = [],
  extraTags: Record<string, string> = {}
) {
  return {
    summary: [{ text }],
    getTags: (tagName: string) =>
      tagName === '@example' ? examples.map((ex) => ({ content: [{ text: ex }] })) : [],
    getTag: (tagName: string) => {
      if (tagName === '@returns' && returnsText) return { content: [{ text: returnsText }] };
      const key = tagName.replace(/^@/, '');
      if (extraTags[key] !== undefined) return { content: [{ text: extraTags[key] }] };
      return undefined;
    },
    blockTags
  };
}

function mockParam(name: string, type: string, optional = false, comment?: any) {
  return {
    name,
    type: { toString: () => type },
    flags: { isOptional: optional },
    comment,
    defaultValue: undefined
  };
}

function mockSig(params: any[] = [], returnType = 'void', comment?: any, typeParameters?: any[]) {
  return {
    parameters: params,
    type: { toString: () => returnType },
    comment,
    typeParameters
  };
}

function mockDecl(name: string, kind: ReflectionKind, overrides: any = {}) {
  return {
    name,
    kind,
    comment: overrides.comment ?? undefined,
    children: overrides.children ?? undefined,
    signatures: overrides.signatures ?? undefined,
    sources: overrides.sources ?? undefined,
    type: overrides.type ?? undefined,
    flags: overrides.flags ?? {},
    extendedTypes: overrides.extendedTypes ?? undefined,
    implementedTypes: overrides.implementedTypes ?? undefined
  };
}

function mockProject(children: any[] = [], documents?: any[]) {
  return { name: 'test-project', comment: undefined, children, documents } as any;
}

// ── extractSkills: single-package (no modules) ───────────────────────────

describe('extractSkills — single package (no modules)', () => {
  it('returns a single ExtractedSkill with the project name', () => {
    const project = mockProject([]);
    const [skill] = extractSkills(project, false);
    expect(skill.name).toBe('test-project');
  });

  it('uses metadata name when provided', () => {
    const project = mockProject([]);
    const [skill] = extractSkills(project, false, { name: 'my-pkg' });
    expect(skill.name).toBe('my-pkg');
  });

  it('passes through keywords, repository, author from metadata', () => {
    const project = mockProject([]);
    const [skill] = extractSkills(project, false, {
      name: 'my-pkg',
      keywords: ['a', 'b'],
      repository: 'https://github.com/x/y',
      author: 'Alice'
    });
    expect(skill.keywords).toEqual(['a', 'b']);
    expect(skill.repository).toBe('https://github.com/x/y');
    expect(skill.author).toBe('Alice');
  });

  it('passes through packageDescription from metadata description', () => {
    const project = mockProject([]);
    const [skill] = extractSkills(project, false, {
      name: 'my-pkg',
      description: 'A helpful library for doing things'
    });
    expect(skill.packageDescription).toBe('A helpful library for doing things');
  });

  it('leaves packageDescription undefined when metadata has no description', () => {
    const project = mockProject([]);
    const [skill] = extractSkills(project, false, { name: 'my-pkg' });
    expect(skill.packageDescription).toBeUndefined();
  });

  it('returns empty arrays for all categories when project has no children', () => {
    const project = mockProject([]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions).toEqual([]);
    expect(skill.classes).toEqual([]);
    expect(skill.types).toEqual([]);
    expect(skill.enums).toEqual([]);
    expect(skill.variables).toEqual([]);
    expect(skill.examples).toEqual([]);
  });
});

// ── Functions ─────────────────────────────────────────────────────────────

describe('extractSkills — functions', () => {
  it('extracts a simple function with name, description, signature, return type', () => {
    const sig = mockSig([], 'string', mockComment('Greets a user'));
    const fn = mockDecl('greet', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);

    expect(skill.functions).toHaveLength(1);
    const f = skill.functions[0];
    expect(f.name).toBe('greet');
    expect(f.description).toBe('Greets a user');
    expect(f.signature).toBe('greet(): string');
    expect(f.returnType).toBe('string');
  });

  it('extracts function parameters (name, type, optional)', () => {
    const params = [mockParam('name', 'string'), mockParam('age', 'number', true)];
    const sig = mockSig(params, 'void');
    const fn = mockDecl('register', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);

    const f = skill.functions[0];
    expect(f.parameters).toHaveLength(2);
    expect(f.parameters[0]).toMatchObject({ name: 'name', type: 'string', optional: false });
    expect(f.parameters[1]).toMatchObject({ name: 'age', type: 'number', optional: true });
    expect(f.signature).toBe('register(name: string, age?: number): void');
  });

  it('extracts @returns description', () => {
    const sig = mockSig([], 'string', mockComment('Does work', [], 'The result string'));
    const fn = mockDecl('work', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].returnsDescription).toBe('The result string');
  });

  it('extracts @example tags from function comments', () => {
    const sig = mockSig([], 'void', mockComment('Example fn', ['greet("Alice")', 'greet("Bob")']));
    const fn = mockDecl('greet', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].examples).toEqual(['greet("Alice")', 'greet("Bob")']);
  });

  it('falls back to decl comment when no signature comment', () => {
    const sig = mockSig([], 'void', undefined);
    const fn = mockDecl('noSigComment', ReflectionKind.Function, {
      signatures: [sig],
      comment: mockComment('Fallback description')
    });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].description).toBe('Fallback description');
  });

  it('extracts function overloads when multiple signatures exist', () => {
    const sig1 = mockSig([mockParam('x', 'string')], 'string');
    const sig2 = mockSig([mockParam('x', 'number')], 'number');
    const fn = mockDecl('parse', ReflectionKind.Function, { signatures: [sig1, sig2] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    const f = skill.functions[0];
    expect(f.overloads).toHaveLength(1);
    expect(f.overloads![0]).toBe('parse(x: number): number');
  });

  it('sets overloads to undefined when only one signature', () => {
    const sig = mockSig([], 'void');
    const fn = mockDecl('single', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].overloads).toBeUndefined();
  });

  it('extracts custom tags into tags map (excludes example/param/returns)', () => {
    const blockTags = [
      { tag: '@since', content: [{ text: '1.0.0' }] },
      { tag: '@deprecated', content: [{ text: 'use newFn' }] },
      { tag: '@example', content: [{ text: 'code()' }] }
    ];
    const sig = mockSig([], 'void', mockComment('Tagged fn', [], undefined, blockTags));
    const fn = mockDecl('taggedFn', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    const tags = skill.functions[0].tags;
    expect(tags['since']).toBe('1.0.0');
    expect(tags['deprecated']).toBe('use newFn');
    expect(tags['example']).toBeUndefined(); // filtered out
  });

  it('returns signature as "name()" when no signature object exists', () => {
    const fn = mockDecl('noSig', ReflectionKind.Function, { signatures: undefined });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].signature).toBe('noSig()');
  });
});

// ── Classes ───────────────────────────────────────────────────────────────

describe('extractSkills — classes', () => {
  it('extracts a class with name and description', () => {
    const cls = mockDecl('MyClass', ReflectionKind.Class, {
      comment: mockComment('A useful class'),
      children: []
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    expect(skill.classes).toHaveLength(1);
    expect(skill.classes[0].name).toBe('MyClass');
    expect(skill.classes[0].description).toBe('A useful class');
  });

  it('extracts public methods and skips private methods', () => {
    const publicMethod = mockDecl('doWork', ReflectionKind.Method, {
      flags: { isPrivate: false },
      signatures: [mockSig([], 'void', mockComment('Does work'))]
    });
    const privateMethod = mockDecl('_internal', ReflectionKind.Method, {
      flags: { isPrivate: true },
      signatures: [mockSig([], 'void')]
    });
    const cls = mockDecl('MyClass', ReflectionKind.Class, {
      children: [publicMethod, privateMethod]
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    const c = skill.classes[0];
    expect(c.methods).toHaveLength(1);
    expect(c.methods[0].name).toBe('doWork');
  });

  it('extracts public properties and skips private properties', () => {
    const publicProp = mockDecl('value', ReflectionKind.Property, {
      flags: { isPrivate: false, isOptional: false },
      type: { toString: () => 'string' },
      comment: mockComment('The value')
    });
    const privateProp = mockDecl('_secret', ReflectionKind.Property, {
      flags: { isPrivate: true, isOptional: false },
      type: { toString: () => 'string' }
    });
    const cls = mockDecl('MyClass', ReflectionKind.Class, {
      children: [publicProp, privateProp]
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    const c = skill.classes[0];
    expect(c.properties).toHaveLength(1);
    expect(c.properties[0].name).toBe('value');
    expect(c.properties[0].type).toBe('string');
  });

  it('extracts constructor signature', () => {
    const ctorSig = mockSig([mockParam('id', 'number')], 'MyClass');
    const ctor = mockDecl('constructor', ReflectionKind.Constructor, {
      signatures: [ctorSig]
    });
    const cls = mockDecl('MyClass', ReflectionKind.Class, {
      children: [ctor]
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    expect(skill.classes[0].constructorSignature).toBe('constructor(id: number): MyClass');
  });

  it('sets constructorSignature to empty string when no constructor', () => {
    const cls = mockDecl('MyClass', ReflectionKind.Class, { children: [] });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    expect(skill.classes[0].constructorSignature).toBe('');
  });

  it('extracts extends and implements', () => {
    const cls = mockDecl('Child', ReflectionKind.Class, {
      children: [],
      extendedTypes: [{ toString: () => 'Base' }],
      implementedTypes: [{ toString: () => 'IFoo' }, { toString: () => 'IBar' }]
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    const c = skill.classes[0];
    expect(c.extends).toBe('Base');
    expect(c.implements).toEqual(['IFoo', 'IBar']);
  });

  it('sets implements to undefined when no implemented types', () => {
    const cls = mockDecl('Solo', ReflectionKind.Class, {
      children: [],
      implementedTypes: []
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    expect(skill.classes[0].implements).toBeUndefined();
  });

  it('extracts class-level @example tags', () => {
    const cls = mockDecl('MyClass', ReflectionKind.Class, {
      comment: mockComment('A class', ['new MyClass()']),
      children: []
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    expect(skill.classes[0].examples).toEqual(['new MyClass()']);
  });
});

// ── Interfaces (extracted as types) ──────────────────────────────────────

describe('extractSkills — interfaces', () => {
  it('extracts an interface as a type with name and description', () => {
    const iface = mockDecl('MyInterface', ReflectionKind.Interface, {
      comment: mockComment('Describes something'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.types).toHaveLength(1);
    expect(skill.types[0].name).toBe('MyInterface');
    expect(skill.types[0].description).toBe('Describes something');
  });

  it('extracts interface properties', () => {
    const prop = mockDecl('id', ReflectionKind.Property, {
      flags: { isOptional: false },
      type: { toString: () => 'number' },
      comment: mockComment('The ID')
    });
    const iface = mockDecl('User', ReflectionKind.Interface, {
      children: [prop]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    const t = skill.types[0];
    expect(t.properties).toHaveLength(1);
    expect(t.properties![0]).toMatchObject({
      name: 'id',
      type: 'number',
      description: 'The ID',
      optional: false
    });
  });

  it('extracts optional interface properties', () => {
    const prop = mockDecl('nickname', ReflectionKind.Property, {
      flags: { isOptional: true },
      type: { toString: () => 'string' }
    });
    const iface = mockDecl('User', ReflectionKind.Interface, {
      children: [prop]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.types[0].properties![0].optional).toBe(true);
  });

  it('sets properties to undefined when interface has no property children', () => {
    const iface = mockDecl('EmptyIface', ReflectionKind.Interface, {
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.types[0].properties).toBeUndefined();
  });

  it('also extracts TypeAlias as a type', () => {
    const alias = mockDecl('MyAlias', ReflectionKind.TypeAlias, {
      comment: mockComment('A type alias'),
      type: { toString: () => 'string | number' }
    });
    const project = mockProject([alias]);
    const [skill] = extractSkills(project, false);
    expect(skill.types).toHaveLength(1);
    expect(skill.types[0].name).toBe('MyAlias');
    expect(skill.types[0].definition).toBe('string | number');
  });
});

// ── Enums ─────────────────────────────────────────────────────────────────

describe('extractSkills — enums', () => {
  it('extracts an enum with members', () => {
    const memberA = mockDecl('Active', ReflectionKind.EnumMember, {
      type: { toString: () => '0' },
      comment: mockComment('Active state')
    });
    const memberB = mockDecl('Inactive', ReflectionKind.EnumMember, {
      type: { toString: () => '1' }
    });
    const en = mockDecl('Status', ReflectionKind.Enum, {
      comment: mockComment('Status values'),
      children: [memberA, memberB]
    });
    const project = mockProject([en]);
    const [skill] = extractSkills(project, false);
    expect(skill.enums).toHaveLength(1);
    const e = skill.enums[0];
    expect(e.name).toBe('Status');
    expect(e.description).toBe('Status values');
    expect(e.members).toHaveLength(2);
    expect(e.members[0]).toMatchObject({ name: 'Active', value: '0', description: 'Active state' });
    expect(e.members[1]).toMatchObject({ name: 'Inactive', value: '1', description: '' });
  });

  it('returns empty members array for empty enum', () => {
    const en = mockDecl('Empty', ReflectionKind.Enum, { children: [] });
    const project = mockProject([en]);
    const [skill] = extractSkills(project, false);
    expect(skill.enums[0].members).toEqual([]);
  });
});

// ── Variables ─────────────────────────────────────────────────────────────

describe('extractSkills — variables', () => {
  it('extracts a const variable', () => {
    const v = mockDecl('MAX_RETRIES', ReflectionKind.Variable, {
      type: { toString: () => 'number' },
      flags: { isConst: true },
      comment: mockComment('Maximum retries')
    });
    const project = mockProject([v]);
    const [skill] = extractSkills(project, false);
    expect(skill.variables).toHaveLength(1);
    const variable = skill.variables[0];
    expect(variable.name).toBe('MAX_RETRIES');
    expect(variable.type).toBe('number');
    expect(variable.isConst).toBe(true);
    expect(variable.description).toBe('Maximum retries');
  });

  it('extracts a non-const variable', () => {
    const v = mockDecl('counter', ReflectionKind.Variable, {
      type: { toString: () => 'number' },
      flags: { isConst: false }
    });
    const project = mockProject([v]);
    const [skill] = extractSkills(project, false);
    expect(skill.variables[0].isConst).toBe(false);
  });

  it('defaults type to "unknown" when no type provided', () => {
    const v = mockDecl('x', ReflectionKind.Variable, { flags: {} });
    const project = mockProject([v]);
    const [skill] = extractSkills(project, false);
    expect(skill.variables[0].type).toBe('unknown');
  });
});

// ── Documents ─────────────────────────────────────────────────────────────

describe('extractSkills — documents', () => {
  it('extracts documents from project', () => {
    const project = mockProject(
      [],
      [
        { name: 'Guide', content: [{ text: 'Some guide text' }] },
        { name: 'API', content: [{ text: 'API reference' }] }
      ]
    );
    const [skill] = extractSkills(project, false);
    expect(skill.documents).toHaveLength(2);
    expect(skill.documents![0]).toEqual({ title: 'Guide', content: 'Some guide text' });
    expect(skill.documents![1]).toEqual({ title: 'API', content: 'API reference' });
  });

  it('skips documents with no content', () => {
    const project = mockProject(
      [],
      [
        { name: 'Empty', content: [] },
        { name: 'Filled', content: [{ text: 'Content here' }] }
      ]
    );
    const [skill] = extractSkills(project, false);
    // Only 'Filled' should appear (empty content trims to '')
    expect(skill.documents!.find((d) => d.title === 'Filled')).toBeDefined();
    expect(skill.documents!.find((d) => d.title === 'Empty')).toBeUndefined();
  });
});

// ── Per-package grouping with modules ────────────────────────────────────

describe('extractSkills — perPackage mode with modules', () => {
  it('groups modules by name when perPackage=true (no source files for resolution)', () => {
    const modA = mockDecl('pkg-a', ReflectionKind.Module, {
      children: [mockDecl('fnA', ReflectionKind.Function, { signatures: [mockSig([], 'void')] })]
    });
    const modB = mockDecl('pkg-b', ReflectionKind.Module, {
      children: [mockDecl('fnB', ReflectionKind.Function, { signatures: [mockSig([], 'string')] })]
    });
    const project = mockProject([modA, modB]);
    const skills = extractSkills(project, true);
    // Without source files, modules can't resolve package names, so they all
    // merge into the fallback group (project name = 'test-project')
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test-project');
    expect(skills[0].functions).toHaveLength(2);
    expect(skills[0].functions.map((f) => f.name)).toContain('fnA');
    expect(skills[0].functions.map((f) => f.name)).toContain('fnB');
  });

  it('merges multiple modules under the fallback name when no sources', () => {
    const mod1 = mockDecl('sub-a', ReflectionKind.Module, {
      children: [mockDecl('fn1', ReflectionKind.Function, { signatures: [mockSig([], 'void')] })]
    });
    const mod2 = mockDecl('sub-b', ReflectionKind.Module, {
      children: [mockDecl('fn2', ReflectionKind.Function, { signatures: [mockSig([], 'void')] })]
    });
    const project = mockProject([mod1, mod2]);
    // Without source files, all modules merge under project name
    const skills = extractSkills(project, true);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test-project');
    expect(skills[0].functions).toHaveLength(2);
  });

  it('falls back to single-package when no modules present even with perPackage=true', () => {
    const fn = mockDecl('hello', ReflectionKind.Function, { signatures: [mockSig([], 'void')] });
    const project = mockProject([fn]);
    const skills = extractSkills(project, true);
    expect(skills).toHaveLength(1);
    expect(skills[0].functions[0].name).toBe('hello');
  });

  it('uses metadata.name as fallback when module has no source files', () => {
    // In perPackage mode, modules that can't resolve a package name via source
    // files fall back to metadata.name (not mod.name), preventing internal
    // submodules like "array" or "string" from becoming separate skills.
    const mod = mockDecl('internal-name', ReflectionKind.Module, {
      children: []
    });
    const project = mockProject([mod]);
    const skills = extractSkills(project, true, { name: 'override-name' });
    // Falls back to metadata.name, not mod.name
    expect(skills[0].name).toBe('override-name');
  });

  it('collects functions/classes/types/enums/variables from all modules in merged group', () => {
    const mod1 = mockDecl('lib', ReflectionKind.Module, {
      children: [
        mockDecl('MyClass', ReflectionKind.Class, { children: [] }),
        mockDecl('Status', ReflectionKind.Enum, { children: [] })
      ]
    });
    const mod2 = mockDecl('lib', ReflectionKind.Module, {
      children: [
        mockDecl('IFace', ReflectionKind.Interface, { children: [] }),
        mockDecl('MAX', ReflectionKind.Variable, {
          flags: { isConst: true },
          type: { toString: () => 'number' }
        })
      ]
    });
    const project = mockProject([mod1, mod2]);
    const [skill] = extractSkills(project, true);
    expect(skill.classes).toHaveLength(1);
    expect(skill.enums).toHaveLength(1);
    expect(skill.types).toHaveLength(1);
    expect(skill.variables).toHaveLength(1);
  });
});

// ── Nested submodule flattening ──────────────────────────────────────────

describe('extractSkills — nested submodule flattening', () => {
  it('extracts children from nested submodules', () => {
    const submod = mockDecl('utils', ReflectionKind.Module, {
      children: [
        mockDecl('helper', ReflectionKind.Function, {
          signatures: [mockSig([], 'void')],
          sources: [{ fullFileName: '/project/src/utils.ts' }]
        })
      ]
    });
    const rootMod = mockDecl('my-pkg', ReflectionKind.Module, {
      children: [
        submod,
        mockDecl('main', ReflectionKind.Function, {
          signatures: [mockSig([], 'void')],
          sources: [{ fullFileName: '/project/src/index.ts' }]
        })
      ]
    });
    const project = mockProject([rootMod]);
    const [skill] = extractSkills(project, true);
    expect(skill.functions.map((f) => f.name)).toContain('main');
    expect(skill.functions.map((f) => f.name)).toContain('helper');
  });

  it('handles deeply nested submodules', () => {
    const deep = mockDecl('deep', ReflectionKind.Module, {
      children: [
        mockDecl('deepFn', ReflectionKind.Function, {
          signatures: [mockSig([], 'void')]
        })
      ]
    });
    const mid = mockDecl('mid', ReflectionKind.Module, {
      children: [deep]
    });
    const root = mockDecl('root', ReflectionKind.Module, {
      children: [mid]
    });
    const project = mockProject([root]);
    const [skill] = extractSkills(project, true);
    expect(skill.functions.map((f) => f.name)).toContain('deepFn');
  });
});

// ── Mixed children (only correct kinds extracted) ────────────────────────

describe('extractSkills — kind filtering', () => {
  it('only extracts items of matching kind into correct buckets', () => {
    const fn = mockDecl('myFn', ReflectionKind.Function, { signatures: [mockSig([], 'void')] });
    const cls = mockDecl('MyClass', ReflectionKind.Class, { children: [] });
    const iface = mockDecl('IFoo', ReflectionKind.Interface, { children: [] });
    const alias = mockDecl('Alias', ReflectionKind.TypeAlias, {
      type: { toString: () => 'string' }
    });
    const en = mockDecl('Color', ReflectionKind.Enum, { children: [] });
    const v = mockDecl('CONST', ReflectionKind.Variable, {
      flags: { isConst: true },
      type: { toString: () => 'string' }
    });
    const project = mockProject([fn, cls, iface, alias, en, v]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions).toHaveLength(1);
    expect(skill.classes).toHaveLength(1);
    expect(skill.types).toHaveLength(2); // interface + alias
    expect(skill.enums).toHaveLength(1);
    expect(skill.variables).toHaveLength(1);
  });
});

// ── formatSignature with type parameters ─────────────────────────────────

describe('extractSkills — generic function signature', () => {
  it('includes type parameters in the signature', () => {
    const sig = mockSig([mockParam('value', 'T')], 'T', undefined, [{ name: 'T' }]);
    const fn = mockDecl('identity', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].signature).toBe('identity<T>(value: T): T');
  });
});

// ── sourceModule extraction ───────────────────────────────────────────────

describe('extractSkills — sourceModule', () => {
  it('extracts sourceModule from fullFileName on a function declaration', () => {
    const sig = mockSig([], 'void');
    const fn = mockDecl('myFn', ReflectionKind.Function, {
      signatures: [sig],
      sources: [{ fullFileName: '/project/src/utils.ts' }]
    });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].sourceModule).toBe('utils');
  });

  it('falls back to fileName when fullFileName is absent', () => {
    const sig = mockSig([], 'void');
    const fn = mockDecl('myFn', ReflectionKind.Function, {
      signatures: [sig],
      sources: [{ fileName: 'src/renderer.ts' }]
    });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].sourceModule).toBe('renderer');
  });

  it('returns undefined for index files', () => {
    const sig = mockSig([], 'void');
    const fn = mockDecl('myFn', ReflectionKind.Function, {
      signatures: [sig],
      sources: [{ fullFileName: '/project/src/index.ts' }]
    });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].sourceModule).toBeUndefined();
  });

  it('returns undefined when sources are absent', () => {
    const sig = mockSig([], 'void');
    const fn = mockDecl('myFn', ReflectionKind.Function, {
      signatures: [sig],
      sources: undefined
    });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].sourceModule).toBeUndefined();
  });

  it('extracts sourceModule on a class declaration', () => {
    const cls = mockDecl('MyClass', ReflectionKind.Class, {
      children: [],
      sources: [{ fullFileName: '/project/src/tokens.ts' }]
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    expect(skill.classes[0].sourceModule).toBe('tokens');
  });

  it('methods inherit class sourceModule (via parentDecl)', () => {
    const method = mockDecl('doWork', ReflectionKind.Method, {
      flags: { isPrivate: false },
      signatures: [mockSig([], 'void')],
      sources: undefined
    });
    const cls = mockDecl('MyClass', ReflectionKind.Class, {
      children: [method],
      sources: [{ fullFileName: '/project/src/renderer.ts' }]
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    expect(skill.classes[0].methods[0].sourceModule).toBe('renderer');
  });

  it('extracts sourceModule on a variable declaration', () => {
    const v = mockDecl('MAX_RETRIES', ReflectionKind.Variable, {
      type: { toString: () => 'number' },
      flags: { isConst: true },
      sources: [{ fullFileName: '/project/src/llms-txt.ts' }]
    });
    const project = mockProject([v]);
    const [skill] = extractSkills(project, false);
    expect(skill.variables[0].sourceModule).toBe('llms-txt');
  });

  it('extracts sourceModule on an enum declaration', () => {
    const en = mockDecl('Status', ReflectionKind.Enum, {
      children: [],
      sources: [{ fullFileName: '/project/src/models.ts' }]
    });
    const project = mockProject([en]);
    const [skill] = extractSkills(project, false);
    expect(skill.enums[0].sourceModule).toBe('models');
  });

  it('extracts sourceModule on an interface declaration', () => {
    const iface = mockDecl('IUser', ReflectionKind.Interface, {
      children: [],
      sources: [{ fullFileName: '/project/src/types.ts' }]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.types[0].sourceModule).toBe('types');
  });
});

// ── @remarks extraction ───────────────────────────────────────────────────

describe('extractSkills — @remarks', () => {
  it('extracts @remarks from function signature comment', () => {
    const sig = mockSig(
      [],
      'void',
      mockComment('Does work', [], undefined, [], { remarks: 'Expert note: use carefully.' })
    );
    const fn = mockDecl('doWork', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].remarks).toBe('Expert note: use carefully.');
  });

  it('falls back to decl comment for @remarks when sig has no comment', () => {
    const sig = mockSig([], 'void', undefined);
    const fn = mockDecl('doWork', ReflectionKind.Function, {
      signatures: [sig],
      comment: mockComment('Fallback', [], undefined, [], { remarks: 'Decl-level remark.' })
    });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].remarks).toBe('Decl-level remark.');
  });

  it('returns undefined for remarks when no @remarks tag', () => {
    const sig = mockSig([], 'void', mockComment('No remarks here'));
    const fn = mockDecl('simple', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].remarks).toBeUndefined();
  });
});

// ── @category extraction ──────────────────────────────────────────────────

describe('extractSkills — @category', () => {
  it('extracts @category from function', () => {
    const sig = mockSig(
      [],
      'void',
      mockComment('Fn', [], undefined, [], { category: 'Utilities' })
    );
    const fn = mockDecl('util', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].category).toBe('Utilities');
  });

  it('extracts @category from class', () => {
    const cls = mockDecl('MyClass', ReflectionKind.Class, {
      comment: mockComment('A class', [], undefined, [], { category: 'Core' }),
      children: []
    });
    const project = mockProject([cls]);
    const [skill] = extractSkills(project, false);
    expect(skill.classes[0].category).toBe('Core');
  });

  it('extracts @category from interface (type)', () => {
    const iface = mockDecl('MyInterface', ReflectionKind.Interface, {
      comment: mockComment('An interface', [], undefined, [], { category: 'Types' }),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.types[0].category).toBe('Types');
  });

  it('extracts @category from enum', () => {
    const en = mockDecl('Status', ReflectionKind.Enum, {
      comment: mockComment('Status', [], undefined, [], { category: 'Enums' }),
      children: []
    });
    const project = mockProject([en]);
    const [skill] = extractSkills(project, false);
    expect(skill.enums[0].category).toBe('Enums');
  });

  it('extracts @category from variable', () => {
    const v = mockDecl('MAX', ReflectionKind.Variable, {
      type: { toString: () => 'number' },
      flags: { isConst: true },
      comment: mockComment('Max value', [], undefined, [], { category: 'Constants' })
    });
    const project = mockProject([v]);
    const [skill] = extractSkills(project, false);
    expect(skill.variables[0].category).toBe('Constants');
  });

  it('returns undefined for category when no @category tag', () => {
    const sig = mockSig([], 'void', mockComment('No category'));
    const fn = mockDecl('plain', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].category).toBeUndefined();
  });
});

// ── parseBulletList ───────────────────────────────────────────────────────

describe('parseBulletList', () => {
  it('parses dash-prefixed bullet items', () => {
    const result = parseBulletList('- Item one\n- Item two\n- Item three');
    expect(result).toEqual(['Item one', 'Item two', 'Item three']);
  });

  it('parses star-prefixed bullet items', () => {
    const result = parseBulletList('* Item A\n* Item B');
    expect(result).toEqual(['Item A', 'Item B']);
  });

  it('filters blank lines', () => {
    const result = parseBulletList('- First\n\n- Second');
    expect(result).toEqual(['First', 'Second']);
  });

  it('handles items without bullet prefix — joins as single paragraph', () => {
    const result = parseBulletList('Plain text\nAnother line');
    expect(result).toEqual(['Plain text Another line']);
  });

  it('splits non-bulleted text on blank lines into separate items', () => {
    const result = parseBulletList('First paragraph\n\nSecond paragraph');
    expect(result).toEqual(['First paragraph', 'Second paragraph']);
  });

  it('trims whitespace from each item', () => {
    const result = parseBulletList('-   Spaced item   ');
    expect(result).toEqual(['Spaced item']);
  });

  it('returns empty array for empty string', () => {
    expect(parseBulletList('')).toEqual([]);
  });
});

// ── @useWhen / @avoidWhen / @never aggregation ─────────────────────────

describe('extractSkills — @useWhen/@avoidWhen/@never aggregation', () => {
  it('aggregates @useWhen from function tags into skill.useWhen', () => {
    const blockTags = [
      { tag: '@useWhen', content: [{ text: '- Need validation\n- Schema compliance' }] }
    ];
    const sig = mockSig([], 'void', mockComment('Validates', [], undefined, blockTags));
    const fn = mockDecl('validate', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.useWhen).toEqual(['Need validation', 'Schema compliance']);
  });

  it('aggregates @avoidWhen from function tags into skill.avoidWhen', () => {
    const blockTags = [
      { tag: '@avoidWhen', content: [{ text: '- Performance critical\n- Already validated' }] }
    ];
    const sig = mockSig([], 'void', mockComment('Fn', [], undefined, blockTags));
    const fn = mockDecl('fn', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.avoidWhen).toEqual(['Performance critical', 'Already validated']);
  });

  it('aggregates @never from function tags into skill.never', () => {
    const blockTags = [
      { tag: '@never', content: [{ text: '- Forget to await\n- Null not handled' }] }
    ];
    const sig = mockSig([], 'void', mockComment('Fn', [], undefined, blockTags));
    const fn = mockDecl('fn', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.never).toEqual(['Forget to await', 'Null not handled']);
  });

  it('aggregates useWhen across multiple functions', () => {
    const bt1 = [{ tag: '@useWhen', content: [{ text: '- Case A' }] }];
    const bt2 = [{ tag: '@useWhen', content: [{ text: '- Case B' }] }];
    const fn1 = mockDecl('fn1', ReflectionKind.Function, {
      signatures: [mockSig([], 'void', mockComment('F1', [], undefined, bt1))]
    });
    const fn2 = mockDecl('fn2', ReflectionKind.Function, {
      signatures: [mockSig([], 'void', mockComment('F2', [], undefined, bt2))]
    });
    const project = mockProject([fn1, fn2]);
    const [skill] = extractSkills(project, false);
    expect(skill.useWhen).toEqual(['Case A', 'Case B']);
  });

  it('leaves useWhen/avoidWhen/never undefined when no tags', () => {
    const sig = mockSig([], 'void', mockComment('Simple fn'));
    const fn = mockDecl('fn', ReflectionKind.Function, { signatures: [sig] });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.useWhen).toBeUndefined();
    expect(skill.avoidWhen).toBeUndefined();
    expect(skill.never).toBeUndefined();
  });
});

// ── Config interface detection ────────────────────────────────────────────

describe('extractSkills — config interface detection', () => {
  it('detects @config tag on interface → extracted as configSurface', () => {
    const iface = mockDecl('MySettings', ReflectionKind.Interface, {
      comment: mockComment('Config with explicit tag', [], undefined, [], { config: '' }),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('MySettings');
    expect(skill.types).toHaveLength(0);
  });

  it('detects *Options suffix → extracted as configSurface', () => {
    const iface = mockDecl('BuildOptions', ReflectionKind.Interface, {
      comment: mockComment('Build options'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('BuildOptions');
    expect(skill.types).toHaveLength(0);
  });

  it('detects *Config suffix → extracted as configSurface', () => {
    const iface = mockDecl('UserConfig', ReflectionKind.Interface, {
      comment: mockComment('User config'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('UserConfig');
    expect(skill.types).toHaveLength(0);
  });

  it('detects *Configuration suffix → extracted as configSurface', () => {
    const iface = mockDecl('ServerConfiguration', ReflectionKind.Interface, {
      comment: mockComment('Server configuration'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('ServerConfiguration');
  });

  it('detects *Settings suffix → extracted as configSurface', () => {
    const iface = mockDecl('AppSettings', ReflectionKind.Interface, {
      comment: mockComment('App settings'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('AppSettings');
  });

  it('does NOT detect "OptionsParser" (suffix not at PascalCase word boundary)', () => {
    // "OptionsParser" ends with "Parser", not a config suffix
    // But also: "Options" is a suffix only if the char before is lowercase
    // "OptionsParser" → name.endsWith('Options') is false, endsWith('Config') is false
    const iface = mockDecl('OptionsParser', ReflectionKind.Interface, {
      comment: mockComment('Parses options'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toBeUndefined();
    expect(skill.types).toHaveLength(1);
    expect(skill.types[0].name).toBe('OptionsParser');
  });

  it('does NOT detect when suffix is the entire name (e.g. "Options" alone)', () => {
    // name.length > suffix.length check: "Options".length === "Options".length → false
    const iface = mockDecl('Options', ReflectionKind.Interface, {
      comment: mockComment('Just Options'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toBeUndefined();
    expect(skill.types).toHaveLength(1);
  });

  it('does NOT detect an interface with uppercase char before config suffix (not a word boundary)', () => {
    // e.g. "FOOConfig": charBefore 'O' is uppercase, so should NOT match
    const iface = mockDecl('FOOConfig', ReflectionKind.Interface, {
      comment: mockComment('All caps prefix'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toBeUndefined();
    expect(skill.types).toHaveLength(1);
  });

  it('regular interfaces (no @config, no suffix) stay in types array', () => {
    const iface = mockDecl('UserProfile', ReflectionKind.Interface, {
      comment: mockComment('A user profile'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toBeUndefined();
    expect(skill.types).toHaveLength(1);
    expect(skill.types[0].name).toBe('UserProfile');
  });

  it('config interfaces removed from types array (not duplicated)', () => {
    const configIface = mockDecl('BuildOptions', ReflectionKind.Interface, {
      comment: mockComment('Build options'),
      children: []
    });
    const regularIface = mockDecl('UserProfile', ReflectionKind.Interface, {
      comment: mockComment('A user profile'),
      children: []
    });
    const project = mockProject([configIface, regularIface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.types).toHaveLength(1);
    expect(skill.types[0].name).toBe('UserProfile');
    // BuildOptions must not appear in types
    expect(skill.types.find((t) => t.name === 'BuildOptions')).toBeUndefined();
  });

  it('sets sourceType to "config" on extracted configSurface', () => {
    const iface = mockDecl('BuildOptions', ReflectionKind.Interface, {
      comment: mockComment('Build options'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces![0].sourceType).toBe('config');
  });

  it('extracts interface properties as ExtractedConfigOption items', () => {
    const prop = mockDecl('outDir', ReflectionKind.Property, {
      flags: { isOptional: true },
      type: { toString: () => 'string' },
      comment: mockComment('Output directory')
    });
    const iface = mockDecl('BuildOptions', ReflectionKind.Interface, {
      comment: mockComment('Build options'),
      children: [prop]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    const surface = skill.configSurfaces![0];
    expect(surface.options).toHaveLength(1);
    expect(surface.options[0].name).toBe('outDir');
    expect(surface.options[0].type).toBe('string');
    expect(surface.options[0].description).toBe('Output directory');
    expect(surface.options[0].required).toBe(false);
  });

  it('required=true when property is not optional', () => {
    const prop = mockDecl('entry', ReflectionKind.Property, {
      flags: { isOptional: false },
      type: { toString: () => 'string' },
      comment: mockComment('Entry point')
    });
    const iface = mockDecl('BuildOptions', ReflectionKind.Interface, {
      comment: mockComment('Build options'),
      children: [prop]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces![0].options[0].required).toBe(true);
  });

  it('extracts @useWhen from config interface property', () => {
    const prop = mockDecl('watch', ReflectionKind.Property, {
      flags: { isOptional: true },
      type: { toString: () => 'boolean' },
      comment: mockComment('Watch mode', [], undefined, [], {
        useWhen: '- During development\n- Hot reload needed'
      })
    });
    const iface = mockDecl('BuildOptions', ReflectionKind.Interface, {
      comment: mockComment('Build options'),
      children: [prop]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    const opt = skill.configSurfaces![0].options[0];
    expect(opt.useWhen).toEqual(['During development', 'Hot reload needed']);
  });

  it('extracts @never from config interface property', () => {
    const prop = mockDecl('cache', ReflectionKind.Property, {
      flags: { isOptional: true },
      type: { toString: () => 'boolean' },
      comment: mockComment('Enable cache', [], undefined, [], {
        never: '- Can serve stale data\n- Requires manual invalidation'
      })
    });
    const iface = mockDecl('CacheOptions', ReflectionKind.Interface, {
      comment: mockComment('Cache options'),
      children: [prop]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    const opt = skill.configSurfaces![0].options[0];
    expect(opt.never).toEqual(['Can serve stale data', 'Requires manual invalidation']);
  });

  it('extracts @avoidWhen from config interface property', () => {
    const prop = mockDecl('verbose', ReflectionKind.Property, {
      flags: { isOptional: true },
      type: { toString: () => 'boolean' },
      comment: mockComment('Verbose mode', [], undefined, [], {
        avoidWhen: '- Production builds\n- CI pipelines'
      })
    });
    const iface = mockDecl('LogOptions', ReflectionKind.Interface, {
      comment: mockComment('Logging options'),
      children: [prop]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    const opt = skill.configSurfaces![0].options[0];
    expect(opt.avoidWhen).toEqual(['Production builds', 'CI pipelines']);
  });

  it('extracts @useWhen/@never from config interface itself (surface level)', () => {
    const iface = mockDecl('DeployConfig', ReflectionKind.Interface, {
      comment: mockComment('Deployment config', [], undefined, [], {
        useWhen: '- Deploying to production',
        never: '- Missing env vars cause silent failures'
      }),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    const surface = skill.configSurfaces![0];
    expect(surface.useWhen).toEqual(['Deploying to production']);
    expect(surface.never).toEqual(['Missing env vars cause silent failures']);
  });

  it('configSurfaces undefined when no config interfaces present', () => {
    const iface = mockDecl('UserProfile', ReflectionKind.Interface, {
      comment: mockComment('A profile'),
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toBeUndefined();
  });

  it('TypeAlias with config suffix is treated as config surface', () => {
    const alias = mockDecl('BuildOptions', ReflectionKind.TypeAlias, {
      comment: mockComment('Build options'),
      children: [
        mockDecl('watch', ReflectionKind.Property, {
          type: { toString: () => 'boolean' },
          flags: { isOptional: true },
          comment: mockComment('Watch mode')
        })
      ]
    });
    const project = mockProject([alias]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('BuildOptions');
    expect(skill.configSurfaces![0].options).toHaveLength(1);
    expect(skill.types).toHaveLength(0);
  });
});
