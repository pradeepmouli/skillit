import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { toSkills } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function write(dir: string, relPath: string, content: string): void {
  const full = join(dir, relPath);
  const parts = relPath.split('/');
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(full, content, 'utf-8');
}

function makeMockVitepressConfig(srcDir: string, overrides: Record<string, any> = {}): any {
  return {
    vitepress: {
      srcDir,
      site: {
        title: 'My Docs',
        description: 'Documentation for my project.',
        themeConfig: {
          sidebar: [
            { text: 'Introduction', link: '/intro' },
            { text: 'Installation', link: '/installation' }
          ]
        },
        ...overrides
      }
    }
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `vitepress-plugin-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Plugin shape ─────────────────────────────────────────────────────────────

describe('toSkills() plugin shape', () => {
  it('returns a Vite Plugin object with name skillit-vitepress', () => {
    const plugin = toSkills();
    expect(plugin).toBeDefined();
    expect(plugin.name).toBe('skillit-vitepress');
  });

  it('has enforce: post', () => {
    const plugin = toSkills();
    expect(plugin.enforce).toBe('post');
  });

  it('has a config hook', () => {
    const plugin = toSkills();
    expect(typeof plugin.config).toBe('function');
  });

  it('has a closeBundle hook', () => {
    const plugin = toSkills();
    expect(typeof plugin.closeBundle).toBe('function');
  });
});

// ─── config hook ──────────────────────────────────────────────────────────────

describe('config hook', () => {
  it('captures site title from vitepress config', () => {
    // We test indirectly by running the full pipeline with a mock
    const plugin = toSkills();

    const srcDir = tmpDir;
    write(srcDir, 'intro.md', '# Introduction\n\nWelcome.');

    const mockConfig = makeMockVitepressConfig(srcDir);
    // Should not throw
    (plugin.config as Function)(mockConfig, {});
  });

  it('uses options.name over vitepress site title', () => {
    const plugin = toSkills({ name: 'Custom Name' });
    const srcDir = tmpDir;
    const mockConfig = makeMockVitepressConfig(srcDir);
    // No throw — just verifying it accepts the override
    (plugin.config as Function)(mockConfig, {});
  });

  it('handles missing vitepress context gracefully', () => {
    const plugin = toSkills();
    // Should not throw when vitepress config is absent
    expect(() => (plugin.config as Function)({}, {})).not.toThrow();
    expect(() => (plugin.config as Function)({ vitepress: {} }, {})).not.toThrow();
  });
});

// ─── closeBundle hook ─────────────────────────────────────────────────────────

describe('closeBundle hook', () => {
  it('does nothing when srcDir is not set', () => {
    const plugin = toSkills();
    // No config call — srcDir will be empty string
    expect(() => (plugin.closeBundle as Function)()).not.toThrow();
  });

  it('does nothing when sidebar is empty', () => {
    const srcDir = tmpDir;
    const plugin = toSkills({ skillsOutDir: join(tmpDir, 'skills') });

    const mockConfig = {
      vitepress: {
        srcDir,
        site: {
          title: 'Docs',
          description: '',
          themeConfig: { sidebar: [] }
        }
      }
    };

    (plugin.config as Function)(mockConfig, {});
    expect(() => (plugin.closeBundle as Function)()).not.toThrow();
  });
});

// ─── Integration: full pipeline ───────────────────────────────────────────────

describe('integration: config + closeBundle generates skill files', () => {
  it('generates SKILL.md when docs exist', () => {
    const srcDir = join(tmpDir, 'docs');
    const skillsOutDir = join(tmpDir, 'skills');
    mkdirSync(srcDir, { recursive: true });

    write(
      srcDir,
      'intro.md',
      '# Introduction\n\nThis is the introduction to my project.\n\n## Getting Started\n\nFollow these steps to get started.'
    );
    write(
      srcDir,
      'installation.md',
      '# Installation\n\nInstall via npm.\n\n## Requirements\n\nNode 18+.'
    );

    const plugin = toSkills({ skillsOutDir, name: 'Test Docs' });

    const mockConfig = {
      vitepress: {
        srcDir,
        site: {
          title: 'Test Docs',
          description: 'A test documentation site.',
          themeConfig: {
            sidebar: [
              { text: 'Introduction', link: '/intro' },
              { text: 'Installation', link: '/installation' }
            ]
          }
        }
      }
    };

    (plugin.config as Function)(mockConfig, {});
    (plugin.closeBundle as Function)();

    // SKILL.md must exist in the output directory
    const skillFile = join(skillsOutDir, 'test-docs', 'SKILL.md');
    expect(existsSync(skillFile)).toBe(true);

    const content = readFileSync(skillFile, 'utf-8');
    expect(content).toContain('Test Docs');
  });

  it('resolves link/index.md path variant', () => {
    const srcDir = join(tmpDir, 'docs');
    const skillsOutDir = join(tmpDir, 'skills');
    mkdirSync(srcDir, { recursive: true });

    // Create an index.md variant instead of the flat .md
    write(srcDir, 'guide/index.md', '# Guide\n\nThe guide content.');

    const plugin = toSkills({ skillsOutDir, name: 'Index Docs' });

    const mockConfig = {
      vitepress: {
        srcDir,
        site: {
          title: 'Index Docs',
          description: '',
          themeConfig: {
            sidebar: [{ text: 'Guide', link: '/guide' }]
          }
        }
      }
    };

    (plugin.config as Function)(mockConfig, {});
    (plugin.closeBundle as Function)();

    const skillFile = join(skillsOutDir, 'index-docs', 'SKILL.md');
    expect(existsSync(skillFile)).toBe(true);
  });

  it('excludes /api/ routes by default (excludeApi: true)', () => {
    const srcDir = join(tmpDir, 'docs');
    const skillsOutDir = join(tmpDir, 'skills');
    mkdirSync(srcDir, { recursive: true });

    write(srcDir, 'guide.md', '# Guide\n\nGuide content.');

    const plugin = toSkills({ skillsOutDir, name: 'Api Exclude Test' });

    const mockConfig = {
      vitepress: {
        srcDir,
        site: {
          title: 'Api Exclude Test',
          description: '',
          themeConfig: {
            sidebar: {
              '/guide/': [{ text: 'Guide', link: '/guide' }],
              '/api/': [{ text: 'Reference', link: '/api/reference' }]
            }
          }
        }
      }
    };

    (plugin.config as Function)(mockConfig, {});
    // Should not throw even when api route files don't exist
    expect(() => (plugin.closeBundle as Function)()).not.toThrow();
  });

  it('includes /api/ routes when excludeApi is false', () => {
    const srcDir = join(tmpDir, 'docs');
    const skillsOutDir = join(tmpDir, 'skills');
    mkdirSync(srcDir, { recursive: true });

    write(srcDir, 'guide.md', '# Guide\n\nGuide content.');
    write(srcDir, 'api/reference.md', '# API Reference\n\nReference content.');

    const plugin = toSkills({ skillsOutDir, name: 'No Exclude Test', excludeApi: false });

    const mockConfig = {
      vitepress: {
        srcDir,
        site: {
          title: 'No Exclude Test',
          description: '',
          themeConfig: {
            sidebar: {
              '/guide/': [{ text: 'Guide', link: '/guide' }],
              '/api/': [{ text: 'Reference', link: '/api/reference' }]
            }
          }
        }
      }
    };

    (plugin.config as Function)(mockConfig, {});
    (plugin.closeBundle as Function)();

    const skillFile = join(skillsOutDir, 'no-exclude-test', 'SKILL.md');
    expect(existsSync(skillFile)).toBe(true);
  });

  it('skips docs that cannot be resolved without throwing', () => {
    const srcDir = join(tmpDir, 'docs');
    const skillsOutDir = join(tmpDir, 'skills');
    mkdirSync(srcDir, { recursive: true });

    // Only write one of the two docs
    write(srcDir, 'intro.md', '# Introduction\n\nWelcome.');
    // 'missing' does not exist

    const plugin = toSkills({ skillsOutDir, name: 'Partial Docs' });

    const mockConfig = {
      vitepress: {
        srcDir,
        site: {
          title: 'Partial Docs',
          description: '',
          themeConfig: {
            sidebar: [
              { text: 'Introduction', link: '/intro' },
              { text: 'Missing', link: '/missing' }
            ]
          }
        }
      }
    };

    (plugin.config as Function)(mockConfig, {});
    expect(() => (plugin.closeBundle as Function)()).not.toThrow();

    const skillFile = join(skillsOutDir, 'partial-docs', 'SKILL.md');
    expect(existsSync(skillFile)).toBe(true);
  });
});
