import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import YAML from 'yaml';
import type {
  RenderedFile,
  RenderedSkill,
  SkillWriteOptions,
  SkillWritePreserveReason,
  SkillWriteResult
} from './types.js';

/**
 * Write rendered skill file sets to disk (SKILL.md + references/).
 *
 * @category I/O
 * @useWhen
 * - You have RenderedSkill objects from renderSkills() and need to persist them to the filesystem
 * - Building a custom pipeline that separates rendering from writing (e.g., for preview or dry-run)
 */
export function writeSkills(
  skills: RenderedSkill[],
  options: SkillWriteOptions
): SkillWriteResult[] {
  const roots = collectWriteRoots(options);
  const results: SkillWriteResult[] = [];

  for (const skill of skills) {
    const skillName = dirname(skill.skill.filename).replace(/\\/g, '/');
    for (const root of roots) {
      const skillDir = join(root, dirname(skill.skill.filename));
      const preserveReason = shouldPreserveExistingSkill(skillDir, skill);
      if (preserveReason) {
        results.push({
          root,
          rootKind: root === resolve(options.outDir) ? 'outDir' : 'installTarget',
          skillName,
          action: 'preserved',
          preserveReason
        });
        continue;
      }

      removeSkillDirectory(skillDir);
      writeFile(root, skill.skill);

      for (const ref of skill.references) {
        writeFile(root, ref);
      }

      results.push({
        root,
        rootKind: root === resolve(options.outDir) ? 'outDir' : 'installTarget',
        skillName,
        action: 'written'
      });
    }
  }

  return results;
}

export function readInstalledSkillMetadata(
  skillDir: string
): { bundledGuidance?: boolean; curated?: boolean; version?: string; name?: string } | null {
  return readSkillMetadata(skillDir);
}

function writeFile(outDir: string, file: RenderedFile): void {
  const fullPath = join(outDir, file.filename);
  try {
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write ${fullPath}: ${messageOf(error)}`, { cause: error });
  }
}

function collectWriteRoots(options: SkillWriteOptions): string[] {
  const roots = [
    ...(options.includeOutDir === false ? [] : [resolve(options.outDir)]),
    ...(options.installTargets ?? []).map((target) => resolve(target))
  ];
  return [...new Set(roots)];
}

function shouldPreserveExistingSkill(
  skillDir: string,
  incoming: RenderedSkill
): SkillWritePreserveReason | null {
  const existing = readSkillMetadata(skillDir);
  if (!existing) return null;

  if (existing.curated === true) {
    return 'curated';
  }

  const incomingMetadata = readSkillMetadataFromContent(incoming.skill.content);
  if (!incomingMetadata.bundledGuidance) return null;

  if (existing.name && incomingMetadata.name && existing.name !== incomingMetadata.name) {
    return 'bundled-name-mismatch';
  }

  if (!existing.bundledGuidance) {
    return 'bundled-custom-skill';
  }

  if (!existing.version) {
    return 'bundled-missing-version';
  }

  const semverResult = compareSemver(existing.version, incomingMetadata.version ?? '0.0.0');
  if (semverResult === 0) return 'bundled-same-version';
  if (semverResult > 0) return 'bundled-newer-version';
  return null;
}

function readSkillMetadata(
  skillDir: string
): { bundledGuidance?: boolean; curated?: boolean; version?: string; name?: string } | null {
  const skillPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillPath)) return null;

  let content: string;
  try {
    content = readFileSync(skillPath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read installed SKILL.md at ${skillPath}: ${messageOf(error)}`, {
      cause: error
    });
  }
  let frontmatter: ReturnType<typeof readSkillMetadataFromContent>;
  try {
    frontmatter = readSkillMetadataFromContent(content);
  } catch {
    frontmatter = readLenientSkillMetadataFromContent(content);
  }
  return {
    ...frontmatter,
    curated: frontmatter.curated === true || content.includes('<!-- curated -->') ? true : undefined
  };
}

function readSkillMetadataFromContent(content: string): {
  bundledGuidance?: boolean;
  curated?: boolean;
  version?: string;
  name?: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  let frontmatter: {
    curated?: boolean;
    version?: unknown;
    name?: unknown;
    toSkills?: { managed?: unknown } | unknown;
  } | null;
  try {
    frontmatter = YAML.parse(match[1]!) as {
      curated?: boolean;
      version?: unknown;
      name?: unknown;
      toSkills?: { managed?: unknown } | unknown;
    } | null;
  } catch (error) {
    throw new Error(`Failed to parse SKILL.md frontmatter: ${messageOf(error)}`, {
      cause: error
    });
  }
  const toSkills =
    frontmatter?.toSkills &&
    typeof frontmatter.toSkills === 'object' &&
    !Array.isArray(frontmatter.toSkills)
      ? (frontmatter.toSkills as { managed?: unknown })
      : undefined;
  const explicitBundledGuidance = toSkills?.managed === 'bundled-guidance';
  const legacyBundledGuidance =
    typeof frontmatter?.name === 'string' &&
    frontmatter.name.startsWith('skillit-') &&
    typeof frontmatter?.version === 'string';
  return {
    bundledGuidance: explicitBundledGuidance || legacyBundledGuidance ? true : undefined,
    curated: frontmatter?.curated === true ? true : undefined,
    version: typeof frontmatter?.version === 'string' ? frontmatter.version : undefined,
    name: typeof frontmatter?.name === 'string' ? frontmatter.name : undefined
  };
}

