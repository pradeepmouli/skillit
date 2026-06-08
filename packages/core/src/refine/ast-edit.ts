// packages/core/src/refine/ast-edit.ts
import { parse, Lang } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import {
  escapeJsDocClose,
  findPropertyByPath,
  findTypeBody,
  unescapeJsDocClose
} from '../config-extract.js';
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
 *
 * @remarks
 * Parses `source` with ast-grep (core carries no `typescript` dependency) and
 * edits the text in place, so formatting outside the touched JSDoc block is
 * preserved. Tag matching is by name, so re-running with the same tag is a
 * no-op rather than a duplicate.
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
 *
 * @remarks
 * Resolves `propertyPath` against the body of `typeName` via ast-grep, recursing
 * into nested object-type members for dotted paths. Like {@link upsertJsDocTag},
 * the edit is text-level and idempotent per tag name.
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
  // Escape any comment-close sequence in the content so a value containing it
  // (e.g. a glob like `**/*.ts` in a config pitfall) can't terminate the block
  // early and corrupt the file. readJsDocTags / config extraction unescape it.
  const tagText = escapeJsDocClose(`@${tag} ${content}`);
  const jsdocNode = leadingJsDoc(anchorNode);
  // Indent from the comment when one exists: it may sit on the SAME line as the
  // declaration (`/** x */ prop`), where the declaration's own column is the
  // text after the comment, not the line indent — using it over-indented every
  // rebuilt continuation line. With no comment, indent from the declaration the
  // new block is prepended to.
  const indent = ' '.repeat((jsdocNode ?? anchorNode).range().start.column);

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

    // Own-line comment: a clean node replace suffices.
    if (jsdocNode.range().end.line !== anchorNode.range().start.line) {
      return root.commitEdits([jsdocNode.replace(merged)]);
    }
    // Same-line `/** x */ prop`: a node replace swaps only the comment text and
    // leaves the declaration packed onto the closing `*/` line. Splice manually
    // — drop the inline gap and start the declaration on its own indented line.
    const start = jsdocNode.range().start.index;
    const end = jsdocNode.range().end.index;
    const tail = source.slice(end).replace(/^[^\S\n]+/, '');
    return `${source.slice(0, start)}${merged}\n${indent}${tail}`;
  }

  // No existing JSDoc — create one before the anchor node. Prefix EVERY physical
  // line of the tag (multi-line content too) with ` * `, mirroring the merge
  // branch above. Without this, a multi-line first tag left continuation lines
  // at column 0 — malformed JSDoc that also broke the re-parse for any tag
  // appended to the same declaration in a later pass.
  const at = anchorNode.range().start.index;
  const body = tagText
    .split('\n')
    .map((line) => (line.length > 0 ? `${indent} * ${line}` : `${indent} *`))
    .join('\n');
  const blockText = `/**\n${body}\n${indent} */\n${indent}`;
  return source.slice(0, at) + blockText + source.slice(at);
}

// Fast membership set for tag-name lookups (typed as strings so an arbitrary
// captured `@word` can be tested without a cast). Derived from REFINE_TAGS so
// it stays in sync with the union automatically.
const REFINE_TAG_SET: ReadonlySet<string> = new Set(REFINE_TAGS);

/**
 * Remove the refine-managed tag spans (`@useWhen`, `@avoidWhen`, `@pitfalls`,
 * `@remarks`, `@example` — see {@link REFINE_TAGS}) from every JSDoc block in
 * `source`, leaving each block's prose description and any non-refine tags
 * intact.
 *
 * Used to feed an annotated config module back to the model as grounding
 * without echoing the routing tags this package itself wrote across earlier
 * refine iterations — those are documentation, not the implementation the model
 * should ground runtime claims in. Unlike a blanket JSDoc strip, this preserves
 * genuine hand-authored docs (e.g. validation notes on a `defineConfig` helper),
 * which are exactly the runtime-behavior grounding we want to keep.
 *
 * Handles single-line (`/** @tag x *​/`) as well as multi-line blocks: each block
 * is reduced to its inner content (opener/closer and ` * ` gutter dropped) before
 * tags are matched, so an inline opener can't hide a tag. The block-matching
 * regex is non-greedy, and writeback escapes a literal close sequence in content
 * to `*\/`, so an escaped sequence inside a kept line never terminates early.
 */
export function stripRefineTags(source: string): string {
  return source.replace(/\/\*\*[\s\S]*?\*\//g, (block: string, offset: number) => {
    // Indent of the line the block opens on, for a clean re-wrap when we rebuild.
    const lineStart = source.lastIndexOf('\n', offset) + 1;
    const indent = source.slice(lineStart, offset).match(/^\s*/)?.[0] ?? '';
    return stripRefineTagsFromBlock(block, indent);
  });
}

/**
 * Strip refine-tag spans from one JSDoc block. Returns the block unchanged when
 * it holds no refine tag (preserving hand-authored formatting), the empty string
 * when nothing but refine tags remain (the whole block is dropped), or a clean
 * re-wrapped block at `indent` otherwise. A `@tag` line and the lines following
 * it (its continuation) form one span; a non-refine `@tag` closes any open span.
 */
function stripRefineTagsFromBlock(block: string, indent: string): string {
  // Reduce to inner content so tag detection is independent of how the block is
  // wrapped: drop the `/**` opener and `*/` closer (own-line OR inline, as in a
  // single-line `/** @tag x */`), then the per-line ` * ` gutter.
  const inner = block.replace(/^\s*\/\*\*/, '').replace(/\*\/\s*$/, '');
  const lines = inner.split('\n').map((line) => line.replace(/^\s*\*? ?/, '').trimEnd());

  const kept: string[] = [];
  let dropping = false;
  let droppedAny = false;
  for (const line of lines) {
    const tagMatch = line.match(/^@(\w+)\b/);
    if (tagMatch) {
      dropping = REFINE_TAG_SET.has(tagMatch[1] ?? '');
    }
    if (dropping) {
      droppedAny = true;
      continue;
    }
    kept.push(line);
  }

  if (!droppedAny) return block; // no refine tag — keep original formatting verbatim
  while (kept.length > 0 && kept[0] === '') kept.shift();
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
  if (kept.length === 0) return ''; // block was nothing but refine tags

  const body = kept
    .map((line) => (line.length > 0 ? `${indent} * ${line}` : `${indent} *`))
    .join('\n');
  return `/**\n${body}\n${indent} */`;
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
    if (lines) result[tag] = unescapeJsDocClose(lines.join('\n').trim());
  }
  return result;
}
