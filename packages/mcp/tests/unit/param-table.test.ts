import { describe, expect, it } from 'vitest';
import type { ExtractedFunction } from '@skillit/core';
import type { JSONSchema7 } from 'json-schema';
import { classifyParameters } from '../../src/adapter/classify.js';
import { renderCliParamTable } from '../../src/adapter/param-table.js';
import type { ParameterPlan } from '../../src/adapter/classify.js';

function fakeEncode(plan: ParameterPlan): string {
  const key = plan.path.join('.');
  if (plan.tier === 3) return `--json '<JSON-payload>'`;
  if (plan.type === 'scalar') {
    if (plan.scalarType === 'string') return `${key}=<value>`;
    return `${key}:=<value>`;
  }
  if (plan.type === 'enum') return `${key}=<one-of-...>`;
  if (plan.type === 'string-array') return `${key}:=<json-array>`;
  return `${key}=<value>`;
}

describe('renderCliParamTable', () => {
  it('renders mixed-tier params with header columns and data rows', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        status: { type: 'string', enum: ['active', 'inactive'] },
        config: {
          type: 'object',
          properties: {
            db: {
              type: 'object',
              properties: { host: { type: 'string' } }
            }
          }
        }
      },
      required: ['name']
    };
    const plan = classifyParameters(schema);
    const tool: ExtractedFunction = {
      name: 'doStuff',
      description: '',
      signature: 'doStuff()',
      parameters: [
        { name: 'name', type: 'string', description: 'the name', optional: false },
        { name: 'age', type: 'number', description: 'the age', optional: true },
        { name: 'status', type: 'string', description: 'a status', optional: true },
        { name: 'config', type: 'object', description: 'nested', optional: true }
      ],
      returnType: 'void',
      examples: [],
      tags: {}
    };

    const out = renderCliParamTable(tool, plan, fakeEncode);

    expect(out).toContain('| MCP Name | CLI Flag/Key | Type | Required | Description |');
    expect(out).toContain('| -------- | ------------ | ---- | -------- | ----------- |');
    expect(out).toContain('| name | name=<value> | string | yes | the name |');
    expect(out).toContain('| age | age:=<value> | number | no | the age |');
    expect(out).toContain(
      '| status | status=<one-of-...> | enum(active\\|inactive) | no | a status |'
    );
    expect(out).toContain(`| config | --json '<JSON-payload>' | json | no | nested |`);
  });

  it('returns a no-parameters marker when the tool has no parameters', () => {
    const schema: JSONSchema7 = { type: 'object', properties: {} };
    const plan = classifyParameters(schema);
    const tool: ExtractedFunction = {
      name: 'ping',
      description: '',
      signature: 'ping()',
      parameters: [],
      returnType: 'void',
      examples: [],
      tags: {}
    };
    const out = renderCliParamTable(tool, plan, fakeEncode);
    expect(out).toBe('_No parameters._');
  });

  it('Tier 2 nested object expands into one row per dotted leaf', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' }
          }
        }
      }
    };
    const plan = classifyParameters(schema);
    const tool: ExtractedFunction = {
      name: 'createUser',
      description: '',
      signature: 'createUser()',
      parameters: [{ name: 'user', type: 'object', description: 'user data', optional: true }],
      returnType: 'void',
      examples: [],
      tags: {}
    };

    const out = renderCliParamTable(tool, plan, fakeEncode);
    expect(out).toContain('| user.name | user.name=<value> | string | no |');
    expect(out).toContain('| user.age | user.age:=<value> | number | no |');
  });
});
