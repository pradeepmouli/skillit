import type { ParsedReadme } from './audit-types.js';

// Heading alias maps keyed by canonical field name
const QUICK_START_HEADINGS = new Set([
  'quick start',
  'usage',
  'getting started',
  'cli usage',
  'basic usage',
  'installation'
]);
const FEATURES_HEADINGS = new Set(['features', 'key features', 'highlights']);
const TROUBLESHOOTING_HEADINGS = new Set([
  'troubleshooting',
  'common issues',
  'common errors',
  'faq',
  'pitfalls',
  'common mistakes',
  'gotchas',
  'caveats'
]);

/** Return true if the line is a `## level-2` heading. */
function isH2(line: string): boolean {
  return /^##\s/.test(line);
}

/** Return true if the line is any heading (`#`, `##`, ...). */
function isHeading(line: string): boolean {
  return /^#{1,6}\s/.test(line);
}

/** Extract the heading text (lowercased, no leading `## ` or emoji prefixes). */
function headingText(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/u, '')
    .toLowerCase()
    .trim();
}

/** Trim and return undefined when the result is empty. */
function nonEmpty(s: string): string | undefined {
  const t = s.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Parse a README markdown string and extract structured sections.
 *
 * Extraction rules:
 * - **blockquote** – first `> …` line between `# title` and the first `## heading`.
 * - **firstParagraph** – first prose lines before the first `## heading` that are
 *   not a heading, badge (`[![`), image (`![`), blockquote, or blank.
 *   Consecutive lines are joined with a single space.
 * - **quickStart** – content under `## Quick Start`, `## Usage`, or `## Getting Started`.
 * - **features** – content under `## Features`, `## Key Features`, or `## Highlights`.
 * - **troubleshooting** – content under `## Troubleshooting`, `## Common Issues`, `## Common Errors`,
 *   `## FAQ`, `## Pitfalls`, `## Common Mistakes`, `## Gotchas`, or `## Caveats`.
 *
 * @category Parsing
 * @useWhen
 * - You need structured README sections for audit context or skill enrichment
 * - The audit engine calls this to check for Features and Troubleshooting sections
 */
export function parseReadme(markdown: string): ParsedReadme {
  if (!markdown.trim()) return {};

  const lines = markdown.split('\n');
  const result: ParsedReadme = {};

  // ── Pass 1: collect preamble lines (before first ## heading) ──────────────

  let preambleEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const li = lines[i] ?? '';
    if (isH2(li)) {
      preambleEnd = i;
      break;
    }
  }

  const preambleLines = lines.slice(0, preambleEnd);

  // Extract blockquote from preamble (skip title line)
  for (const line of preambleLines) {
    if (isHeading(line)) continue; // skip the # title
    if (line.startsWith('> ')) {
      result.blockquote = line.slice(2).trim();
      break;
    }
  }

  // Extract first paragraph from preamble
  const paraLines: string[] = [];
  let inPara = false;

  for (const line of preambleLines) {
    if (isHeading(line)) continue; // skip headings (# title)
    if (line.startsWith('> ')) continue; // skip blockquotes
    if (line.startsWith('[![')) continue; // skip badge lines
    if (line.startsWith('![')) continue; // skip image lines

    const trimmed = line.trim();
    if (trimmed === '') {
      if (inPara) break; // blank line ends paragraph
      continue;
    }

    inPara = true;
    paraLines.push(trimmed);
  }

  if (paraLines.length > 0) {
    result.firstParagraph = paraLines.join(' ');
  }

  // ── Pass 2: collect named sections ────────────────────────────────────────

  // Walk through H2 sections and capture content
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (isH2(line)) {
      const text = headingText(line);
      let field: keyof ParsedReadme | null = null;

      if (QUICK_START_HEADINGS.has(text)) field = 'quickStart';
      else if (FEATURES_HEADINGS.has(text)) field = 'features';
      else if (TROUBLESHOOTING_HEADINGS.has(text)) field = 'troubleshooting';

      if (field !== null) {
        // Collect lines until the next ## heading or EOF
        const contentLines: string[] = [];
        i++;
        while (i < lines.length && !isH2(lines[i] ?? '')) {
          contentLines.push(lines[i] ?? '');
          i++;
        }
        const content = nonEmpty(contentLines.join('\n'));
        if (content !== undefined) {
          result[field] = content;
        }
        continue; // don't increment i again
      }
    }

    i++;
  }

  return result;
}
