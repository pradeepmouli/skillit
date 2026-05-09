import type { ParsedMarkdownDoc, ParsedSection } from './markdown-types.js';

// ─── Frontmatter ──────────────────────────────────────────────────────────────

/**
 * Extract YAML frontmatter from the top of a markdown string.
 * Returns the parsed key-value pairs and the remaining body, or undefined
 * frontmatter when no frontmatter block is present.
 */
function extractFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown> | undefined;
  body: string;
} {
  const FM_OPEN = /^---\r?\n/;

  if (!FM_OPEN.test(markdown)) {
    return { frontmatter: undefined, body: markdown };
  }

  const closeIdx = markdown.indexOf('\n---\n', 3);
  if (closeIdx === -1) {
    return { frontmatter: undefined, body: markdown };
  }

  const fmText = markdown.slice(4, closeIdx); // skip leading "---\n"
  const body = markdown.slice(closeIdx + 5); // skip "\n---\n"

  const frontmatter: Record<string, unknown> = {};
  for (const line of fmText.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (!key) continue;
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Coerce numeric
    if (value !== '' && !Number.isNaN(Number(value))) {
      frontmatter[key] = Number(value);
    } else {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

// ─── Title ────────────────────────────────────────────────────────────────────

/** Convert a kebab-case basename (without extension) to Title Case. */
function filenameToTitle(filePath: string): string {
  const basename = filePath.split('/').pop() ?? filePath;
  const withoutExt = basename.replace(/\.[^.]+$/, '');
  // Strip leading numeric prefix like "01-", "003-"
  const stripped = withoutExt.replace(/^\d+-/, '');
  return stripped
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Extract the text of the first `# heading` from a body string, or undefined. */
function extractFirstH1(body: string): string | undefined {
  for (const line of body.split('\n')) {
    const m = line.match(/^#\s+(.+)/);
    if (m) return m[1]?.trim();
  }
  return undefined;
}

// ─── Description ─────────────────────────────────────────────────────────────

/**
 * Extract the first prose paragraph that appears after the first `# heading`.
 * Returns undefined when none found.
 */
function extractFirstParagraph(body: string): string | undefined {
  const lines = body.split('\n');
  let pastFirstHeading = false;
  const paraLines: string[] = [];
  let inPara = false;

  for (const line of lines) {
    // Detect any heading
    if (/^#{1,6}\s/.test(line)) {
      if (!pastFirstHeading) {
        pastFirstHeading = true;
        continue;
      }
      // Any subsequent heading ends the paragraph search
      if (inPara || pastFirstHeading) break;
      continue;
    }

    if (!pastFirstHeading) continue;

    const trimmed = line.trim();
    if (trimmed === '') {
      if (inPara) break; // blank line ends paragraph
      continue;
    }

    inPara = true;
    paraLines.push(trimmed);
  }

  if (paraLines.length === 0) return undefined;
  return paraLines.join(' ');
}

// ─── Sections ─────────────────────────────────────────────────────────────────

/** Return the heading level (number of leading `#`) or 0 if not a heading. */
function headingLevel(line: string): number {
  const m = line.match(/^(#{1,6})\s/);
  return m ? (m[1]?.length ?? 0) : 0;
}

/** Extract the heading text from a heading line. */
function headingText(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').trim();
}

/**
 * Split content into a prose part and a list of fenced code blocks.
 * Code blocks are stripped from the prose.
 */
function splitContentAndCode(raw: string): { content: string; codeBlocks: string[] } {
  const codeBlocks: string[] = [];
  const lines = raw.split('\n');
  const proseLines: string[] = [];
  let inCode = false;
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (!inCode && line.startsWith('```')) {
      inCode = true;
      currentBlock = [line];
      continue;
    }
    if (inCode) {
      if (/^```\s*$/.test(line)) {
        currentBlock.push(line);
        codeBlocks.push(currentBlock.join('\n'));
        currentBlock = [];
        inCode = false;
      } else {
        currentBlock.push(line);
      }
      continue;
    }
    proseLines.push(line);
  }

  // Unclosed code block — treat as a code block anyway
  if (inCode && currentBlock.length > 0) {
    codeBlocks.push(currentBlock.join('\n'));
  }

  return { content: proseLines.join('\n').trim(), codeBlocks };
}

/**
 * Extract all `##`+ level sections from a markdown body.
 * Each section spans from its heading to the next heading of the same or
 * higher level (lower number = higher level).
 */
function extractSections(body: string): ParsedSection[] {
  const lines = body.split('\n');
  const sections: ParsedSection[] = [];

  // Find all heading positions
  type HeadingPos = { idx: number; level: number; text: string };
  const headings: HeadingPos[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lvl = headingLevel(lines[i] ?? '');
    if (lvl >= 2) {
      headings.push({ idx: i, level: lvl, text: headingText(lines[i] ?? '') });
    }
  }

  for (let h = 0; h < headings.length; h++) {
    const current = headings[h]!;
    // Find the next heading that is at the same or higher level
    let endIdx = lines.length;
    for (let k = h + 1; k < headings.length; k++) {
      if (headings[k]!.level <= current.level) {
        endIdx = headings[k]!.idx;
        break;
      }
    }

    const rawContent = lines.slice(current.idx + 1, endIdx).join('\n');
    const { content, codeBlocks } = splitContentAndCode(rawContent);

    sections.push({ heading: current.text, level: current.level, content, codeBlocks });
  }

  return sections;
}

// ─── Sort order ───────────────────────────────────────────────────────────────

/** Derive sort order from filename numeric prefix, e.g. "03-setup.md" → 3. */
function orderFromFilename(filePath: string): number {
  const basename = filePath.split('/').pop() ?? filePath;
  const m = basename.match(/^(\d+)-/);
  return m ? Number(m[1]) : Infinity;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a markdown document string into a structured `ParsedMarkdownDoc`.
 *
 * @param markdown - Raw markdown source text.
 * @param filePath - File path used for `relativePath`, title fallback, and order fallback.
 *
 * @category Parsing
 */
export function parseMarkdownDoc(markdown: string, filePath: string): ParsedMarkdownDoc {
  const { frontmatter, body } = extractFrontmatter(markdown);

  // Title: frontmatter.title > first # heading > filename
  const fmTitle =
    frontmatter?.['title'] !== undefined && frontmatter['title'] !== ''
      ? String(frontmatter['title'])
      : undefined;
  const title = fmTitle ?? extractFirstH1(body) ?? filenameToTitle(filePath);

  // Description: frontmatter.description > first paragraph after first heading
  const fmDescription =
    frontmatter?.['description'] !== undefined && frontmatter['description'] !== ''
      ? String(frontmatter['description'])
      : undefined;
  const description = fmDescription ?? extractFirstParagraph(body);

  // Sections
  const sections = extractSections(body);

  // Order: frontmatter.sidebar_position > filename prefix > Infinity
  const fmOrder =
    frontmatter?.['sidebar_position'] !== undefined
      ? Number(frontmatter['sidebar_position'])
      : undefined;
  const order =
    fmOrder !== undefined && !Number.isNaN(fmOrder) ? fmOrder : orderFromFilename(filePath);

  return {
    frontmatter,
    title,
    description,
    relativePath: filePath,
    sections,
    rawContent: body,
    order
  };
}
