import { describe, it, expect, vi } from 'vitest';
import { resolveMcpMode } from '../mcp-mode.js';

describe('resolveMcpMode', () => {
  it('honors an explicit --mode build', async () => {
    expect(await resolveMcpMode('/x', { mode: 'build', mcp: '/x/mcp.json' })).toEqual({
      mode: 'build'
    });
  });
  it('honors an explicit --mode runtime', async () => {
    expect(await resolveMcpMode('/x', { mode: 'runtime', mcp: '/x/mcp.json' })).toEqual({
      mode: 'runtime'
    });
  });
  it('rejects an invalid --mode', async () => {
    const r = await resolveMcpMode('/x', { mode: 'nope', mcp: '/x/mcp.json' });
    expect(r).toHaveProperty('error');
  });
});

describe('resolveMcpMode (detection)', () => {
  it('falls back to detection when --mode omitted', async () => {
    vi.resetModules();
    vi.doMock('../detect-mode.js', () => ({ detectRefineMode: vi.fn(async () => 'build') }));
    const { resolveMcpMode: r } = await import('../mcp-mode.js');
    expect(await r('/x', { mcp: '/x/mcp.json' })).toEqual({ mode: 'build' });
  });
  it('returns an error on ambiguous detection', async () => {
    vi.resetModules();
    vi.doMock('../detect-mode.js', () => ({ detectRefineMode: vi.fn(async () => 'ambiguous') }));
    const { resolveMcpMode: r } = await import('../mcp-mode.js');
    const out = await r('/x', { mcp: '/x/mcp.json' });
    expect(out).toHaveProperty('error');
  });
});
