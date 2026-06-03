// packages/core/src/refine/ast-edit.ts
import { parse, Lang } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import type { RefineTag } from './types.js';

const REFINE_TAGS: ReadonlyArray<RefineTag> = [
  'useWhen',
  'avoidWhen',
  'pitfalls',
  'remarks',
  'example'
];

/**
 * Find the export_statement node whose exported name matches `declName`.
 * Handles: function_declaration, class_declaration, interface_declaration,
 * lexical_declaration (const/let with variable_declarator).
 */
function findExportStatement(root: SgNode, declName: string): SgNode | undefined {
  for (const child of root.children()) {
    if (child.kind() !== 'export_statement') continue;
    // Look for the inner declaration (skip the 'export' keyword token)
    for (const inner of child.children()) {
      const k = inner.kind();
      if (k === 'export') continue; // keyword token

      if (
        k === 'function_declaration' ||
        k === 'class_declaration' ||
        k === 'interface_declaration' ||
        k === 'type_alias_declaration'
      ) {
        const nameNode = inner.field('name');
        if (nameNode && nameNode.text() === declName) return child;
      } else if (k === 'lexical_declaration' || k === 'variable_declaration') {
        for (const declarator of inner.children()) {
          if (declarator.kind() !== 'variable_declarator') continue;
          const nameNode = declarator.field('name');
          if (nameNode && nameNode.text() === declName) return child;
        }
      }
    }
  }
  return undefined;
}

/**
 * Returns the leading JSDoc comment node for a given export_statement node,
 * or undefined if none exists. A leading JSDoc must be the immediate previous
 * sibling and start with `/**`.
 */
function leadingJsDoc(exportNode: SgNode): SgNode | undefined {
  const prev = exportNode.prev();
  if (prev && prev.kind() === 'comment' && prev.text().startsWith('/**')) {
    return prev;
  }
  return undefined;
}

/**
 * Insert or update a JSDoc tag on a named export declaration.
 *
 * - If no JSDoc block exists before the declaration, one is created.
 * - If a JSDoc block exists and already contains `@tag content`, the source is
 *   returned unchanged (idempotent).
 * - If a JSDoc block exists without the tag, the tag is appended before the
 *   closing `*\/`.
 * - If the declaration is not found, the source is returned unchanged.
 */
export function upsertJsDocTag(
  source: string,
  declName: string,
  tag: RefineTag,
  content: string
): string {
  const root = parse(Lang.TypeScript, source).root();
  const exportNode = findExportStatement(root, declName);
  if (!exportNode) return source;

  const tagText = `@${tag} ${content}`;
  const jsdocNode = leadingJsDoc(exportNode);

  if (jsdocNode) {
    const block = jsdocNode.text();
    if (block.includes(tagText)) return source;

    // Determine the indent of the closing */ line
    const closeOffset = block.lastIndexOf('*/');
    const beforeClose = block.slice(0, closeOffset);
    // The whitespace prefix of the closing `*/` line
    const linePrefix = beforeClose.match(/([^\n]*)$/)?.[1] ?? ' ';

    const merged =
      block.slice(0, closeOffset - linePrefix.length) + `* ${tagText}\n${linePrefix}*/`;

    return root.commitEdits([jsdocNode.replace(merged)]);
  }

  // No existing JSDoc — create one before the export
  const col = exportNode.range().start.column;
  const indent = ' '.repeat(col);
  const at = exportNode.range().start.index;
  const blockText = `/**\n${indent} * ${tagText}\n${indent} */\n${indent}`;
  return source.slice(0, at) + blockText + source.slice(at);
}

/**
 * Parse the leading JSDoc block of a named export declaration and return a
 * map of the RefineTag values found in it.
 *
 * Returns an empty object when the declaration is not found or has no leading
 * JSDoc block.
 */
export function readJsDocTags(
  source: string,
  declName: string
): Partial<Record<RefineTag, string>> {
  const root = parse(Lang.TypeScript, source).root();
  const exportNode = findExportStatement(root, declName);
  if (!exportNode) return {};

  const jsdocNode = leadingJsDoc(exportNode);
  if (!jsdocNode) return {};

  const block = jsdocNode.text();
  const result: Partial<Record<RefineTag, string>> = {};

  for (const tag of REFINE_TAGS) {
    const pattern = new RegExp(`@${tag}\\s+(.+?)(?:\\s*\\n|\\s*\\*\\/|$)`, 'm');
    const hit = block.match(pattern);
    if (hit) {
      result[tag] = hit[1]?.trim() ?? '';
    }
  }

  return result;
}
