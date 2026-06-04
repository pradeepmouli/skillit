// packages/core/src/refine/ast-edit.ts
import { parse, Lang } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import type { RefineTag } from './types.js';

// `satisfies` ensures every listed value is a valid RefineTag. The
// `MissingTags` assertion below makes the inverse hold too: if a value is added
// to the RefineTag union but not to this list, compilation fails — so the
// round-trip / readJsDocTags coverage can never silently miss a tag.
const REFINE_TAGS = [
  'useWhen',
  'avoidWhen',
  'pitfalls',
  'remarks',
  'example'
] as const satisfies readonly RefineTag[];

// Compile-time exhaustiveness guard: `MissingTags` must be `never`. If a value
// is added to RefineTag but not to REFINE_TAGS, this assignment fails to type.
type MissingTags = Exclude<RefineTag, (typeof REFINE_TAGS)[number]>;
const _exhaustive: never = undefined as MissingTags;
void _exhaustive;

/**
 * True when `node` is a top-level declaration named `declName`.
 * Handles: function_declaration, class_declaration, abstract_class_declaration,
 * interface_declaration, enum_declaration, type_alias_declaration, and
 * lexical_declaration / variable_declaration (const/let with variable_declarator).
 */
function declarationMatches(node: SgNode, declName: string): boolean {
  const k = node.kind();
  if (
    k === 'function_declaration' ||
    k === 'class_declaration' ||
    k === 'abstract_class_declaration' ||
    k === 'interface_declaration' ||
    k === 'enum_declaration' ||
    k === 'type_alias_declaration'
  ) {
    const nameNode = node.field('name');
    return nameNode?.text() === declName;
  }
  if (k === 'lexical_declaration' || k === 'variable_declaration') {
    for (const declarator of node.children()) {
      if (declarator.kind() !== 'variable_declarator') continue;
      const nameNode = declarator.field('name');
      if (nameNode?.text() === declName) return true;
    }
  }
  return false;
}

/**
 * Find the anchor node whose leading JSDoc should be read/edited for the
 * top-level declaration named `declName`.
 *
 * - For an `export`-wrapped declaration, the anchor is the `export_statement`
 *   node (so leading JSDoc attaches above the `export` keyword).
 * - For a bare top-level declaration, the anchor is the declaration node itself.
 *
 * Returns `undefined` if no matching declaration exists.
 */
function findDeclaration(root: SgNode, declName: string): SgNode | undefined {
  for (const child of root.children()) {
    if (child.kind() === 'export_statement') {
      // Look for the inner declaration (skip the 'export' keyword token).
      for (const inner of child.children()) {
        if (inner.kind() === 'export') continue; // keyword token
        if (declarationMatches(inner, declName)) return child;
      }
      continue;
    }
    // Bare (non-exported) top-level declaration.
    if (declarationMatches(child, declName)) return child;
  }
  return undefined;
}

/**
 * Returns the leading JSDoc comment node for a given anchor node, or undefined
 * if none exists. A leading JSDoc must be the immediate previous sibling and
 * start with `/**`.
 */
function leadingJsDoc(anchorNode: SgNode): SgNode | undefined {
  const prev = anchorNode.prev();
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
  const anchorNode = findDeclaration(root, declName);
  if (!anchorNode) return source;

  const tagText = `@${tag} ${content}`;
  const jsdocNode = leadingJsDoc(anchorNode);

  if (jsdocNode) {
    const block = jsdocNode.text();
    if (block.includes(tagText)) return source;

    // Determine the indent of the closing */ line
    const closeOffset = block.lastIndexOf('*/');
    const beforeClose = block.slice(0, closeOffset);
    // The whitespace prefix of the closing `*/` line
    const linePrefix = beforeClose.match(/([^\n]*)$/)?.[1] ?? ' ';

    const merged =
      block.slice(0, closeOffset - linePrefix.length) +
      `${linePrefix}* ${tagText}\n${linePrefix}*/`;

    return root.commitEdits([jsdocNode.replace(merged)]);
  }

  // No existing JSDoc — create one before the anchor node.
  const col = anchorNode.range().start.column;
  const indent = ' '.repeat(col);
  const at = anchorNode.range().start.index;
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
  const anchorNode = findDeclaration(root, declName);
  if (!anchorNode) return {};

  const jsdocNode = leadingJsDoc(anchorNode);
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
