/**
 * Per-skill `llms.txt` renderer.
 *
 * Emits an llms.txt-spec compliant index file alongside `SKILL.md`, listing
 * each reference file with a one-line description. Format follows
 * https://llmstxt.org/ — `# <name>` heading, optional `> <description>`
 * blockquote, then a `## Files` section enumerating links with summaries.
 *
 * @remarks
 * We intentionally roll our own minimal renderer rather than reusing
 * `@skillit/core`'s `renderLlmsTxt` — core's emitter targets API surfaces
 * (functions/classes/types) and produces both `llms.txt` and `llms-full.txt`,
 * neither of which is shaped for an MCP tools/resources/prompts directory.
 * The MCP-side llms.txt is a per-skill file directory pointer, not an API
 * dump, so a focused implementation keeps the output compact and on-spec.
 *
 * The `RenderedFile` returned uses the same `<basePath>/llms.txt` convention
 * as `SKILL.md`. Callers append it to `RenderedSkill.references` before
 * `writeSkills()` so the existing writer persists it without changes.
 *
 * @module render/llms-txt
 */

import type { ExtractedSkill, RenderedFile, RenderedSkill } from '@skillit/core';
import { estimateTokens } from '@skillit/core';

/** Max characters retained from a description before truncation. */
const SUMMARY_MAX = 200;

/**
 * Render an `llms.txt` file for the given rendered skill + its source IR.
 *
 * @param rendered The {@link RenderedSkill} produced by `renderSkill`. Used
 *   to discover the per-skill base path (from `rendered.skill.filename`) and
 *   the set of reference files.
 * @param skill The source {@link ExtractedSkill} so we can produce per-section
 *   summaries (tool count, resource count, prompt count) without re-parsing
 *   the rendered markdown.
 * @returns A {@link RenderedFile} with `filename: '<basePath>/llms.txt'` ready
 *   to push onto `rendered.references`.
 *
 * @public
 */
export function renderLlmsTxt(rendered: RenderedSkill, skill: ExtractedSkill): RenderedFile {
  const basePath = deriveBasePath(rendered.skill.filename);
  const lines: string[] = [];

  lines.push(`# ${skill.name}`);
  lines.push('');

  const description = pickDescription(skill);
  if (description) {
    lines.push(`> ${truncate(description)}`);
    lines.push('');
  }

  // Files section — enumerate every reference file with a one-line summary.
  // We skip the SKILL.md itself (it's the entry point, not a reference) and
  // any file we just emitted (avoid self-reference if regenerated).
  const fileEntries = buildFileEntries(rendered, skill);
  if (fileEntries.length > 0) {
    lines.push('## Files');
    lines.push('');
    for (const entry of fileEntries) {
      lines.push(`- [${entry.label}](${entry.path}): ${entry.summary}`);
    }
    lines.push('');
  }

  const content = lines.join('\n');
  return {
    filename: `${basePath}/llms.txt`,
    content,
    tokens: estimateTokens(content)
  };
}

interface FileEntry {
  label: string;
  path: string;
  summary: string;
}

function buildFileEntries(rendered: RenderedSkill, skill: ExtractedSkill): FileEntry[] {
  const entries: FileEntry[] = [];
  const basePath = deriveBasePath(rendered.skill.filename);

  for (const ref of rendered.references) {
    // Path used in the link is relative to the skill directory (so an agent
    // dropping the skill folder anywhere can resolve the link locally).
    const relPath = ref.filename.startsWith(`${basePath}/`)
      ? ref.filename.slice(basePath.length + 1)
      : ref.filename;
    const label = labelForFilename(relPath);
    const summary = summaryForFilename(relPath, skill);
    entries.push({ label, path: relPath, summary });
  }

  return entries;
}

/**
 * Derive a human-friendly section label from a reference filename.
 * `references/tools.md` → `Tools`; `references/cli/widget.md` → `widget`.
 */
function labelForFilename(relPath: string): string {
  const noExt = relPath.replace(/\.md$/, '');
  const segments = noExt.split('/');
  const tail = segments[segments.length - 1] ?? noExt;
  return capitalize(tail);
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Build a one-line summary for a reference file. Hand-tuned for the
 * well-known MCP categories so the llms.txt is informative; falls back to a
 * generic "Reference content" line for adapter-specific files.
 */
function summaryForFilename(relPath: string, skill: ExtractedSkill): string {
  const base = relPath.replace(/^references\//, '').replace(/\.md$/, '');
  switch (base) {
    case 'tools':
    case 'functions':
      return `${countLabel(skill.functions.length, 'tool', 'tools')} the server exposes via MCP \`tools/call\`.`;
    case 'resources':
      return `${countLabel(skill.resources?.length ?? 0, 'resource', 'resources')} readable via MCP \`resources/read\`.`;
    case 'prompts':
      return `${countLabel(skill.prompts?.length ?? 0, 'prompt', 'prompts')} retrievable via MCP \`prompts/get\`.`;
    case 'types':
      return `${countLabel(skill.types.length, 'type', 'types')} referenced by tool / resource schemas.`;
    case 'examples':
      return `${countLabel(skill.examples.length, 'example', 'examples')} showing typical usage.`;
    default:
      return 'Reference content for this skill.';
  }
}

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function pickDescription(skill: ExtractedSkill): string {
  return skill.description || skill.packageDescription || '';
}

function truncate(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim();
  if (single.length <= SUMMARY_MAX) return single;
  return single.slice(0, SUMMARY_MAX - 3) + '...';
}

/**
 * Extract the per-skill base path (the directory holding `SKILL.md`) from a
 * rendered SKILL.md filename. The renderer always emits `<base>/SKILL.md`,
 * so stripping the trailing `/SKILL.md` is sufficient.
 */
function deriveBasePath(skillFilename: string): string {
  const idx = skillFilename.lastIndexOf('/SKILL.md');
  if (idx === -1) {
    // Defensive — shouldn't happen with the current renderer, but if it does,
    // fall back to the directory portion via a generic split.
    const lastSlash = skillFilename.lastIndexOf('/');
    return lastSlash === -1 ? '' : skillFilename.slice(0, lastSlash);
  }
  return skillFilename.slice(0, idx);
}
