import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import type { DocsExtractionOptions, ParsedMarkdownDoc } from './markdown-types.js';
import type { ExtractedDocument } from './types.js';
import { parseMarkdownDoc } from './markdown-parser.js';

// ---------------------------------------------------------------------------
// Default exclusions & limits
// ---------------------------------------------------------------------------

const DEFAULT_EXCLUDE = ['**/api/**', '**/node_modules/**', '**/.specify/**', '**/superpowers/**'];

const DEFAULT_MAX_DOCS = 20;

// ---------------------------------------------------------------------------
// Exclude pattern matching
// ---------------------------------------------------------------------------

/**
 * Build a predicate that returns `true` when a relative path matches any of
 * the given glob-style exclude patterns.
 *
 * Supported pattern form: `** /segment/**`
 * Matching rule: the path equals, starts with, or contains the `segment` as a
 * directory component.
 */
function makeExcludeMatcher(patterns: string[]): (relativePath: string) => boolean {
  // Extract the core segment from each pattern: `**/foo/**` → `foo`
  const segments = patterns.map((p) =>
    p
      .replace(/^\*\*\//, '')
      .replace(/\/\*\*$/, '')
      .replace(/\\/g, '/')
  );

  return (relativePath: string): boolean => {
    const norm = relativePath.replace(/\\/g, '/');
    for (const seg of segments) {
      if (
        norm === seg ||
        norm.startsWith(seg + '/') ||
        norm.includes('/' + seg + '/') ||
        norm.endsWith('/' + seg)
      ) {
        return true;
      }
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// Recursive file collection
// ---------------------------------------------------------------------------

function collectMarkdownFiles(
  dir: string,
  rootDir: string,
  isExcluded: (rel: string) => boolean
): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (!isExcluded(relPath)) {
        results.push(...collectMarkdownFiles(fullPath, rootDir, isExcluded));
      }
    } else if (/\.mdx?$/.test(entry)) {
      if (!isExcluded(relPath)) {
        results.push(relPath);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a docs directory and return parsed markdown documents.
 *
 * - Returns `[]` when `docsDir` does not exist.
 * - Recursively collects `.md` / `.mdx` files, honouring exclude patterns.
 * - Default exclusions: **\/api\/**, **\/node_modules\/**, **\/.specify\/**, **\/superpowers\/**.
 * - Sorts ascending by `order`, then alphabetically by `title`.
 * - Truncates to `maxDocs` (default 20).
 *
 * @category Parsing
 * @useWhen
 * - You have hand-written prose docs (tutorials, guides, architecture) in a docs/ directory
 * - You want these docs included alongside API skills for richer agent context
 * @avoidWhen
 * - Your docs/ directory contains only auto-generated API docs — they duplicate the TypeDoc output
 */
export function scanDocs(options: DocsExtractionOptions): ParsedMarkdownDoc[] {
  const { docsDir, exclude, maxDocs = DEFAULT_MAX_DOCS } = options;

  if (!existsSync(docsDir)) {
    return [];
  }

  const effectiveExclude = exclude ?? DEFAULT_EXCLUDE;
  const isExcluded = makeExcludeMatcher(effectiveExclude);
  const filePaths = collectMarkdownFiles(docsDir, docsDir, isExcluded);

  const docs: ParsedMarkdownDoc[] = filePaths.map((relPath) => {
    const fullPath = join(docsDir, relPath);
    const content = readFileSync(fullPath, 'utf-8');
    return parseMarkdownDoc(content, relPath);
  });

  docs.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });

  return docs.slice(0, maxDocs);
}

/**
 * Convert parsed markdown documents to the generic `ExtractedDocument` shape.
 *
 * @param docs - Parsed markdown documents (from `scanDocs()`) to convert; each
 *   contributes its `title` and `rawContent`.
 * @returns One `ExtractedDocument` per input doc, in the same order.
 * @category Parsing
 * @useWhen
 * - You have ParsedMarkdownDoc objects from scanDocs() and need to attach them to an ExtractedSkill
 */
export function docsToExtractedDocuments(docs: ParsedMarkdownDoc[]): ExtractedDocument[] {
  return docs.map((doc) => ({ title: doc.title, content: doc.rawContent }));
}

/**
 * Scan root-level .md files that contain useful documentation.
 * Skips README.md (parsed separately), LICENSE, CODE_OF_CONDUCT.md.
 *
 * @category Parsing
 * @useWhen
 * - You want to include well-known root-level markdown files (ARCHITECTURE.md, MIGRATION.md, CONTRIBUTING.md) as documents
 * - Supplementing API skills with project-level documentation context
 * @avoidWhen
 * - Your root directory has many auto-generated or release-tracking markdown files — use explicit include lists instead
 */
export function scanRootDocs(projectRoot: string): ParsedMarkdownDoc[] {
  const SKIP = new Set([
    'readme.md',
    'license',
    'license.md',
    'code_of_conduct.md',
    'changelog.md',
    'changes.md',
    'history.md',
    'releases.md',
    'security.md',
    'support.md',
    'contributors.md',
    'authors.md',
    'acknowledgments.md',
    'agents.md',
    'claude.md',
    'gemini.md',
    'copilot.md'
  ]);

  if (!existsSync(projectRoot)) return [];

  const entries = readdirSync(projectRoot, { withFileTypes: true });
  const docs: ParsedMarkdownDoc[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.mdx?$/i.test(entry.name)) continue;
    if (SKIP.has(entry.name.toLowerCase())) continue;

    try {
      const content = readFileSync(join(projectRoot, entry.name), 'utf-8');
      const parsed = parseMarkdownDoc(content, entry.name);
      docs.push(parsed);
    } catch {
      // skip unreadable
    }
  }

  return docs.sort((a, b) => a.title.localeCompare(b.title));
}
