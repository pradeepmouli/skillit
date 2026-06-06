// packages/core/src/refine/ast-edit.ts
import { parse, Lang } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import { findPropertyByPath, findTypeBody } from '../config-extract.js';
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
  return upsertTagOnAnchor(source, root, anchorNode, tag, content);
}

/**
 * Insert or update a JSDoc tag on a property of a config type.
 *
 * `propertyPath` is a dot path into the interface or object-type alias named
 * `typeName` (e.g. `outDir` or `components.prefix`). Otherwise behaves like
 * {@link upsertJsDocTag}. Returns the source unchanged when the type or
 * property is not found. Used by the config refine source to write routing
 * tags back onto a config type's property declarations.
 */
export function upsertPropertyJsDocTag(
  source: string,
  typeName: string,
  propertyPath: string,
  tag: RefineTag,
  content: string
): string {
  const root = parse(Lang.TypeScript, source).root();
  const body = findTypeBody(root, typeName);
  if (!body) return source;
  const property = findPropertyByPath(body, propertyPath);
  if (!property) return source;
  return upsertTagOnAnchor(source, root, property, tag, content);
}

/**
 * Insert or update `@tag content` on the JSDoc block leading `anchorNode`,
 * creating the block when absent. Idempotent per tag (matches the tag NAME, so
 * multi-line content never produces duplicates) and rebuilds the block as
 * well-formed multi-line (handling single-line `/** text *\/` inputs). Shared by
 * the declaration-level ({@link upsertJsDocTag}) and property-level
 * ({@link upsertPropertyJsDocTag}) upserts.
 */
function upsertTagOnAnchor(
  source: string,
  root: SgNode,
  anchorNode: SgNode,
  tag: RefineTag,
  content: string
): string {
  const tagText = `@${tag} ${content}`;
  const jsdocNode = leadingJsDoc(anchorNode);
  const indent = ' '.repeat(anchorNode.range().start.column);

  if (jsdocNode) {
    const block = jsdocNode.text();
    if (block.match(new RegExp(`(^|\\n)\\s*\\*?\\s*@${tag}\\b`))) return source;

    const innerLines = block
      .replace(/^\/\*\*/, '')
      .replace(/\s*\*\/\s*$/, '')
      .split('\n')
      .map((line) => line.replace(/^\s*\*? ?/, '').trimEnd());
    while (innerLines.length > 0 && innerLines[0] === '') innerLines.shift();
    while (innerLines.length > 0 && innerLines[innerLines.length - 1] === '') innerLines.pop();

    // Prefix every physical line (including multi-line tag content) with ` * `.
    const allLines = [...innerLines, ...tagText.split('\n')];
    const body = allLines
      .map((line) => (line.length > 0 ? `${indent} * ${line}` : `${indent} *`))
      .join('\n');
    const merged = `/**\n${body}\n${indent} */`;

    return root.commitEdits([jsdocNode.replace(merged)]);
  }

  // No existing JSDoc — create one before the anchor node.
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

  // Strip the block to inner content lines (no `/** */` wrapper, no ` * `
  // prefixes), then walk them: a known `@tag` line opens a capture and the
  // following non-tag lines are its continuation. This keeps multi-line tag
  // content (e.g. bullet lists) intact instead of truncating at the first
  // newline — otherwise a refined `@pitfalls` with several bullets would lose
  // everything past line one when re-extracted into SKILL.md.
  const innerLines = block
    .replace(/^\/\*\*/, '')
    .replace(/\s*\*\/\s*$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*? ?/, '').trimEnd());

  const collected: Partial<Record<RefineTag, string[]>> = {};
  let current: RefineTag | undefined;
  for (const line of innerLines) {
    const tagMatch = line.match(/^@(\w+)\s?(.*)$/);
    const matchedTag = tagMatch ? REFINE_TAGS.find((t) => t === tagMatch[1]) : undefined;
    if (matchedTag) {
      current = matchedTag;
      collected[current] = [tagMatch![2] ?? ''];
    } else if (current) {
      collected[current]!.push(line);
    }
  }

  const result: Partial<Record<RefineTag, string>> = {};
  for (const tag of REFINE_TAGS) {
    const lines = collected[tag];
    if (lines) result[tag] = lines.join('\n').trim();
  }
  return result;
}
