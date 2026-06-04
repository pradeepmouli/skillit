import type {
  InvocationAdapter as CoreInvocationAdapter,
  AdapterRenderContext,
  AdapterRenderContextBase,
  AdapterRenderContextBundle,
  AdapterRenderContextHttp,
  AdapterRenderContextStdio,
  AdapterFingerprint
} from '@skillit/core';

/**
 * Narrower target identifier for mcp-package adapters.
 * Core uses `string` (for forward-declaration / cycle avoidance);
 * mcp tightens to this string-literal union so adapter authors get type help.
 */
export type InvocationTarget = 'mcp-protocol' | `cli:${string}`;

/**
 * Re-export the structural contract from core, narrowing `target`.
 * Adapter packages (`@skillit/target-*`) implement this interface.
 */
export interface InvocationAdapter extends Omit<CoreInvocationAdapter, 'target'> {
  readonly target: InvocationTarget;
}

export type {
  AdapterRenderContext,
  AdapterRenderContextBase,
  AdapterRenderContextBundle,
  AdapterRenderContextHttp,
  AdapterRenderContextStdio,
  AdapterFingerprint
};

export type { ParameterPlan } from './classify.js';
