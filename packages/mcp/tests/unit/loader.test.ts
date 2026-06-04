import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { InvocationAdapter, InvocationTarget } from '../../src/adapter/types.js';
import { __clearAdapterCache, loadAdapter } from '../../src/adapter/loader.js';
import { McpError } from '../../src/errors.js';

/**
 * The loader uses `createRequire(import.meta.url)` → Node's CommonJS `require`.
 * `vi.mock` only hooks ESM `import` resolution, not `require`. So to inject
 * mock adapter packages we monkey-patch `Module.prototype.require` once, then
 * per-test set entries in an `overrides` map.
 */
type ModuleProto = {
  require: (this: unknown, id: string) => unknown;
};

const overrides = new Map<string, unknown>();
let installed = false;
let originalRequire: ((this: unknown, id: string) => unknown) | undefined;
let nodeModuleRef: { prototype: ModuleProto } | undefined;

async function installRequireInterceptor(): Promise<void> {
  if (installed) return;
  const nodeModule = (await import('node:module')).default as unknown as {
    prototype: ModuleProto;
  };
  nodeModuleRef = nodeModule;
  originalRequire = nodeModule.prototype.require;
  const original = originalRequire;
  nodeModule.prototype.require = function patched(this: unknown, id: string): unknown {
    if (overrides.has(id)) {
      const v = overrides.get(id);
      if (typeof v === 'function') {
        return (v as (id: string) => unknown)(id);
      }
      return v;
    }
    return original.call(this, id);
  };
  installed = true;
}

function makeMockAdapter(target: InvocationTarget, adapterPackageName: string): InvocationAdapter {
  return {
    target,
    fingerprint: { adapter: adapterPackageName, version: '0.1.0' },
    render: async () => ({
      skill: { filename: 'SKILL.md', content: '' },
      references: []
    })
  };
}

describe('loadAdapter', () => {
  beforeAll(async () => {
    await installRequireInterceptor();
  });

  afterAll(() => {
    if (installed && originalRequire && nodeModuleRef) {
      nodeModuleRef.prototype.require = originalRequire;
      installed = false;
    }
    overrides.clear();
  });

  beforeEach(() => {
    __clearAdapterCache();
    overrides.clear();
    overrides.set('@skillit/target-mcp-protocol', {
      default: makeMockAdapter('mcp-protocol', '@skillit/target-mcp-protocol')
    });
    overrides.set('@skillit/target-mcpc', {
      default: makeMockAdapter('cli:mcpc', '@skillit/target-mcpc')
    });
  });

  it('resolves mcp-protocol to @skillit/target-mcp-protocol default export', () => {
    const adapter = loadAdapter('mcp-protocol');
    expect(adapter.target).toBe('mcp-protocol');
    expect(adapter.fingerprint.adapter).toBe('@skillit/target-mcp-protocol');
    expect(typeof adapter.render).toBe('function');
  });

  it('resolves cli:mcpc to scoped @skillit/target-mcpc first', () => {
    const adapter = loadAdapter('cli:mcpc');
    expect(adapter.target).toBe('cli:mcpc');
    expect(adapter.fingerprint.adapter).toBe('@skillit/target-mcpc');
  });

  it('throws ADAPTER_NOT_FOUND when neither scoped nor unscoped package resolves', () => {
    try {
      loadAdapter('cli:nonexistent-xyz-never');
      throw new Error('expected loadAdapter to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      const mcpErr = err as McpError;
      expect(mcpErr.code).toBe('ADAPTER_NOT_FOUND');
      expect(mcpErr.message).toContain('@skillit/target-nonexistent-xyz-never');
      expect(mcpErr.message).toContain('skillit-target-nonexistent-xyz-never');
    }
  });

  it('throws UNKNOWN_TARGET for a garbage target string', () => {
    try {
      loadAdapter('garbage' as unknown as InvocationTarget);
      throw new Error('expected loadAdapter to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe('UNKNOWN_TARGET');
    }
  });

  it('throws UNKNOWN_TARGET for cli: with empty name', () => {
    try {
      loadAdapter('cli:' as InvocationTarget);
      throw new Error('expected loadAdapter to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe('UNKNOWN_TARGET');
    }
  });

  it('caches resolved adapter per-process — two calls return the same instance', () => {
    const a = loadAdapter('mcp-protocol');
    const b = loadAdapter('mcp-protocol');
    expect(a).toBe(b);
  });

  it('catches ERR_MODULE_NOT_FOUND code and surfaces ADAPTER_NOT_FOUND with both candidates', () => {
    const thrower = (): never => {
      throw Object.assign(new Error('err'), { code: 'ERR_MODULE_NOT_FOUND' });
    };
    overrides.set('@skillit/target-ghost-pkg', thrower);
    overrides.set('skillit-target-ghost-pkg', thrower);
    try {
      loadAdapter('cli:ghost-pkg');
      throw new Error('expected loadAdapter to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      const mcpErr = err as McpError;
      expect(mcpErr.code).toBe('ADAPTER_NOT_FOUND');
      expect(mcpErr.message).toContain('@skillit/target-ghost-pkg');
      expect(mcpErr.message).toContain('skillit-target-ghost-pkg');
    }
  });

  it('falls back to message-substring match when error lacks a MODULE_NOT_FOUND code', () => {
    const scoped = '@skillit/target-weirdbundler';
    const unscoped = 'skillit-target-weirdbundler';
    overrides.set(scoped, () => {
      throw new Error(`Cannot find module '${scoped}'`);
    });
    overrides.set(unscoped, () => {
      throw new Error(`Cannot find module '${unscoped}'`);
    });
    try {
      loadAdapter('cli:weirdbundler');
      throw new Error('expected loadAdapter to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      const mcpErr = err as McpError;
      expect(mcpErr.code).toBe('ADAPTER_NOT_FOUND');
      expect(mcpErr.message).toContain(scoped);
      expect(mcpErr.message).toContain(unscoped);
    }
  });

  it('rejects packages whose default export is undefined', () => {
    overrides.set('@skillit/target-nodefault', { default: undefined });
    try {
      loadAdapter('cli:nodefault');
      throw new Error('expected loadAdapter to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      const mcpErr = err as McpError;
      expect(mcpErr.code).toBe('ADAPTER_NOT_FOUND');
      expect(mcpErr.message).toContain('no default export');
    }
  });

  it('wraps non-resolution errors with cause and original message', () => {
    const syntaxErr = new SyntaxError('unexpected token');
    overrides.set('@skillit/target-syntaxerr', () => {
      throw syntaxErr;
    });
    try {
      loadAdapter('cli:syntaxerr');
      throw new Error('expected loadAdapter to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      const mcpErr = err as McpError;
      expect(mcpErr.code).toBe('ADAPTER_NOT_FOUND');
      expect(mcpErr.message).toContain('unexpected token');
      expect(mcpErr.cause).toBe(syntaxErr);
    }
  });
});
