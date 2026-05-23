import { detectRefineMode } from '../detect-mode.js';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('detectRefineMode', () => {
  it('returns build when package.json has MCP SDK dependency', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } })
    );
    expect(await detectRefineMode(tmpDir)).toBe('build');
  });

  it('returns runtime when mcp.json found in cwd', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    await writeFile(join(tmpDir, 'mcp.json'), '{}');
    expect(await detectRefineMode(tmpDir)).toBe('runtime');
  });

  it('returns runtime when mcp.json found in ancestor', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    const sub = join(tmpDir, 'project');
    await mkdir(sub, { recursive: true });
    await writeFile(join(tmpDir, 'mcp.json'), '{}');
    expect(await detectRefineMode(sub)).toBe('runtime');
  });

  it('returns ambiguous when both signals present', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } })
    );
    await writeFile(join(tmpDir, 'mcp.json'), '{}');
    expect(await detectRefineMode(tmpDir)).toBe('ambiguous');
  });

  it('returns ambiguous when neither signal present', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    expect(await detectRefineMode(tmpDir)).toBe('ambiguous');
  });

  it('returns build when package.json has a @modelcontextprotocol/server-* package', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { '@modelcontextprotocol/server-node': '^1.0.0' } })
    );
    expect(await detectRefineMode(tmpDir)).toBe('build');
  });

  it('returns runtime when mcpConfigPath is a known runtime config filename', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    // No mcp.json in cwd, no package.json — but --mcp points to a desktop config
    expect(
      await detectRefineMode(tmpDir, '/Users/example/.config/claude/claude_desktop_config.json')
    ).toBe('runtime');
  });

  it('returns ambiguous (not build) when package.json only has @modelcontextprotocol/inspector', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { '@modelcontextprotocol/inspector': '^1.0.0' } })
    );
    // inspector is a consumer-only tool — should not signal build mode
    expect(await detectRefineMode(tmpDir)).toBe('ambiguous');
  });

  it('returns ambiguous when cwd has MCP SDK dep AND mcpConfigPath is a runtime config', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } })
    );
    expect(
      await detectRefineMode(tmpDir, '/Users/example/.config/claude/claude_desktop_config.json')
    ).toBe('ambiguous');
  });
});
