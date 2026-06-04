/**
 * Shared reference-file emitters for MCP-exposed resources and prompts.
 *
 * @remarks
 * Used by core's default render path AND by invocation adapters that delegate
 * body rendering to core (e.g. `@skillit/target-mcp-protocol`'s `McpProtocolAdapter`).
 * Centralizing the markdown shape here means every emitter — bundle and extract,
 * MCP-protocol and CLI-as-proxy — produces identical resources/prompts files.
 *
 * Both functions return `null` when the input is empty so callers can write:
 *
 * ```ts
 * const ref = renderResourcesReference(skill.resources ?? [], opts);
 * if (ref) references.push(ref);
 * ```
 *
 * @module references-mcp
 */

import type { ExtractedResource, ExtractedPrompt, RenderedFile } from './types.js';
import { estimateTokens, truncateToTokenBudget } from './tokens.js';

/** Options for the shared MCP reference emitters. */
export interface McpReferenceOptions {
  /**
   * Skill name (kebab-case directory) the file is rooted in. The emitter writes
   * to `${skillName}/references/{resources,prompts}.md`.
   */
  skillName: string;
  /** Token budget ceiling. Files exceeding this are truncated with a `<!-- truncated -->` marker. */
  maxTokens: number;
}

/**
 * Render the `references/resources.md` file for an MCP server's exposed resources.
 *
 * Output shape:
 *
 * ```markdown
 * # Resources
 *
 * ## <resource.name>
 *
 * **URI**: `<resource.uri>`
 * **MIME type**: `<resource.mimeType>`   (omitted when undefined)
 *
 * <resource.description>
 *
 * ---
 *
 * ## <next resource>
 * ```
 *
 * @returns A `RenderedFile` with token estimate, or `null` when `resources` is empty.
 */
export function renderResourcesReference(
  resources: readonly ExtractedResource[],
  opts: McpReferenceOptions
): RenderedFile | null {
  if (resources.length === 0) return null;

  const lines: string[] = ['# Resources', ''];
  for (let i = 0; i < resources.length; i++) {
    const r = resources[i]!;
    lines.push(`## ${r.name}`);
    lines.push('');
    lines.push(`**URI**: \`${r.uri}\``);
    if (r.mimeType !== undefined) {
      lines.push(`**MIME type**: \`${r.mimeType}\``);
    }
    if (r.description) {
      lines.push('');
      lines.push(r.description);
    }
    if (i < resources.length - 1) {
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  const content = lines.join('\n');
  const tokens = estimateTokens(content);
  return {
    filename: `${opts.skillName}/references/resources.md`,
    content: truncateToTokenBudget(content, opts.maxTokens),
    tokens
  };
}

/**
 * Render the `references/prompts.md` file for an MCP server's exposed prompts.
 *
 * Output shape:
 *
 * ```markdown
 * # Prompts
 *
 * ## <prompt.name>
 *
 * <prompt.description>
 *
 * | Argument | Required | Description |
 * |----------|----------|-------------|
 * | <name>   | yes/no   | <desc>      |
 *
 * ---
 *
 * ## <next prompt>
 * ```
 *
 * The argument table is omitted when `arguments` is empty.
 *
 * @returns A `RenderedFile` with token estimate, or `null` when `prompts` is empty.
 */
export function renderPromptsReference(
  prompts: readonly ExtractedPrompt[],
  opts: McpReferenceOptions
): RenderedFile | null {
  if (prompts.length === 0) return null;

  const lines: string[] = ['# Prompts', ''];
  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i]!;
    lines.push(`## ${p.name}`);
    lines.push('');
    if (p.description) {
      lines.push(p.description);
      lines.push('');
    }
    if (p.arguments.length > 0) {
      lines.push('| Argument | Required | Description |');
      lines.push('|----------|----------|-------------|');
      for (const arg of p.arguments) {
        lines.push(`| ${arg.name} | ${arg.required ? 'yes' : 'no'} | ${arg.description} |`);
      }
    }
    if (i < prompts.length - 1) {
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  const content = lines.join('\n');
  const tokens = estimateTokens(content);
  return {
    filename: `${opts.skillName}/references/prompts.md`,
    content: truncateToTokenBudget(content, opts.maxTokens),
    tokens
  };
}
