import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findNearestPackageDir, readPackageMetadata, stripScope } from '../package-metadata.js';

let tmpDir: string;
afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('stripScope', () => {
  it('strips @scope/ prefix', () => {
    expect(stripScope('@scope/my-tool')).toBe('my-tool');
    expect(stripScope('@org/pkg')).toBe('pkg');
  });

  it('leaves unscoped names unchanged', () => {
    expect(stripScope('my-tool')).toBe('my-tool');
    expect(stripScope('pkg')).toBe('pkg');
  });
});

describe('findNearestPackageDir', () => {
  it('returns startDir when package.json is there', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pkg-meta-'));
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
    const found = await findNearestPackageDir(tmpDir);
    expect(found).toBe(tmpDir);
  });

  it('finds package.json in a parent dir', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pkg-meta-'));
    const subDir = join(tmpDir, 'src', 'deep');
    await mkdir(subDir, { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'root' }));
    const found = await findNearestPackageDir(subDir);
    expect(found).toBe(tmpDir);
  });

  it('returns undefined when no package.json found', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pkg-meta-'));
    // No package.json written — should not walk up past the real fs root
    // Use a subdir so walk-up stays within the temp dir
    const subDir = join(tmpDir, 'inner');
    await mkdir(subDir);
    const found = await findNearestPackageDir(subDir, 0);
    expect(found).toBeUndefined();
  });
});

describe('readPackageMetadata', () => {
  it('reads description, keywords, repository (string), and readme', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pkg-meta-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: '@scope/my-pkg',
        description: 'A useful package description for testing.',
        keywords: ['one', 'two', 'three'],
        repository: 'https://github.com/example/repo'
      })
    );
    await writeFile(
      join(tmpDir, 'README.md'),
      '# my-pkg\n\n> A blockquote line here.\n\nSome first paragraph.\n'
    );
    const meta = await readPackageMetadata(tmpDir);
    expect(meta.packageName).toBe('my-pkg');
    expect(meta.packageDescription).toBe('A useful package description for testing.');
    expect(meta.keywords).toEqual(['one', 'two', 'three']);
    expect(meta.repository).toBe('https://github.com/example/repo');
    expect(meta.readme?.blockquote).toBe('A blockquote line here.');
  });

  it('reads repository from object form', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pkg-meta-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'my-pkg',
        repository: { url: 'git+https://github.com/example/repo.git' }
      })
    );
    const meta = await readPackageMetadata(tmpDir);
    expect(meta.repository).toBe('git+https://github.com/example/repo.git');
  });

  it('returns empty metadata for a bare dir', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pkg-meta-'));
    const meta = await readPackageMetadata(tmpDir);
    expect(meta.packageName).toBeUndefined();
    expect(meta.packageDescription).toBeUndefined();
    expect(meta.keywords).toBeUndefined();
    expect(meta.repository).toBeUndefined();
    expect(meta.readme).toBeUndefined();
  });
});
