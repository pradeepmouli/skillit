import { detectInstalledSources, detectRefineSource } from '../detect-source.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

async function writePkg(deps: Record<string, unknown>): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'detect-source-'));
  await writeFile(join(tmpDir, 'package.json'), JSON.stringify(deps));
  return tmpDir;
}

describe('detectRefineSource', () => {
  it('returns cli when only @to-skills/cli is installed', async () => {
    const dir = await writePkg({ dependencies: { '@to-skills/cli': 'workspace:*' } });
    expect(await detectRefineSource(dir)).toBe('cli');
  });

  it('returns mcp when only @to-skills/mcp is installed', async () => {
    const dir = await writePkg({ dependencies: { '@to-skills/mcp': 'workspace:*' } });
    expect(await detectRefineSource(dir)).toBe('mcp');
  });

  it('returns typedoc when typedoc-plugin-to-skills is installed', async () => {
    const dir = await writePkg({ devDependencies: { 'typedoc-plugin-to-skills': '^1.0.0' } });
    expect(await detectRefineSource(dir)).toBe('typedoc');
  });

  it('returns typedoc when @to-skills/typedoc is installed', async () => {
    const dir = await writePkg({ devDependencies: { '@to-skills/typedoc': 'workspace:*' } });
    expect(await detectRefineSource(dir)).toBe('typedoc');
  });

  it('returns ambiguous when cli and mcp are both installed', async () => {
    const dir = await writePkg({
      dependencies: { '@to-skills/cli': 'workspace:*', '@to-skills/mcp': 'workspace:*' }
    });
    expect(await detectRefineSource(dir)).toBe('ambiguous');
  });

  it('returns none when no to-skills source package is installed', async () => {
    const dir = await writePkg({ dependencies: { commander: '^14.0.0' } });
    expect(await detectRefineSource(dir)).toBe('none');
  });

  it('returns none when package.json is missing or unreadable', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-source-'));
    expect(await detectRefineSource(tmpDir)).toBe('none');
  });
});

describe('detectInstalledSources', () => {
  it('returns the deduped candidate list in stable order', async () => {
    const dir = await writePkg({
      dependencies: { '@to-skills/mcp': 'workspace:*', '@to-skills/cli': 'workspace:*' }
    });
    expect(await detectInstalledSources(dir)).toEqual(['cli', 'mcp']);
  });

  it('returns an empty list when no source package is installed', async () => {
    const dir = await writePkg({ dependencies: { commander: '^14.0.0' } });
    expect(await detectInstalledSources(dir)).toEqual([]);
  });

  it('returns an empty list when package.json is missing or unreadable', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-source-'));
    expect(await detectInstalledSources(tmpDir)).toEqual([]);
  });
});
