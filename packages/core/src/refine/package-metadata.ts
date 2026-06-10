import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseReadme } from '../readme-parser.js';
import type { ParsedReadme } from '../audit-types.js';

/** Package metadata read from a package dir (package.json fields + parsed README). */
export interface PackageMetadata {
  /** Scope-stripped package name. */
  packageName?: string;
  /** Full (scoped) package name as written in package.json, e.g. `@scope/pkg`. */
  fullPackageName?: string;
  packageDescription?: string;
  keywords?: string[];
  repository?: string;
  readme?: ParsedReadme;
  /** `bin` field from package.json — maps command names to entry-point paths. */
  bin?: Record<string, string>;
  /** `private` field from package.json — true means the package is not published. */
  isPrivate?: boolean;
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
 *
 * @param startDir - Directory to start the upward search from (searched first).
 * @param maxDepth - Maximum number of parent directories to ascend (default 5).
 * @returns The nearest directory containing a `package.json`, or `undefined`
 *   when none is found within `maxDepth` levels (or the filesystem root is hit).
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
      bin?: Record<string, string> | string;
      private?: boolean;
    };
    if (pkg.name) {
      meta.fullPackageName = pkg.name;
      meta.packageName = stripScope(pkg.name);
    }
    if (pkg.description) meta.packageDescription = pkg.description;
    if (Array.isArray(pkg.keywords)) meta.keywords = pkg.keywords;
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    if (repo) meta.repository = repo;
    if (pkg.bin) {
      // bin can be a string shorthand (maps package name → path); normalize to record
      meta.bin =
        typeof pkg.bin === 'string' && pkg.name
          ? { [stripScope(pkg.name)]: pkg.bin }
          : typeof pkg.bin === 'object'
            ? (pkg.bin as Record<string, string>)
            : undefined;
    }
    if (pkg.private) meta.isPrivate = true;
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
