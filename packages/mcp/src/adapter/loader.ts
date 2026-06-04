import { createRequire } from 'node:module';
import type { InvocationTarget, InvocationAdapter } from './types.js';
import { McpError } from '../errors.js';

const require = createRequire(import.meta.url);
const cache = new Map<InvocationTarget, InvocationAdapter>();

/**
 * Node's CJS `require()` fails on ESM-only packages with
 * `ERR_REQUIRE_ESM` / `ERR_PACKAGE_PATH_NOT_EXPORTED`. We detect these so
 * `loadAdapterAsync` can retry via dynamic `import()`.
 */
function isEsmOnlyPackageError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const errObj = err as { code?: string; message?: string };
  if (errObj.code === 'ERR_REQUIRE_ESM') return true;
  if (errObj.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return true;
  // Fallback: the package's exports map only defines `import`, so `require`
  // reports "No 'exports' main defined" / "No matching export".
  return (
    typeof errObj.message === 'string' &&
    (/No "exports" main defined/.test(errObj.message) || /No matching export/.test(errObj.message))
  );
}

/**
 * Resolve an invocation target to its adapter package.
 *
 * Resolution algorithm (per research.md §5):
 * - `mcp-protocol` → `@skillit/target-mcp-protocol`
 * - `cli:<name>` → tries `@skillit/target-<name>` first, then `skillit-target-<name>`
 *
 * The module's default export MUST be an `InvocationAdapter`. Results are cached
 * per-process — calling twice with the same target returns the same adapter instance.
 *
 * @throws McpError with code `UNKNOWN_TARGET` if the target string doesn't match the expected form.
 * @throws McpError with code `ADAPTER_NOT_FOUND` if no candidate package resolves.
 */
export function loadAdapter(target: InvocationTarget): InvocationAdapter {
  const cached = cache.get(target);
  if (cached) return cached;

  const candidates = resolveCandidates(target);

  for (const pkg of candidates) {
    try {
      const mod = require(pkg) as { default?: InvocationAdapter };
      const adapter = mod.default;
      if (!adapter) {
        throw new McpError(`Adapter package '${pkg}' has no default export`, 'ADAPTER_NOT_FOUND');
      }
      cache.set(target, adapter);
      return adapter;
    } catch (err: unknown) {
      // require() throws MODULE_NOT_FOUND when resolution fails; try next candidate.
      if (isModuleNotFoundError(err, pkg)) continue;
      // Re-throw our own McpError (from the no-default-export branch above).
      if (err instanceof McpError) throw err;
      // Other errors (syntax errors in the adapter, etc.) — surface with context.
      throw new McpError(
        `Failed to load adapter package '${pkg}': ${(err as Error).message ?? String(err)}`,
        'ADAPTER_NOT_FOUND',
        err
      );
    }
  }

  throw new McpError(
    `No adapter for target '${target}'. Looked for: ${candidates.join(', ')}.`,
    'ADAPTER_NOT_FOUND'
  );
}

function resolveCandidates(target: InvocationTarget): string[] {
  if (target === 'mcp-protocol') return ['@skillit/target-mcp-protocol'];
  if (target.startsWith('cli:')) {
    const name = target.slice('cli:'.length);
    if (!name) {
      throw new McpError(
        `Invalid target '${target}' — cli: prefix without a name`,
        'UNKNOWN_TARGET'
      );
    }
    return [`@skillit/target-${name}`, `skillit-target-${name}`];
  }
  throw new McpError(`Unknown target form: '${target}'`, 'UNKNOWN_TARGET');
}

function isModuleNotFoundError(err: unknown, pkg: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const errObj = err as { code?: string; message?: string };
  if (errObj.code === 'MODULE_NOT_FOUND' || errObj.code === 'ERR_MODULE_NOT_FOUND') return true;
  // Also match the pattern in the error message (some bundlers produce different codes)
  return (
    typeof errObj.message === 'string' && errObj.message.includes(`Cannot find module '${pkg}'`)
  );
}

/**
 * Async variant of {@link loadAdapter} that supports ESM-only adapter
 * packages. Tries `require()` first (so the existing synchronous test
 * monkey-patching continues to work); falls back to dynamic `import()` when
 * the require attempt hits an ESM-only exports map.
 *
 * Results are cached alongside the sync loader — a cache hit short-circuits
 * both variants.
 *
 * @throws McpError with code `UNKNOWN_TARGET` if the target string doesn't match the expected form.
 * @throws McpError with code `ADAPTER_NOT_FOUND` if no candidate package resolves.
 *
 * @public
 */
export async function loadAdapterAsync(target: InvocationTarget): Promise<InvocationAdapter> {
  const cached = cache.get(target);
  if (cached) return cached;

  const candidates = resolveCandidates(target);

  for (const pkg of candidates) {
    // Try synchronous require first (matches loadAdapter behavior + unit tests).
    try {
      const mod = require(pkg) as { default?: InvocationAdapter };
      const adapter = mod.default;
      if (!adapter) {
        throw new McpError(`Adapter package '${pkg}' has no default export`, 'ADAPTER_NOT_FOUND');
      }
      cache.set(target, adapter);
      return adapter;
    } catch (err: unknown) {
      if (isModuleNotFoundError(err, pkg)) continue;
      if (err instanceof McpError) throw err;
      if (!isEsmOnlyPackageError(err)) {
        throw new McpError(
          `Failed to load adapter package '${pkg}': ${(err as Error).message ?? String(err)}`,
          'ADAPTER_NOT_FOUND',
          err
        );
      }
      // ESM-only package: retry via dynamic import().
      try {
        const mod = (await import(pkg)) as { default?: InvocationAdapter };
        const adapter = mod.default;
        if (!adapter) {
          throw new McpError(`Adapter package '${pkg}' has no default export`, 'ADAPTER_NOT_FOUND');
        }
        cache.set(target, adapter);
        return adapter;
      } catch (importErr: unknown) {
        if (isModuleNotFoundError(importErr, pkg)) continue;
        if (importErr instanceof McpError) throw importErr;
        throw new McpError(
          `Failed to load adapter package '${pkg}': ${(importErr as Error).message ?? String(importErr)}`,
          'ADAPTER_NOT_FOUND',
          importErr
        );
      }
    }
  }

  throw new McpError(
    `No adapter for target '${target}'. Looked for: ${candidates.join(', ')}.`,
    'ADAPTER_NOT_FOUND'
  );
}

/**
 * Clear the adapter cache. Exposed for testing.
 * @internal
 */
export function __clearAdapterCache(): void {
  cache.clear();
}
