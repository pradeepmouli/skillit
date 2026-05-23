// packages/core/src/refine/jsdoc-edit.ts
import type { RefineTag } from './types.js';

// Matches `export function <name>` or `export const <name>` (arrow fns, etc.)
function exportRe(name: string): RegExp {
  // Escape metacharacters — export names may include $ (Svelte stores, RxJS, etc.)
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(export\\s+(?:async\\s+)?(?:function|const|class)\\s+${escaped}[\\s(<:,{])`,
    'm'
  );
}

// Matches a JSDoc block immediately before a token at a given index
function docBlockBefore(
  source: string,
  tokenIndex: number
): { start: number; end: number } | undefined {
  const before = source.slice(0, tokenIndex);
  const match = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!match || match.index === undefined) return undefined;
  return { start: match.index, end: match.index + match[0].length };
}

export function insertJsDocTag(
  source: string,
  exportName: string,
  tag: RefineTag,
  content: string
): string {
  const re = exportRe(exportName);
  const exportMatch = source.match(re);
  if (!exportMatch || exportMatch.index === undefined) return source;

  const tagLine = ` * @${tag} ${content}`;
  const block = docBlockBefore(source, exportMatch.index);

  if (block) {
    // Check for duplicate
    const existingBlock = source.slice(block.start, block.end);
    if (existingBlock.includes(`@${tag} ${content}`)) return source;
    const closeOffset = existingBlock.lastIndexOf('*/');
    const closeIdx = block.start + closeOffset;
    // Capture the original indent before */ so we don't double it in the output
    const lineBeforeClose = existingBlock.slice(0, closeOffset).match(/[^\n]*$/)?.[0] ?? ' ';
    return (
      source.slice(0, closeIdx - lineBeforeClose.length) +
      `${tagLine}\n${lineBeforeClose}` +
      source.slice(closeIdx)
    );
  }

  // No existing block — create one
  const indent =
    source
      .slice(0, exportMatch.index)
      .match(/[^\n]*$/)?.[0]
      ?.match(/^\s*/)?.[0] ?? '';
  const newDoc = `${indent}/**\n${indent}${tagLine}\n${indent} */\n`;
  return source.slice(0, exportMatch.index) + newDoc + source.slice(exportMatch.index);
}
