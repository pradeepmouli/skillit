// packages/client/src/model/cli/run.ts
import { spawn } from 'node:child_process';

export interface RunCliOptions {
  /** Executable name (resolved on PATH) — never a shell string. */
  cmd: string;
  /** Arguments as an array — no shell, so no injection/escaping concerns. */
  args: string[];
  /** Optional text written to the child's stdin, then closed. */
  input?: string;
  /** Per-call timeout in milliseconds (default 120000). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Spawn `cmd` with `args` (no shell), optionally pipe `input` to stdin, and
 * resolve the captured stdout. Throws on non-zero exit (message includes the
 * command, exit code, and a stderr tail) or on timeout.
 */
export function runCli(opts: RunCliOptions): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise<string>((resolve, reject) => {
    // On Windows, npm-installed CLIs are `.cmd`/`.bat` shims that Node cannot
    // exec directly — they must go through the shell. On POSIX we keep the
    // no-shell path (no injection/escaping concerns). Note: under the Windows
    // shell, args are not auto-escaped, so an adapter that passes the prompt as
    // an argument (copilot) may mis-parse a prompt containing shell
    // metacharacters; claude/codex pipe the prompt via stdin and are unaffected.
    const child = spawn(opts.cmd, opts.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${opts.cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${opts.cmd} failed to start: ${err.message}`));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        const tail = stderr.trim().slice(-500);
        // Intentionally omit args from the message: an adapter may pass the
        // prompt as an argument (copilot), and the prompt can be large/sensitive.
        reject(new Error(`${opts.cmd} exited with code ${code}: ${tail}`));
      }
    });

    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
    }
    child.stdin.end();
  });
}
