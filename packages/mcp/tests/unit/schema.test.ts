import type { JSONSchema7 } from 'json-schema';
import { describe, expect, it } from 'vitest';
import { McpError } from '../../src/errors.js';
import { resolveSchema } from '../../src/introspect/schema.js';

describe('resolveSchema', () => {
  it('resolves a simple $ref to a sibling definition', async () => {
    const input: JSONSchema7 = {
      definitions: {
        User: { type: 'string' }
      },
      properties: {
        user: { $ref: '#/definitions/User' }
      }
    };

    const out = await resolveSchema(input);
    expect(out.properties?.user).toEqual({ type: 'string' });
    expect(JSON.stringify(out)).not.toContain('$ref');
  });

  it('resolves chained $refs (ref -> ref -> schema)', async () => {
    const input: JSONSchema7 = {
      definitions: {
        A: { $ref: '#/definitions/B' },
        B: { type: 'number' }
      },
      properties: {
        value: { $ref: '#/definitions/A' }
      }
    };

    const out = await resolveSchema(input);
    expect(out.properties?.value).toEqual({ type: 'number' });
    expect(JSON.stringify(out)).not.toContain('$ref');
  });

  it('resolves $refs nested inside object properties', async () => {
    const input: JSONSchema7 = {
      definitions: {
        Zip: { type: 'string', pattern: '^\\d{5}$' }
      },
      properties: {
        address: {
          type: 'object',
          properties: {
            zip: { $ref: '#/definitions/Zip' }
          }
        }
      }
    };

    const out = await resolveSchema(input);
    const address = out.properties?.address as JSONSchema7;
    expect(address.properties?.zip).toEqual({ type: 'string', pattern: '^\\d{5}$' });
    expect(JSON.stringify(out)).not.toContain('$ref');
  });

  it('returns an equal-but-distinct object when no $ref is present', async () => {
    const input: JSONSchema7 = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' }
      }
    };

    const out = await resolveSchema(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(out.properties).not.toBe(input.properties);
  });

  it('does not mutate the caller-provided schema', async () => {
    const input: JSONSchema7 = {
      definitions: {
        User: { type: 'string' }
      },
      properties: {
        user: { $ref: '#/definitions/User' }
      }
    };
    const snapshot = JSON.stringify(input);

    await resolveSchema(input);

    // Caller's object still has the $ref exactly as before.
    expect(JSON.stringify(input)).toBe(snapshot);
    expect((input.properties!['user'] as { $ref?: string }).$ref).toBe('#/definitions/User');
  });

  it('throws McpError(SCHEMA_REF_CYCLE) on a cyclic $ref', async () => {
    const input: JSONSchema7 = {
      definitions: {
        Node: {
          type: 'object',
          properties: {
            next: { $ref: '#/definitions/Node' }
          }
        }
      },
      properties: {
        root: { $ref: '#/definitions/Node' }
      }
    };

    await expect(resolveSchema(input)).rejects.toMatchObject({
      name: 'McpError',
      code: 'SCHEMA_REF_CYCLE'
    });
    await expect(resolveSchema(input)).rejects.toBeInstanceOf(McpError);
  });

  it('rejects external HTTP/HTTPS $refs with SCHEMA_REF_CYCLE', async () => {
    const input: JSONSchema7 = {
      properties: {
        foo: { $ref: 'https://example.com/schema.json' }
      }
    };

    await expect(resolveSchema(input)).rejects.toMatchObject({
      name: 'McpError',
      code: 'SCHEMA_REF_CYCLE'
    });
  });

  it('rejects external file $refs with SCHEMA_REF_CYCLE', async () => {
    const input: JSONSchema7 = {
      properties: {
        foo: { $ref: 'other-schema.json' }
      }
    };

    await expect(resolveSchema(input)).rejects.toMatchObject({
      name: 'McpError',
      code: 'SCHEMA_REF_CYCLE'
    });
  });

  it('returns an empty object for an empty schema', async () => {
    const input: JSONSchema7 = {};
    const out = await resolveSchema(input);
    expect(out).toEqual({});
    expect(out).not.toBe(input);
  });

  it('rejects a $ref pointing to a nonexistent path', async () => {
    const input: JSONSchema7 = {
      properties: {
        user: { $ref: '#/definitions/DoesNotExist' }
      }
    };

    await expect(resolveSchema(input)).rejects.toMatchObject({
      name: 'McpError',
      code: 'SCHEMA_REF_CYCLE'
    });
  });
});
