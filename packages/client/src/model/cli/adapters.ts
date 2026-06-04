// packages/client/src/model/cli/adapters.ts
import { DRAFTER, REVIEWER } from '../models.js';

export type CliModelClientKind = 'claude' | 'codex' | 'copilot';
export type ModelRole = 'draft' | 'review';

export interface CliInvocation {
  /** Executable name. */
  cmd: string;
  /** Arguments (no shell). */
  args: string[];
  /** Prompt to pipe to stdin, if this CLI takes the prompt that way. */
  input?: string;
}

export interface CliAdapter {
  readonly name: CliModelClientKind;
  /** How to invoke the CLI for a given role with a given prompt. */
  invocation(role: ModelRole, prompt: string): CliInvocation;
  /**
   * Extract the model's answer text from the CLI's stdout. An empty-string
   * answer is valid and returned as-is; throws only when no answer message is
   * present or the CLI reported an in-band error.
   */
  extractResult(stdout: string): string;
}

/** Minimal shape a JSONL line is narrowed to before an adapter inspects it. */
interface JsonlEvent {
  type?: string;
  item?: { type?: string; text?: string };
  data?: { content?: string };
  exitCode?: number;
}

/**
 * Walk a JSONL stream (one JSON object per line), skip non-`{` log/noise lines
 * and unparseable lines, and return the LAST value `extract` accepts. Returning
 * `''` from `extract` is a valid match (the empty answer wins last) — only
 * `undefined` means "not a match", so the adapter never editorializes empty
 * model output.
 */
function lastJsonlMatch<T>(
  stdout: string,
  extract: (evt: JsonlEvent) => T | undefined
): T | undefined {
  let last: T | undefined;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let evt: JsonlEvent;
    try {
      evt = JSON.parse(trimmed) as JsonlEvent;
    } catch {
      continue;
    }
    const got = extract(evt);
    if (got !== undefined) last = got;
  }
  return last;
}

/** Best-effort scan for a JSONL failure signal, used to enrich no-match errors. */
function jsonlFailureSignal(
  stdout: string,
  detect: (evt: JsonlEvent) => string | undefined
): string | undefined {
  let signal: string | undefined;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let evt: JsonlEvent;
    try {
      evt = JSON.parse(trimmed) as JsonlEvent;
    } catch {
      continue;
    }
    const got = detect(evt);
    if (got !== undefined) signal = got;
  }
  return signal;
}

export const claudeAdapter: CliAdapter = {
  name: 'claude',
  invocation(role, prompt) {
    const model = role === 'review' ? REVIEWER : DRAFTER;
    return {
      cmd: 'claude',
      args: ['-p', '--output-format', 'json', '--model', model],
      input: prompt
    };
  },
  extractResult(stdout) {
    let parsed: { is_error?: boolean; result?: string };
    try {
      parsed = JSON.parse(stdout) as typeof parsed;
    } catch {
      throw new Error(`claude: could not parse JSON output: ${stdout.slice(0, 200)}`);
    }
    if (parsed.is_error) {
      throw new Error(`claude reported an error: ${parsed.result ?? '(no result)'}`);
    }
    if (typeof parsed.result !== 'string') {
      throw new Error(`claude: no result field in output: ${stdout.slice(0, 200)}`);
    }
    return parsed.result;
  }
};

export const codexAdapter: CliAdapter = {
  name: 'codex',
  invocation(_role, prompt) {
    // codex uses its default model (no per-role mapping); prompt on stdin.
    return { cmd: 'codex', args: ['exec', '--json'], input: prompt };
  },
  extractResult(stdout) {
    const last = lastJsonlMatch(stdout, (evt) =>
      evt.type === 'item.completed' &&
      evt.item?.type === 'agent_message' &&
      typeof evt.item.text === 'string'
        ? evt.item.text
        : undefined
    );
    if (last === undefined) {
      const failure = jsonlFailureSignal(stdout, (evt) =>
        evt.type === 'turn.failed' || (evt.type === 'item.completed' && evt.item?.type === 'error')
          ? evt.type === 'turn.failed'
            ? 'turn.failed'
            : 'item.error'
          : undefined
      );
      const detail = failure !== undefined ? ` (failure signal: ${failure})` : '';
      throw new Error(`codex: no agent_message in output${detail}: ${stdout.slice(0, 200)}`);
    }
    return last;
  }
};

export const copilotAdapter: CliAdapter = {
  name: 'copilot',
  invocation(_role, prompt) {
    // copilot uses its default model; prompt piped via stdin (not `-p <text>`)
    // so untrusted prompt content never reaches argv — keeps the Windows
    // shell-launch path injection-safe (only static flags are args).
    return { cmd: 'copilot', args: ['--output-format', 'json', '--no-color'], input: prompt };
  },
  extractResult(stdout) {
    // copilot emits JSONL; the answer is the last `assistant.message` event's
    // data.content (skip `assistant.message_delta` streaming events + the final
    // `result` event). Verified live 2026-06-03.
    const last = lastJsonlMatch(stdout, (evt) =>
      evt.type === 'assistant.message' && typeof evt.data?.content === 'string'
        ? evt.data.content
        : undefined
    );
    if (last === undefined) {
      const failure = jsonlFailureSignal(stdout, (evt) =>
        evt.type === 'result' && typeof evt.exitCode === 'number' && evt.exitCode !== 0
          ? `exitCode ${evt.exitCode}`
          : undefined
      );
      const detail = failure !== undefined ? ` (failure signal: ${failure})` : '';
      throw new Error(`copilot: no assistant.message in output${detail}: ${stdout.slice(0, 200)}`);
    }
    return last;
  }
};

const ADAPTERS: Record<CliModelClientKind, CliAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  copilot: copilotAdapter
};

export function adapterFor(kind: CliModelClientKind): CliAdapter {
  return ADAPTERS[kind];
}
