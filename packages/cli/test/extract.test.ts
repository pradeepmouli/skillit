import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Command } from 'commander';
import { extractCliSkill, writeCliSkill } from '../src/extract.js';

describe('extractCliSkill', () => {
  it('extracts from commander program', async () => {
    const program = new Command().name('my-tool');
    program
      .command('build')
      .description('Build the project')
      .option('--watch', 'Watch mode', false);

    const skill = await extractCliSkill({
      program,
      metadata: { name: 'my-tool', keywords: ['build'] }
    });

    expect(skill.name).toBe('my-tool');
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('build');
  });

  it('merges config surfaces when provided', async () => {
    const program = new Command().name('tool');
    program.command('build').option('--watch', 'Watch', false);

    const skill = await extractCliSkill({
      program,
      metadata: { name: 'tool' },
      configSurfaces: [
        {
          name: 'BuildOptions',
          description: '',
          sourceType: 'config',
          options: [
            {
              name: 'watch',
              type: 'boolean',
              description: '',
              required: false,
              pitfalls: ['NEVER use in CI']
            }
          ]
        }
      ]
    });

    expect(skill.configSurfaces![0].options[0].pitfalls).toContain('NEVER use in CI');
  });

  it('extracts from help text when no program', async () => {
    const skill = await extractCliSkill({
      helpTexts: {
        build: `Usage: tool build [options]\n\nBuild project\n\nOptions:\n  --watch   Watch mode (default: false)\n  -h, --help  help\n`
      },
      metadata: { name: 'tool' }
    });

    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('build');
  });

  it('includes non-CLI config surfaces from configSurfaces', async () => {
    const program = new Command().name('tool');
    program.command('run').description('Run');

    const skill = await extractCliSkill({
      program,
      metadata: { name: 'tool' },
      configSurfaces: [
        {
          name: 'ToolConfig',
          description: 'Config file',
          sourceType: 'config',
          options: [{ name: 'verbose', type: 'boolean', description: 'Verbose', required: false }]
        }
      ]
    });

    // Should have both CLI and config surfaces
    const cli = skill.configSurfaces!.filter((s) => s.sourceType === 'cli');
    const cfg = skill.configSurfaces!.filter((s) => s.sourceType === 'config');
    expect(cli.length).toBeGreaterThanOrEqual(1);
    expect(cfg.length).toBeGreaterThanOrEqual(1);
  });

  it('returns skill with empty API arrays', async () => {
    const skill = await extractCliSkill({ metadata: { name: 'empty' } });
    expect(skill.functions).toHaveLength(0);
    expect(skill.classes).toHaveLength(0);
    expect(skill.types).toHaveLength(0);
  });

  it('returns empty configSurfaces when no program or helpTexts', async () => {
    const skill = await extractCliSkill({ metadata: { name: 'empty' } });
    expect(skill.configSurfaces).toBeUndefined();
  });

  it('attaches CLI audit findings to the extracted skill', async () => {
    const program = new Command().name('tool');
    program.command('build');

    const skill = await extractCliSkill({
      program,
      metadata: { name: 'tool' }
    });

    expect(skill.audit).toEqual({
      status: 'completed',
      issues: skill.auditIssues
    });
    expect(skill.auditIssues).toBeDefined();
    expect(skill.auditIssues!.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['C1', 'C8'])
    );
  });

  it('populates metadata fields', async () => {
    const skill = await extractCliSkill({
      metadata: {
        name: 'my-tool',
        description: 'A great tool',
        keywords: ['foo', 'bar'],
        repository: 'https://github.com/foo/bar',
        author: 'Alice'
      }
    });

    expect(skill.name).toBe('my-tool');
    expect(skill.description).toBe('A great tool');
    expect(skill.keywords).toEqual(['foo', 'bar']);
    expect(skill.repository).toBe('https://github.com/foo/bar');
    expect(skill.author).toBe('Alice');
  });

  it('matches config surface by exact command name (case-insensitive)', async () => {
    const program = new Command().name('tool');
    program.command('generate').option('--out <dir>', 'Output directory');

    const skill = await extractCliSkill({
      program,
      metadata: { name: 'tool' },
      configSurfaces: [
        {
          name: 'generate',
          description: 'Generation config',
          sourceType: 'config',
          options: [
            {
              name: 'out',
              type: 'string',
              description: '',
              required: false,
              remarks: 'Defaults to ./dist'
            }
          ]
        }
      ]
    });

    const surface = skill.configSurfaces!.find((s) => s.name === 'generate');
    expect(surface).toBeDefined();
    // The non-CLI config surface with same name should still be included
    // (it's a config type, not cli, so it passes through as-is)
    const cfgSurface = skill.configSurfaces!.filter((s) => s.sourceType === 'config');
    expect(cfgSurface.length).toBeGreaterThanOrEqual(1);
  });

  it('publishes the bundled CLI guidance directory', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      files?: string[];
    };

    expect(pkg.files).toContain('skills');
  });

  it('writeCliSkill installs bundled guidance alongside the extracted skill', () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'skillit-cli-out-'));
    const installDir = mkdtempSync(path.join(os.tmpdir(), 'skillit-cli-install-'));

    try {
      writeCliSkill(
        {
          name: 'demo-cli',
          description: 'Demo CLI',
          functions: [],
          classes: [],
          types: [],
          enums: [],
          variables: [],
          examples: []
        },
        {
          outDir,
          installTargets: [installDir]
        }
      );

      expect(existsSync(path.join(outDir, 'demo-cli', 'SKILL.md'))).toBe(true);
      expect(existsSync(path.join(outDir, 'skillit-cli-docs', 'SKILL.md'))).toBe(false);
      expect(existsSync(path.join(installDir, 'demo-cli', 'SKILL.md'))).toBe(true);
      expect(existsSync(path.join(installDir, 'skillit-cli-docs', 'SKILL.md'))).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  describe('JSDoc correlation via sourceGlob', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('emits a warning to stderr when CLI surfaces are present but no JSDoc correlation source is provided', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const program = new Command().name('tool');
        program.command('build').option('--watch', 'Watch mode');

        await extractCliSkill({ program, metadata: { name: 'tool' } });

        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('[skillit] extractCliSkill: no JSDoc correlation source provided')
        );
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('does not emit a warning when configSurfaces is explicitly provided (even if empty)', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const program = new Command().name('tool');
        program.command('build').option('--watch', 'Watch mode');

        await extractCliSkill({ program, metadata: { name: 'tool' }, configSurfaces: [] });

        expect(stderrSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('[skillit] extractCliSkill: no JSDoc correlation source provided')
        );
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('does not emit a warning when sourceGlob is provided', async () => {
      tmpDir = mkdtempSync(path.join(os.tmpdir(), 'skillit-srcglob-'));
      writeFileSync(
        path.join(tmpDir, 'build.ts'),
        '/** @useWhen You want to build */\ninterface BuildOptions {}\n'
      );

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const program = new Command().name('tool');
        program.command('build').option('--watch', 'Watch mode');

        await extractCliSkill({
          program,
          metadata: { name: 'tool' },
          sourceGlob: path.join(tmpDir, '*.ts')
        });

        expect(stderrSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('[skillit] extractCliSkill: no JSDoc correlation source provided')
        );
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('does not emit a warning when no CLI surfaces are extracted (no program or helpTexts)', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        await extractCliSkill({ metadata: { name: 'empty' } });

        expect(stderrSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('[skillit] extractCliSkill: no JSDoc correlation source provided')
        );
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('auto-correlates @useWhen from interface via sourceGlob', async () => {
      tmpDir = mkdtempSync(path.join(os.tmpdir(), 'skillit-srcglob-'));
      writeFileSync(
        path.join(tmpDir, 'options.ts'),
        [
          '/**',
          ' * @useWhen You want to watch file changes',
          ' * @avoidWhen Running in CI',
          ' */',
          'interface BuildOptions {',
          '  watch?: boolean;',
          '}'
        ].join('\n')
      );

      const program = new Command().name('tool');
      program.command('build').option('--watch', 'Watch mode');

      const skill = await extractCliSkill({
        program,
        metadata: { name: 'tool' },
        sourceGlob: path.join(tmpDir, '*.ts')
      });

      const buildSurface = skill.configSurfaces?.find((s) => s.name === 'build');
      expect(buildSurface).toBeDefined();
      expect(buildSurface!.useWhen).toContain('You want to watch file changes');
      expect(buildSurface!.avoidWhen).toContain('Running in CI');
    });

    it('auto-correlates @never (pitfalls) from interface via sourceGlob', async () => {
      tmpDir = mkdtempSync(path.join(os.tmpdir(), 'skillit-srcglob-'));
      writeFileSync(
        path.join(tmpDir, 'options.ts'),
        [
          '/**',
          ' * @never NEVER use watch mode in production',
          ' */',
          'interface BuildOptions {',
          '  watch?: boolean;',
          '}'
        ].join('\n')
      );

      const program = new Command().name('tool');
      program.command('build').option('--watch', 'Watch mode');

      const skill = await extractCliSkill({
        program,
        metadata: { name: 'tool' },
        sourceGlob: path.join(tmpDir, '*.ts')
      });

      const buildSurface = skill.configSurfaces?.find((s) => s.name === 'build');
      expect(buildSurface).toBeDefined();
      expect(buildSurface!.pitfalls).toContain('NEVER use watch mode in production');
    });

    it('sourceGlob is ignored when configSurfaces is explicitly provided', async () => {
      tmpDir = mkdtempSync(path.join(os.tmpdir(), 'skillit-srcglob-'));
      writeFileSync(
        path.join(tmpDir, 'options.ts'),
        '/** @useWhen From sourceGlob */\ninterface BuildOptions {}\n'
      );

      const program = new Command().name('tool');
      program.command('build').option('--watch', 'Watch mode');

      const skill = await extractCliSkill({
        program,
        metadata: { name: 'tool' },
        sourceGlob: path.join(tmpDir, '*.ts'),
        configSurfaces: [
          {
            name: 'build',
            description: '',
            sourceType: 'cli',
            options: [],
            useWhen: ['From configSurfaces']
          }
        ]
      });

      const buildSurface = skill.configSurfaces?.find((s) => s.name === 'build');
      expect(buildSurface).toBeDefined();
      expect(buildSurface!.useWhen).toContain('From configSurfaces');
      expect(buildSurface!.useWhen).not.toContain('From sourceGlob');
    });

    it('matches <Command>Opts interface name convention via sourceGlob', async () => {
      tmpDir = mkdtempSync(path.join(os.tmpdir(), 'skillit-srcglob-'));
      writeFileSync(
        path.join(tmpDir, 'options.ts'),
        '/** @useWhen You need to deploy */\ninterface DeployOpts {}\n'
      );

      const program = new Command().name('tool');
      program.command('deploy').option('--env <env>', 'Target environment');

      const skill = await extractCliSkill({
        program,
        metadata: { name: 'tool' },
        sourceGlob: path.join(tmpDir, '*.ts')
      });

      const deploySurface = skill.configSurfaces?.find((s) => s.name === 'deploy');
      expect(deploySurface).toBeDefined();
      expect(deploySurface!.useWhen).toContain('You need to deploy');
    });
  });
});
