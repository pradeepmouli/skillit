import { readdirSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RenderedFile, RenderedSkill } from '@to-skills/core';

const SKILLS_ROOT = fileURLToPath(new URL('../skills', import.meta.url));

export function loadBundledMcpGuidanceSkill(): RenderedSkill {
  return loadBundledSkill('to-skills-mcp-docs');
}

function loadBundledSkill(skillName: string): RenderedSkill {
  const skillDir = join(SKILLS_ROOT, skillName);
  const files = collectFiles(skillDir, skillName);
  const skill = files.find((file) => file.filename === `${skillName}/SKILL.md`);
  if (!skill) {
    throw new Error(`Bundled skill ${skillName} is missing SKILL.md under ${skillDir}`);
  }

  return {
    skill,
    references: files.filter((file) => file.filename !== skill.filename)
  };
}

function collectFiles(rootDir: string, skillName: string): RenderedFile[] {
  const collected: RenderedFile[] = [];
  visitDirectory(rootDir, rootDir, skillName, collected);
  return collected;
}

function visitDirectory(
  currentDir: string,
  rootDir: string,
  skillName: string,
  collected: RenderedFile[]
): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Failed to read bundled skill directory ${currentDir}: ${messageOf(error)}`, {
      cause: error
    });
  }
  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      visitDirectory(fullPath, rootDir, skillName, collected);
      continue;
    }

    const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');
    let content: string;
    try {
      content = readFileSync(fullPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read bundled skill file ${fullPath}: ${messageOf(error)}`, {
        cause: error
      });
    }
    collected.push({
      filename: `${skillName}/${relPath}`,
      content
    });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
