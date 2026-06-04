// packages/client/src/model/model-client-factory.ts
import { execFileSync } from 'node:child_process';
import type { ModelClient } from '@skillit/core';
import { AnthropicModelClient } from './anthropic.js';
import { CliModelClient } from './cli/cli-client.js';
import { adapterFor, type CliModelClientKind } from './cli/adapters.js';

export type ModelClientKind = 'api' | CliModelClientKind;

const CLI_KINDS: readonly CliModelClientKind[] = ['claude', 'codex', 'copilot'];
const ALL_KINDS = ['api', ...CLI_KINDS] as const;

export interface CreateModelClientOptions {
  /** Per-call timeout for CLI invocations. */
  timeoutMs?: number;
  /** Injectable PATH check (defaults to a real `command -v` probe). */
  hasBinary?: (cmd: string) => boolean;
}

function defaultHasBinary(cmd: string): boolean {
  try {
    if (process.platform === 'win32') {
      // `where` has no `-v` flag; `where <cmd>` exits non-zero when not found.
      execFileSync('where', [cmd], { stdio: 'ignore' });
    } else {
      // POSIX: `command -v <cmd>` is a shell builtin, so run it through a shell.
      execFileSync('command', ['-v', cmd], { stdio: 'ignore', shell: true });
    }
    return true;
  } catch {
    return false;
  }
}

function isCliKind(kind: string): kind is CliModelClientKind {
  return (CLI_KINDS as readonly string[]).includes(kind);
}

/**
 * Build the {@link ModelClient} for the requested backend. `'api'` → the
 * Anthropic API client; a CLI kind → a {@link CliModelClient} after a PATH
 * pre-flight. Throws an actionable error for an unknown kind or a missing CLI.
 */
export function createModelClient(
  kind: string,
  options: CreateModelClientOptions = {}
): ModelClient {
  if (kind === 'api') return new AnthropicModelClient();
  if (!isCliKind(kind)) {
    throw new Error(`invalid --model-client '${kind}'. Use one of: ${ALL_KINDS.join('|')}.`);
  }
  const hasBinary = options.hasBinary ?? defaultHasBinary;
  if (!hasBinary(kind)) {
    throw new Error(
      `${kind} CLI not found on PATH — install it, or use --model-client api (requires ANTHROPIC_API_KEY).`
    );
  }
  return new CliModelClient(
    adapterFor(kind),
    options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}
  );
}
