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
    ).rejects.toThrow(/node.*exit code 3.*boom/s);
  });

  it('throws a timeout error when the command exceeds timeoutMs', async () => {
    await expect(
      runCli({ cmd: 'node', args: ['-e', 'setTimeout(()=>{}, 10000)'], timeoutMs: 100 })
    ).rejects.toThrow(/timed out after 100ms/);
  });
});
