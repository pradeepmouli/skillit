import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSkill, renderSkills, writeSkills } from '@skillit/core';
import type { ExtractedSkill, RenderedSkill } from '@skillit/core';

const minimalSkill: ExtractedSkill = {
  name: 'writer-lib',
  description: 'Skill used for writer tests',
  functions: [
    {
      name: 'greet',
      description: 'Greets a user',
      signature: 'greet(name: string): string',
      parameters: [{ name: 'name', type: 'string', description: 'Who to greet', optional: false }],
      returnType: 'string',
      examples: [],
      tags: {}
    }
  ],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

function makeRenderedSkill(overrides: Partial<ExtractedSkill> = {}): RenderedSkill {
  return renderSkill({ ...minimalSkill, ...overrides });
}

function writeCuratedSkill(dir: string, name: string, content = '# curated\n'): void {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Curated skill\ncurated: true\n---\n\n${content}`,
    'utf8'
  );
}

function writeLegacyCuratedSkill(dir: string, name: string): void {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `# ${name}\n\n<!-- curated -->\n`, 'utf8');
}

function writeBundledSkill(
  dir: string,
  name: string,
  version?: string,
  frontmatterName = name,
  options: {
    lineEnding?: '\n' | '\r\n';
    managed?: boolean;
  } = {}
): void {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  const lineEnding = options.lineEnding ?? '\n';
  const versionLine = version ? `version: ${version}\n` : '';
  const managedBlock = options.managed === false ? '' : `skillit:\n  managed: bundled-guidance\n`;
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${frontmatterName}`,
      'description: Bundled guidance',
      managedBlock.trimEnd(),
      versionLine.trimEnd(),
      '---',
      '',
      `# ${frontmatterName}`,
      ''
    ]
      .filter((line) => line.length > 0)
      .join(lineEnding),
    'utf8'
  );
}

