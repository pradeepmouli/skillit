import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import type { DepSkillRef } from '../types.js';

function extractFrontmatterField(content: string, field: string): string | undefined {
  const match = content.match(new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm'));
  if (!match?.[1]) return undefined;
  return match[1].replace(/^["']|["']$/g, '');
}

function parseSkillMd(skillMdPath: string): Pick<DepSkillRef, 'name' | 'description'> | undefined {
  let content: string;
  try {
    content = readFileSync(skillMdPath, 'utf8');
  } catch {
    return undefined;
  }
  const name = extractFrontmatterField(content, 'name');
  if (!name) return undefined;
  const description = extractFrontmatterField(content, 'description');
  return { name, ...(description ? { description } : {}) };
}

function discoverForDep(pkgDir: string, depName: string): DepSkillRef[] {
  const depDir = join(pkgDir, 'node_modules', depName);
  if (!existsSync(depDir)) return [];
  const depPkgPath = join(depDir, 'package.json');
  if (!existsSync(depPkgPath)) return [];

  let depPkg: { skillit?: { skills?: unknown } } = {};
  try {
    depPkg = JSON.parse(readFileSync(depPkgPath, 'utf8')) as typeof depPkg;
  } catch {
    return [];
  }

  const skillDirs: string[] = [];
  const explicitSkills = depPkg.skillit?.skills;
  if (Array.isArray(explicitSkills) && explicitSkills.length > 0) {
    for (const relPath of explicitSkills) {
      if (typeof relPath === 'string') skillDirs.push(join(depDir, relPath));
    }
  } else {
    const skillsRoot = join(depDir, 'skills');
    if (existsSync(skillsRoot)) {
      let entries: Dirent<string>[];
      try {
        entries = readdirSync(skillsRoot, { withFileTypes: true, encoding: 'utf8' });
      } catch {
        return [];
      }
      for (const dirent of entries) {
        if (!dirent.isDirectory()) continue;
        const skillDir = join(skillsRoot, dirent.name);
        if (existsSync(join(skillDir, 'SKILL.md'))) skillDirs.push(skillDir);
      }
    }
  }

  const refs: DepSkillRef[] = [];
  for (const skillDir of skillDirs) {
    const parsed = parseSkillMd(join(skillDir, 'SKILL.md'));
    if (!parsed) continue;
    const relativePath = skillDir.slice(pkgDir.length + 1);
    refs.push({
      name: parsed.name,
      path: relativePath,
      ...(parsed.description ? { description: parsed.description } : {})
    });
  }
  return refs;
}

export function discoverDepSkillsSync(pkgDir: string): DepSkillRef[] {
  let pkg: { dependencies?: Record<string, string> } = {};
  try {
    pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as typeof pkg;
  } catch {
    return [];
  }
  const depNames = Object.keys(pkg.dependencies ?? {});
  const refs: DepSkillRef[] = [];
  for (const depName of depNames) refs.push(...discoverForDep(pkgDir, depName));
  return refs;
}

export async function discoverDepSkills(pkgDir: string): Promise<DepSkillRef[]> {
  return discoverDepSkillsSync(pkgDir);
}
