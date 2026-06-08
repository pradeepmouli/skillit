import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseReadme } from '../readme-parser.js';
import type { ParsedReadme } from '../audit-types.js';

/** Package metadata read from a package dir (package.json fields + parsed README). */
export interface PackageMetadata {
  /** Scope-stripped package name. */
  packageName?: string;
  packageDescription?: string;
  keywords?: string[];
  repository?: string;
  readme?: ParsedReadme;
}

const DEFAULT_MAX_DEPTH = 5;

/** Strip a leading `@scope/` from a package name. */
export function stripScope(name: string): string {
  const slash = name.indexOf('/');
  return name.startsWith('@') && slash !== -1 ? name.slice(slash + 1) : name;
}

/**
 * Walk up from `startDir` (inclusive) up to `maxDepth` parents looking for a
 * directory containing a `package.json`. Returns the dir, or undefined.
 */
export async function findNearestPackageDir(
  startDir: string,
  maxDepth = DEFAULT_MAX_DEPTH
): Promise<string | undefined> {
  let dir = startDir;
  for (let i = 0; i <= maxDepth; i++) {
    try {
      await readFile(join(dir, 'package.json'), 'utf8');
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return undefined;
}

/**
 * Read package.json fields + `parseReadme(README.md)` from `pkgDir`. Never
 * throws — unreadable/absent files yield unset fields.
 */
export async function readPackageMetadata(pkgDir: string): Promise<PackageMetadata> {
  const meta: PackageMetadata = {};
  try {
    const pkg = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')) as {
      name?: string;
      description?: string;
      keywords?: string[];
      repository?: string | { url?: string };
    };
    if (pkg.name) meta.packageName = stripScope(pkg.name);
    if (pkg.description) meta.packageDescription = pkg.description;
    if (Array.isArray(pkg.keywords)) meta.keywords = pkg.keywords;
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    if (repo) meta.repository = repo;
  } catch {
    /* no/invalid package.json */
  }
  try {
    meta.readme = parseReadme(await readFile(join(pkgDir, 'README.md'), 'utf8'));
  } catch {
    /* no README */
  }
  return meta;
}