describe('writeSkills', () => {
  const dirs: string[] = [];

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes rendered skills to outDir and install targets', () => {
    const outDir = tempDir('skillit-out-');
    const installA = tempDir('skillit-install-a-');
    const installB = tempDir('skillit-install-b-');
    const rendered = makeRenderedSkill();

    writeSkills([rendered], { outDir, installTargets: [installA, installB] });

    for (const root of [outDir, installA, installB]) {
      expect(existsSync(join(root, 'writer-lib', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(root, 'writer-lib', 'references', 'functions.md'))).toBe(true);
    }
  });

  it('deduplicates install targets and ignores targets that resolve to outDir', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    const rendered = makeRenderedSkill();

    writeSkills([rendered], {
      outDir,
      installTargets: [installDir, `${installDir}/..//${installDir.split('/').pop()}`, outDir]
    });

    expect(existsSync(join(outDir, 'writer-lib', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(installDir, 'writer-lib', 'SKILL.md'))).toBe(true);
  });

  it('preserves curated skills in both outDir and install targets', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    writeCuratedSkill(outDir, 'writer-lib', '# keep-outdir\n');
    writeCuratedSkill(installDir, 'writer-lib', '# keep-install\n');

    writeSkills([makeRenderedSkill()], { outDir, installTargets: [installDir] });

    expect(readFileSync(join(outDir, 'writer-lib', 'SKILL.md'), 'utf8')).toContain('# keep-outdir');
    expect(readFileSync(join(installDir, 'writer-lib', 'SKILL.md'), 'utf8')).toContain(
      '# keep-install'
    );
  });

  it('preserves legacy curated skills marked by HTML comment', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    writeLegacyCuratedSkill(outDir, 'writer-lib');
    writeLegacyCuratedSkill(installDir, 'writer-lib');

    writeSkills([makeRenderedSkill()], { outDir, installTargets: [installDir] });

    expect(readFileSync(join(outDir, 'writer-lib', 'SKILL.md'), 'utf8')).toContain(
      '<!-- curated -->'
    );
    expect(readFileSync(join(installDir, 'writer-lib', 'SKILL.md'), 'utf8')).toContain(
      '<!-- curated -->'
    );
  });

  it('replaces stale install target content for non-curated skills', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    const staleDir = join(installDir, 'writer-lib', 'references');
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(join(installDir, 'writer-lib', 'SKILL.md'), 'stale', 'utf8');
    writeFileSync(join(staleDir, 'stale.md'), 'stale', 'utf8');

    writeSkills([makeRenderedSkill()], { outDir, installTargets: [installDir] });

    expect(existsSync(join(installDir, 'writer-lib', 'references', 'stale.md'))).toBe(false);
    expect(readFileSync(join(installDir, 'writer-lib', 'SKILL.md'), 'utf8')).toContain(
      'name: writer-lib'
    );
  });

  it('upgrades bundled skills when the installed version is older', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    writeBundledSkill(installDir, 'skillit-docs', '1.3.0');

    const bundled = renderSkill(
      {
        ...minimalSkill,
        name: 'skillit-docs',
        description: 'Bundled guidance skill',
        functions: [],
        examples: []
      },
      {
        additionalFrontmatter: { version: '1.4.0' }
      }
    );

    const results = writeSkills([bundled], { outDir, installTargets: [installDir] });

    expect(readFileSync(join(installDir, 'skillit-docs', 'SKILL.md'), 'utf8')).toContain(
      'version: 1.4.0'
    );
    expect(results.find((result) => result.root === installDir)?.action).toBe('written');
  });

  it('preserves custom bundled skills when version metadata is absent', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    writeBundledSkill(installDir, 'skillit-docs', undefined, 'skillit-docs', {
      managed: false
    });

    const bundled = renderSkill(
      {
        ...minimalSkill,
        name: 'skillit-docs',
        description: 'Bundled guidance skill',
        functions: [],
        examples: []
      },
      {
        additionalFrontmatter: { version: '1.4.0' }
      }
    );

    const results = writeSkills([bundled], { outDir, installTargets: [installDir] });

    expect(readFileSync(join(installDir, 'skillit-docs', 'SKILL.md'), 'utf8')).not.toContain(
      'version: 1.4.0'
    );
    expect(results.find((result) => result.root === installDir)?.preserveReason).toBe(
      'bundled-custom-skill'
    );
  });

  it('preserves bundled skills when the installed frontmatter name differs', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    writeBundledSkill(installDir, 'skillit-docs', '9.9.9', 'custom-docs');

    const bundled = renderSkill(
      {
        ...minimalSkill,
        name: 'skillit-docs',
        description: 'Bundled guidance skill',
        functions: [],
        examples: []
      },
      {
        additionalFrontmatter: { version: '1.4.0' }
      }
    );

    const results = writeSkills([bundled], { outDir, installTargets: [installDir] });

    expect(readFileSync(join(installDir, 'skillit-docs', 'SKILL.md'), 'utf8')).toContain(
      'name: custom-docs'
    );
    expect(results.find((result) => result.root === installDir)?.preserveReason).toBe(
      'bundled-name-mismatch'
    );
  });

  it('preserves same-version bundled guidance explicitly', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    writeBundledSkill(installDir, 'skillit-docs', '1.4.0');

    const bundled = renderSkill(
      {
        ...minimalSkill,
        name: 'skillit-docs',
        description: 'Bundled guidance skill',
        functions: [],
        examples: []
      },
      {
        additionalFrontmatter: {
          version: '1.4.0',
          skillit: { managed: 'bundled-guidance' }
        }
      }
    );

    const results = writeSkills([bundled], { outDir, installTargets: [installDir] });

    expect(results.find((result) => result.root === installDir)).toMatchObject({
      action: 'preserved',
      preserveReason: 'bundled-same-version'
    });
  });

  it('preserves newer bundled guidance instead of downgrading it', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    writeBundledSkill(installDir, 'skillit-docs', '1.5.0');

    const bundled = renderSkill(
      {
        ...minimalSkill,
        name: 'skillit-docs',
        description: 'Bundled guidance skill',
        functions: [],
        examples: []
      },
      {
        additionalFrontmatter: {
          version: '1.4.0',
          skillit: { managed: 'bundled-guidance' }
        }
      }
    );

    const results = writeSkills([bundled], { outDir, installTargets: [installDir] });

    expect(results.find((result) => result.root === installDir)).toMatchObject({
      action: 'preserved',
      preserveReason: 'bundled-newer-version'
    });
  });

  it('recognizes the pre-rebrand toSkills: marker key on already-installed skills', () => {
    // Simulates a skill installed by an older skillit version, before the
    // toSkills: -> skillit: marker rename. Name deliberately does NOT start
    // with "skillit-" so this only passes via the explicit legacy-key path,
    // not the name-prefix fallback heuristic.
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    const skillDir = join(installDir, 'vendor-docs');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: vendor-docs',
        'description: Bundled guidance',
        'toSkills:',
        '  managed: bundled-guidance',
        'version: 1.4.0',
        '---',
        '',
        '# vendor-docs',
        ''
      ].join('\n'),
      'utf8'
    );

    const bundled = renderSkill(
      {
        ...minimalSkill,
        name: 'vendor-docs',
        description: 'Bundled guidance skill',
        functions: [],
        examples: []
      },
      {
        additionalFrontmatter: {
          version: '1.4.0',
          skillit: { managed: 'bundled-guidance' }
        }
      }
    );

    const results = writeSkills([bundled], { outDir, installTargets: [installDir] });

    expect(results.find((result) => result.root === installDir)).toMatchObject({
      action: 'preserved',
      preserveReason: 'bundled-same-version'
    });
  });

  it('treats stable releases as newer than prereleases', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    writeBundledSkill(installDir, 'skillit-docs', '1.4.0-alpha.1');

    const bundled = renderSkill(
      {
        ...minimalSkill,
        name: 'skillit-docs',
        description: 'Bundled guidance skill',
        functions: [],
        examples: []
      },
      {
        additionalFrontmatter: {
          version: '1.4.0',
          skillit: { managed: 'bundled-guidance' }
        }
      }
    );

    writeSkills([bundled], { outDir, installTargets: [installDir] });

    expect(readFileSync(join(installDir, 'skillit-docs', 'SKILL.md'), 'utf8')).toContain(
      'version: 1.4.0'
    );
  });

  it('parses CRLF frontmatter when deciding bundled guidance upgrades', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    writeBundledSkill(installDir, 'skillit-docs', '1.3.0', 'skillit-docs', {
      lineEnding: '\r\n'
    });

    const bundled = renderSkill(
      {
        ...minimalSkill,
        name: 'skillit-docs',
        description: 'Bundled guidance skill',
        functions: [],
        examples: []
      },
      {
        additionalFrontmatter: {
          version: '1.4.0',
          skillit: { managed: 'bundled-guidance' }
        }
      }
    );

    writeSkills([bundled], { outDir, installTargets: [installDir] });

    expect(readFileSync(join(installDir, 'skillit-docs', 'SKILL.md'), 'utf8')).toContain(
      'version: 1.4.0'
    );
  });

  it('overwrites malformed installed frontmatter when the skill is replaceable', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    const skillDir = join(installDir, 'writer-lib');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: writer-lib\ndescription: [broken\n---\n\nold content\n',
      'utf8'
    );

    expect(() =>
      writeSkills([makeRenderedSkill()], { outDir, installTargets: [installDir] })
    ).not.toThrow();
    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf8')).toContain('name: writer-lib');
  });

  it('preserves malformed installed frontmatter when a curated marker is still present', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    const skillDir = join(installDir, 'writer-lib');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: writer-lib\ndescription: [broken\n---\n\n<!-- curated -->\n# keep-me\n',
      'utf8'
    );

    writeSkills([makeRenderedSkill()], { outDir, installTargets: [installDir] });

    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf8')).toContain('# keep-me');
  });

  it('preserves malformed bundled guidance when lenient metadata shows the installed version is newer', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    const skillDir = join(installDir, 'skillit-docs');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: skillit-docs',
        'description: [broken',
        'skillit:',
        '  managed: bundled-guidance',
        '',
        'version: 9.9.9',
        '---',
        '',
        '# keep-installed',
        ''
      ].join('\n'),
      'utf8'
    );

    const bundled = renderSkill(
      {
        ...minimalSkill,
        name: 'skillit-docs',
        description: 'Bundled guidance skill',
        functions: [],
        examples: []
      },
      {
        additionalFrontmatter: {
          version: '1.4.0',
          skillit: { managed: 'bundled-guidance' }
        }
      }
    );

    const results = writeSkills([bundled], { outDir, installTargets: [installDir] });

    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf8')).toContain('# keep-installed');
    expect(results.find((result) => result.root === installDir)).toMatchObject({
      action: 'preserved',
      preserveReason: 'bundled-newer-version'
    });
  });

  it('uses last-wins semantics when multiple rendered skills resolve to the same directory', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    const first = makeRenderedSkill({ description: 'First description' });
    const second = makeRenderedSkill({ description: 'Second description' });

    writeSkills([first, second], { outDir, installTargets: [installDir] });

    for (const root of [outDir, installDir]) {
      expect(readFileSync(join(root, 'writer-lib', 'SKILL.md'), 'utf8')).toContain(
        'description: Second description'
      );
    }
  });

  it('preserves a curated router while refreshing per-package skills', () => {
    const outDir = tempDir('skillit-out-');
    const installDir = tempDir('skillit-install-');
    const rendered = renderSkills([
      { ...minimalSkill, name: '@scope/pkg-a', description: 'Package A', functions: [] },
      { ...minimalSkill, name: '@scope/pkg-b', description: 'Package B', functions: [] }
    ]);

    writeCuratedSkill(outDir, 'scope', '# keep-router-outdir\n');
    writeCuratedSkill(installDir, 'scope', '# keep-router-install\n');

    writeSkills(rendered, { outDir, installTargets: [installDir] });

    expect(readFileSync(join(outDir, 'scope', 'SKILL.md'), 'utf8')).toContain(
      '# keep-router-outdir'
    );
    expect(readFileSync(join(installDir, 'scope', 'SKILL.md'), 'utf8')).toContain(
      '# keep-router-install'
    );
    expect(existsSync(join(outDir, 'scope-pkg-a', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(outDir, 'scope-pkg-b', 'SKILL.md'))).toBe(true);
  });
});
