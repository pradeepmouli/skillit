import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectServerEntry, createMcpRefineSource } from '../factory.js';

let dir: string;

async function writeMcpJson(servers: Record<string, unknown>): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'mcp-factory-'));
  const p = join(dir, 'mcp.json');
  await writeFile(p, JSON.stringify({ mcpServers: servers }), 'utf8');
  return p;
}

describe('selectServerEntry', () => {
  it('returns the named entry', () => {
    const entries = [
      { name: 'a', transport: { type: 'stdio', command: 'node', args: ['a.js'] } },
      { name: 'b', transport: { type: 'stdio', command: 'node', args: ['b.js'] } }
    ] as any;
    expect(selectServerEntry(entries, 'b').name).toBe('b');
  });
  it('falls back to the first non-disabled entry', () => {
    const entries = [
      { name: 'a', disabled: true, transport: {} },
      { name: 'b', transport: {} }
    ] as any;
    expect(selectServerEntry(entries).name).toBe('b');
  });
  it('throws when the named entry is absent', () => {
    expect(() => selectServerEntry([{ name: 'a', transport: {} }] as any, 'zzz')).toThrow(/zzz/);
  });
});

describe('createMcpRefineSource', () => {
  it('build mode → a source that resolves target locations to source files', async () => {
    const mcpPath = await writeMcpJson({ srv: { command: 'node', args: ['server.js'] } });
    const source = await createMcpRefineSource({
      mcpPath,
      mode: 'build',
      cwd: dir,
      sourceGlob: join(dir, '**', '*.ts')
    });
    expect(typeof source.extract).toBe('function');
    expect(typeof source.resolveTargetLocation).toBe('function');
    await rm(dir, { recursive: true, force: true });
  });
  it('runtime mode → a source with an overlay writeback', async () => {
    const mcpPath = await writeMcpJson({ srv: { command: 'node', args: ['server.js'] } });
    const source = await createMcpRefineSource({
      mcpPath,
      mode: 'runtime',
      cwd: dir,
      overlayPath: join(dir, '.skillit-overlay.json')
    });
    expect(typeof source.extract).toBe('function');
    expect(typeof source.applyFixes).toBe('function');
    await rm(dir, { recursive: true, force: true });
  });
});
