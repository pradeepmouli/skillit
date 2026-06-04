import { describe, expect, it } from 'vitest';
import type { JSONSchema7 } from 'json-schema';
import { classifyParameters } from '@skillit/mcp';
import { encodeFastMcpArgs } from '../src/args.js';

function classify(schema: JSONSchema7) {
  return classifyParameters(schema);
}

describe('encodeFastMcpArgs', () => {
  it('Tier 1 string scalar — emits key=<value>', () => {
    const plan = classify({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    });
    const out = encodeFastMcpArgs(plan);
    expect(out.tier12).toEqual(['name=<value>']);
    expect(out.tier3Fallback).toBeNull();
  });

  it('Tier 1 number scalar — emits key=<value> (no := typed form)', () => {
    const plan = classify({
      type: 'object',
      properties: { count: { type: 'number' } }
    });
    const out = encodeFastMcpArgs(plan);
    expect(out.tier12).toEqual(['count=<value>']);
    expect(out.tier3Fallback).toBeNull();
  });

  it('Tier 1 integer scalar — emits key=<value>', () => {
    const plan = classify({
      type: 'object',
      properties: { age: { type: 'integer' } }
    });
    const out = encodeFastMcpArgs(plan);
    expect(out.tier12).toEqual(['age=<value>']);
  });

  it('Tier 1 boolean scalar — emits key=<true|false>', () => {
    const plan = classify({
      type: 'object',
      properties: { enabled: { type: 'boolean' } }
    });
    const out = encodeFastMcpArgs(plan);
    expect(out.tier12).toEqual(['enabled=<true|false>']);
  });

  it('Tier 1 enum — emits key=<one-of-...>', () => {
    const plan = classify({
      type: 'object',
      properties: { status: { type: 'string', enum: ['active', 'inactive'] } }
    });
    const out = encodeFastMcpArgs(plan);
    expect(out.tier12).toEqual(['status=<one-of-active|inactive>']);
  });

  it('Tier 1 string-array — emits key=<comma-separated>', () => {
    const plan = classify({
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } }
    });
    const out = encodeFastMcpArgs(plan);
    expect(out.tier12).toEqual(['tags=<comma-separated>']);
  });

  it('Tier 2 nested — flattens with dot path, all key=<value>', () => {
    const plan = classify({
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
    });
    const out = encodeFastMcpArgs(plan);
    expect(out.tier12).toEqual(['user.name=<value>', 'user.age=<value>']);
    expect(out.tier3Fallback).toBeNull();
  });

  it('Tier 3 fallback — produces --input-json placeholder, no per-flag emission', () => {
    const plan = classify({
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            db: {
              type: 'object',
              properties: { host: { type: 'string' } }
            }
          }
        }
      }
    });
    const out = encodeFastMcpArgs(plan);
    expect(out.tier12).toEqual([]);
    expect(out.tier3Fallback).toBe(`--input-json '<JSON-payload>'`);
  });

  it('mixed tiers — Tier 1 + Tier 3 coexist, T1 in tier12 and T3 fallback set', () => {
    const plan = classify({
      type: 'object',
      properties: {
        name: { type: 'string' },
        config: {
          type: 'object',
          properties: {
            db: {
              type: 'object',
              properties: { host: { type: 'string' } }
            }
          }
        }
      }
    });
    const out = encodeFastMcpArgs(plan);
    expect(out.tier12).toEqual(['name=<value>']);
    expect(out.tier3Fallback).toBe(`--input-json '<JSON-payload>'`);
  });

  it('required vs optional — does not affect encoding (required is documented separately)', () => {
    const planA = classify({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    });
    const planB = classify({
      type: 'object',
      properties: { name: { type: 'string' } }
    });
    expect(encodeFastMcpArgs(planA).tier12).toEqual(encodeFastMcpArgs(planB).tier12);
  });
});
