// packages/client/src/__tests__/cli-run.test.ts
import { describe, it, expect } from 'vitest';
import { runCli } from '../model/cli/run.js';

describe('runCli', () => {
  it('returns stdout for a successful command', async () => {
    const out = await runCli({ cmd: 'node', args: ['-e', 'process.stdout.write("hello")'] });
    expect(out).toBe('hello');
  });

  it('writes input to stdin when provided', async () => {
    const out = await runCli({
      cmd: 'node',
      args: ['-e', 'process.stdin.pipe(process.stdout)'],
      input: 'piped-in'
    });
    expect(out).toBe('piped-in');
  });

  it('throws with the command and a stderr tail on non-zero exit', async () => {
    await expect(
      runCli({ cmd: 'node', args: ['-e', 'process.stderr.write("boom"); process.exit(3)'] })
    ).rejects.toThrow(/node.*code 3.*boom/s);
  });

  it('does not leak args (e.g. a prompt passed as an argument) in the error', async () => {
    let message = '';
    try {
      await runCli({ cmd: 'node', args: ['-e', 'process.exit(2)', 'SENSITIVE_PROMPT_TEXT'] });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/code 2/);
    expect(message).not.toContain('SENSITIVE_PROMPT_TEXT');
  });

  it('rejects (does not crash on EPIPE) when the child exits before reading a large stdin prompt', async () => {
    // 256 KB overflows the OS pipe buffer; the child exits without reading it,
    // so the stdin write would EPIPE. Must reject with the exit code, not throw
    // an unhandled stream error.
    const bigPrompt = 'x'.repeat(256 * 1024);
    await expect(
      runCli({ cmd: 'node', args: ['-e', 'process.exit(1)'], input: bigPrompt })
    ).rejects.toThrow(/code 1/);
  });

  it('throws a timeout error when the command exceeds timeoutMs', async () => {
    await expect(
      runCli({ cmd: 'node', args: ['-e', 'setTimeout(()=>{}, 10000)'], timeoutMs: 100 })
    ).rejects.toThrow(/timed out after 100ms/);
  });
});