function readLenientSkillMetadataFromContent(content: string): {
  bundledGuidance?: boolean;
  curated?: boolean;
  version?: string;
  name?: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const parsed = parseLenientFrontmatter(match[1]!);
  const legacyBundledGuidance =
    typeof parsed.name === 'string' &&
    parsed.name.startsWith('skillit-') &&
    typeof parsed.version === 'string';
  return {
    bundledGuidance: parsed.bundledGuidance || legacyBundledGuidance ? true : undefined,
    curated: parsed.curated,
    version: parsed.version,
    name: parsed.name
  };
}

function parseLenientFrontmatter(frontmatter: string): {
  bundledGuidance?: boolean;
  curated?: boolean;
  version?: string;
  name?: string;
} {
  let name: string | undefined;
  let version: string | undefined;
  let curated: boolean | undefined;
  let bundledGuidance: boolean | undefined;
  let inToSkills = false;
  let toSkillsIndent = -1;

  for (const line of frontmatter.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const indent = leadingIndentWidth(line);
    if (inToSkills && indent <= toSkillsIndent) {
      inToSkills = false;
      toSkillsIndent = -1;
    }

    if (inToSkills) {
      const [key, value] = splitFrontmatterKeyValue(trimmed);
      if (key === 'managed' && value === 'bundled-guidance') {
        bundledGuidance = true;
      }
      continue;
    }

    const [key, value] = splitFrontmatterKeyValue(trimmed);
    if (!key || value === undefined) continue;
    if (key === 'name') {
      name = value;
      continue;
    }
    if (key === 'version') {
      version = value;
      continue;
    }
    if (key === 'curated' && value === 'true') {
      curated = true;
      continue;
    }
    if (key === 'toSkills') {
      inToSkills = true;
      toSkillsIndent = indent;
    }
  }

  return {
    bundledGuidance,
    curated,
    version,
    name
  };
}

function splitFrontmatterKeyValue(
  line: string
): [key: string | undefined, value: string | undefined] {
  const separator = line.indexOf(':');
  if (separator === -1) return [undefined, undefined];
  const key = line.slice(0, separator).trim();
  const rawValue = line.slice(separator + 1).trim();
  if (key.length === 0) return [undefined, undefined];
  return [key, stripInlineComment(rawValue)];
}

function stripInlineComment(value: string): string {
  const hashIndex = value.indexOf('#');
  return (hashIndex === -1 ? value : value.slice(0, hashIndex)).trim();
}

function leadingIndentWidth(line: string): number {
  let width = 0;
  while (width < line.length && (line[width] === ' ' || line[width] === '\t')) {
    width++;
  }
  return width;
}

function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  for (let index = 0; index < 3; index++) {
    const left = parsedA.release[index] ?? 0;
    const right = parsedB.release[index] ?? 0;
    if (left < right) return -1;
    if (left > right) return 1;
  }

  if (parsedA.prerelease.length === 0 && parsedB.prerelease.length === 0) return 0;
  if (parsedA.prerelease.length === 0) return 1;
  if (parsedB.prerelease.length === 0) return -1;

  const limit = Math.max(parsedA.prerelease.length, parsedB.prerelease.length);
  for (let index = 0; index < limit; index++) {
    const left = parsedA.prerelease[index];
    const right = parsedB.prerelease[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;

    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const leftIsNumber = Number.isInteger(leftNumber) && `${leftNumber}` === left;
    const rightIsNumber = Number.isInteger(rightNumber) && `${rightNumber}` === right;
    if (leftIsNumber && rightIsNumber) {
      if (leftNumber < rightNumber) return -1;
      if (leftNumber > rightNumber) return 1;
      continue;
    }
    if (leftIsNumber) return -1;
    if (rightIsNumber) return 1;
    return left < right ? -1 : 1;
  }

  return 0;
}

function parseSemver(version: string): { release: number[]; prerelease: string[] } {
  let normalized = version.startsWith('v') ? version.slice(1) : version;
  const buildIndex = normalized.indexOf('+');
  if (buildIndex !== -1) normalized = normalized.slice(0, buildIndex);
  const prereleaseIndex = normalized.indexOf('-');
  const prerelease =
    prereleaseIndex === -1
      ? []
      : normalized
          .slice(prereleaseIndex + 1)
          .split('.')
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
  if (prereleaseIndex !== -1) normalized = normalized.slice(0, prereleaseIndex);

  return {
    release: normalized.split('.').map((part) => {
      const numeric = Number.parseInt(part, 10);
      return Number.isFinite(numeric) ? numeric : 0;
    }),
    prerelease
  };
}

function removeSkillDirectory(skillDir: string): void {
  try {
    rmSync(skillDir, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Failed to remove existing skill directory ${skillDir}: ${messageOf(error)}`, {
      cause: error
    });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
