import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The bundled skill lives alongside the package root (packages/client/skills),
// two levels up from this test file's dir (src/__tests__).
const clientRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillDir = join(clientRoot, 'skills', 'skillit-bootstrap');

describe('bundled skillit-bootstrap skill', () => {
  it('ships a SKILL.md with valid frontmatter', () => {
    const skillPath = join(skillDir, 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const md = readFileSync(skillPath, 'utf8');
    const fm = md.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).not.toBeNull();
    const front = fm![1]!;
    expect(front).toMatch(/^name:\s*skillit-bootstrap\s*$/m);
    expect(front).toMatch(/^description:\s*\S.+$/m);
  });

  it('ships the surface-routing reference', () => {
    expect(existsSync(join(skillDir, 'references', 'surface-routing.md'))).toBe(true);
  });

  it('declares skills/ in package files so the skill is published', () => {
    const pkg = JSON.parse(readFileSync(join(clientRoot, 'package.json'), 'utf8')) as {
      files?: string[];
    };
    expect(pkg.files).toBeDefined();
    expect(pkg.files).toContain('skills');
  });
});
