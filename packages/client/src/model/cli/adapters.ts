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
  /** Extract the model's answer text from the CLI's stdout. Throws on error/empty. */
  extractResult(stdout: string): string;
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
    let last: string | undefined;
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue; // skip log/noise lines
      let evt: { type?: string; item?: { type?: string; text?: string } };
      try {
        evt = JSON.parse(trimmed) as typeof evt;
      } catch {
        continue;
      }
      if (evt.type === 'item.completed' && evt.item?.type === 'agent_message' && evt.item.text) {
        last = evt.item.text;
      }
    }
    if (last === undefined) {
      throw new Error(`codex: no agent_message in output: ${stdout.slice(0, 200)}`);
    }
    return last;
  }
};

export const copilotAdapter: CliAdapter = {
  name: 'copilot',
  invocation(_role, prompt) {
    // copilot uses its default model; prompt passed as an argument.
    return { cmd: 'copilot', args: ['-p', prompt, '--output-format', 'json', '--no-color'] };
  },
  extractResult(stdout) {
    // copilot emits JSONL; the answer is the last `assistant.message` event's
    // data.content (skip `assistant.message_delta` streaming events + the final
    // `result` event). Verified live 2026-06-03.
    let last: string | undefined;
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      let evt: { type?: string; data?: { content?: string } };
      try {
        evt = JSON.parse(trimmed) as typeof evt;
      } catch {
        continue;
      }
      if (evt.type === 'assistant.message' && typeof evt.data?.content === 'string') {
        last = evt.data.content;
      }
    }
    if (last === undefined) {
      throw new Error(`copilot: no assistant.message in output: ${stdout.slice(0, 200)}`);
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
