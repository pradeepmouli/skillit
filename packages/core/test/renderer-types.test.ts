import { describe, it, expect } from 'vitest';
import { renderSkill } from '@skillit/core';
import type { ExtractedSkill } from '@skillit/core';

const minimalSkill: ExtractedSkill = {
  name: 'my-lib',
  description: 'A test library',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

describe('renderTypesRef — interface property rendering', () => {
  it('renders interface properties with name, type, and description', () => {
    const skill: ExtractedSkill = {
      ...minimalSkill,
      types: [
        {
          name: 'UserConfig',
          description: 'Configuration for a user',
          definition: '',
          properties: [
            { name: 'id', type: 'number', description: 'The user ID', optional: false },
            { name: 'name', type: 'string', description: 'Display name', optional: false }
          ]
        }
      ]
    };

    const { references } = renderSkill(skill);
    const types = references.find((r) => r.filename.endsWith('types.md'));
    expect(types).toBeDefined();
    expect(types!.content).toContain('**Properties:**');
    expect(types!.content).toContain('`id: number`');
    expect(types!.content).toContain('The user ID');
    expect(types!.content).toContain('`name: string`');
    expect(types!.content).toContain('Display name');
  });

  it('marks optional properties with (optional)', () => {
    const skill: ExtractedSkill = {
      ...minimalSkill,
      types: [
        {
          name: 'Options',
          description: '',
          definition: '',
          properties: [
            { name: 'timeout', type: 'number', description: 'Request timeout', optional: true },
            { name: 'retries', type: 'number', description: 'Retry count', optional: false }
          ]
        }
      ]
    };

    const { references } = renderSkill(skill);
    const types = references.find((r) => r.filename.endsWith('types.md'));
    expect(types!.content).toContain('`timeout: number` (optional)');
    expect(types!.content).not.toMatch(/`retries: number` \(optional\)/);
  });

  it('renders type alias definition as code block when no properties', () => {
    const skill: ExtractedSkill = {
      ...minimalSkill,
      types: [
        {
          name: 'ID',
          description: 'A unique identifier',
          definition: 'string | number'
        }
      ]
    };

    const { references } = renderSkill(skill);
    const types = references.find((r) => r.filename.endsWith('types.md'));
    expect(types!.content).toContain('```ts');
    expect(types!.content).toContain('string | number');
    expect(types!.content).not.toContain('**Properties:**');
  });

  it('renders both properties and definition when both present', () => {
    const skill: ExtractedSkill = {
      ...minimalSkill,
      types: [
        {
          name: 'Hybrid',
          description: '',
          definition: '{ x: number }',
          properties: [{ name: 'x', type: 'number', description: 'X coord', optional: false }]
        }
      ]
    };

    const { references } = renderSkill(skill);
    const types = references.find((r) => r.filename.endsWith('types.md'));
    expect(types!.content).toContain('**Properties:**');
    expect(types!.content).toContain('`x: number`');
    expect(types!.content).toContain('```ts');
    expect(types!.content).toContain('{ x: number }');
  });

  it('renders interface description above properties', () => {
    const skill: ExtractedSkill = {
      ...minimalSkill,
      types: [
        {
          name: 'Point',
          description: 'A 2D point',
          definition: '',
          properties: [{ name: 'x', type: 'number', description: '', optional: false }]
        }
      ]
    };

    const { references } = renderSkill(skill);
    const types = references.find((r) => r.filename.endsWith('types.md'));
    const content = types!.content;
    const descPos = content.indexOf('A 2D point');
    const propsPos = content.indexOf('**Properties:**');
    expect(descPos).toBeGreaterThanOrEqual(0);
    expect(propsPos).toBeGreaterThan(descPos);
  });

  it('does not render Properties section when properties is empty array', () => {
    const skill: ExtractedSkill = {
      ...minimalSkill,
      types: [
        {
          name: 'Empty',
          description: '',
          definition: 'never',
          properties: []
        }
      ]
    };

    const { references } = renderSkill(skill);
    const types = references.find((r) => r.filename.endsWith('types.md'));
    expect(types!.content).not.toContain('**Properties:**');
  });
});
