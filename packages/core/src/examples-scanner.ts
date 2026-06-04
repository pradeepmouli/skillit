import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { ExtractedSkill } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedExample {
  /** File path relative to examples dir */
  relativePath: string;
  /** Title derived from top-level JSDoc @description or first comment, or filename */
  title: string;
  /** Description from top-level JSDoc or first comment */
  description?: string;
  /** Imported symbol names (e.g. ["renderSkill", "writeSkills"]) */
  importedSymbols: string[];
  /** Package names imported from (e.g. ["@skillit/core"]) */
  importedFrom: string[];
  /** Full file content */
  content: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORTED_EXTS = new Set(['.ts', '.js', '.tsx', '.jsx']);

/**
 * Matches all forms of import statements:
 * - Named:     import { X, Y as Z } from 'pkg'
 * - Namespace: import * as X from 'pkg'
 * - Default:   import X from 'pkg'
 */
const IMPORT_RE = /import\s+(?:\{([^}]+)\}|(\*\s+as\s+\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g;

// ---------------------------------------------------------------------------
// Import parsing
// ---------------------------------------------------------------------------

function parseImports(content: string): { symbols: string[]; packages: string[] } {
  const symbols: string[] = [];
  const packages: string[] = [];

  let match: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;

  while ((match = IMPORT_RE.exec(content)) !== null) {
    const namedGroup = match[1]; // { X, Y as Z }
    const namespaceGroup = match[2]; // * as X
    const defaultGroup = match[3]; // X
    const pkg = match[4]!;

    packages.push(pkg);

    if (namedGroup) {
      // Extract original names (before "as" alias)
      for (const part of namedGroup.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        // "X as Y" → take X; "X" → take X
        const original = trimmed.split(/\s+as\s+/)[0]!.trim();
        if (original) symbols.push(original);
      }
    } else if (namespaceGroup) {
      // "* as fs" → take "fs"
      const nsName = namespaceGroup.replace(/^\*\s+as\s+/, '').trim();
      if (nsName) symbols.push(nsName);
    } else if (defaultGroup) {
      symbols.push(defaultGroup);
    }
  }

  return { symbols, packages };
}

// ---------------------------------------------------------------------------
// Title / description extraction
// ---------------------------------------------------------------------------

/**
 * Convert a filename (without extension) to a human-readable title.
 * "minimal-server" → "Minimal Server", "my_example" → "My Example"
 */
function filenameToTitle(name: string): string {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract title and description from a top-level JSDoc or `//` comment.
 * Returns undefined if no comment is found at the top of the file.
 */
function extractComment(content: string): { title: string; description?: string } | undefined {
  const stripped = content.trimStart();

  // Try JSDoc: /** ... */
  if (stripped.startsWith('/**')) {
    const end = stripped.indexOf('*/');
    if (end !== -1) {
      const block = stripped.slice(3, end);
      const lines = block
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, '').trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) return undefined;

      const title = lines[0]!;
      const rest = lines.slice(1).join(' ').trim() || undefined;
      return { title, description: rest };
    }
  }

  // Try single-line // comment
  if (stripped.startsWith('//')) {
    const firstLine = stripped.split('\n')[0]!;
    const title = firstLine.replace(/^\/\/\s*/, '').trim();
    if (title) return { title };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function collectExampleFiles(dir: string, rootDir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...collectExampleFiles(fullPath, rootDir));
    } else if (SUPPORTED_EXTS.has(extname(entry))) {
      const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');
      results.push(relPath);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Language tag helper
// ---------------------------------------------------------------------------

function langTag(relativePath: string): string {
  const ext = extname(relativePath);
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  return 'javascript';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan an examples directory for `.ts`/`.js`/`.tsx`/`.jsx` files and parse
 * their import statements and top-level comments.
 *
 * @category Parsing
 * @useWhen
 * - You have an `examples/` directory alongside source code
 * - You want to link example files to the exported symbols they demonstrate
 * @avoidWhen
 * - Your examples are embedded as @example JSDoc tags (use TypeDoc extraction instead)
 */
export function scanExamples(examplesDir: string): ParsedExample[] {
  if (!existsSync(examplesDir)) return [];

  const relPaths = collectExampleFiles(examplesDir, examplesDir);
  const results: ParsedExample[] = [];

  for (const relPath of relPaths) {
    const fullPath = join(examplesDir, relPath);
    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const { symbols, packages } = parseImports(content);
    const comment = extractComment(content);

    let title: string;
    let description: string | undefined;

    if (comment) {
      title = comment.title;
      description = comment.description;
    } else {
      // Derive from filename (strip extension)
      const basename = relPath.split('/').pop()!;
      const nameWithoutExt = basename.replace(/\.[^.]+$/, '');
      title = filenameToTitle(nameWithoutExt);
    }

    results.push({
      relativePath: relPath,
      title,
      description,
      importedSymbols: symbols,
      importedFrom: packages,
      content
    });
  }

  return results;
}

/**
 * Mutate an `ExtractedSkill` in place by linking each example to the first
 * matching exported function or class. Falls back to `skill.examples` when no
 * symbol matches any export.
 *
 * @category Parsing
 * @useWhen
 * - You have scanned examples with `scanExamples` and want to attach them to
 *   the relevant exported symbols inside an `ExtractedSkill`
 */
export function linkExamplesToSkill(examples: ParsedExample[], skill: ExtractedSkill): void {
  for (const example of examples) {
    const lang = langTag(example.relativePath);
    const fenced = `\`\`\`${lang}\n${example.content}\n\`\`\``;

    let linked = false;

    // Find first symbol that matches a function or class export
    for (const symbol of example.importedSymbols) {
      const fn = skill.functions.find((f) => f.name === symbol);
      if (fn) {
        fn.examples.push(fenced);
        linked = true;
        break;
      }

      const cls = skill.classes.find((c) => c.name === symbol);
      if (cls) {
        cls.examples.push(fenced);
        linked = true;
        break;
      }
    }

    if (!linked) {
      skill.examples.push(fenced);
    }
  }
}
