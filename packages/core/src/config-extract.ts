// packages/core/src/config-extract.ts
import { parse, Lang } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import type { ExtractedConfigOption, ExtractedConfigSurface } from './config-types.js';

/**
 * Extract a configuration surface from a TypeScript config type.
 *
 * Walks the properties of the interface or object-type alias named `typeName`
 * (via ast-grep — core has no `typescript` dependency, mirroring `ast-edit.ts`)
 * and produces an {@link ExtractedConfigSurface} with `sourceType: 'config'`.
 * Each property becomes an {@link ExtractedConfigOption} keyed by its
 * dot-notation `configKey`; nested object-literal types recurse (e.g.
 * `components.prefix`). Per-property JSDoc supplies the description, the
 * `@default` value, and the `@useWhen` / `@avoidWhen` / `@pitfalls` / `@remarks`
 * routing tags.
 *
 * @param source - TypeScript source text containing the config type declaration.
 * @param typeName - Name of the interface or object-type alias to extract.
 * @returns The extracted config surface, or `undefined` when no matching type
 *   declaration is found in `source`.
 */
export function extractConfigSurface(
  source: string,
  typeName: string
): ExtractedConfigSurface | undefined {
  const root = parse(Lang.TypeScript, source).root();
  const body = findTypeBody(root, typeName);
  if (!body) return undefined;

  return {
    name: typeName,
    description: '',
    sourceType: 'config',
    options: walkProperties(body, '')
  };
}

/**
 * Locate the object-type body for the type named `typeName`. Handles an
 * `interface X { … }` (returns its `interface_body`) and a
 * `type X = { … }` alias (returns the `object_type` value). Returns `undefined`
 * for non-object type aliases (unions, primitives, etc.) or a missing name.
 */
export function findTypeBody(root: SgNode, typeName: string): SgNode | undefined {
  for (const node of descendants(root)) {
    const kind = node.kind();
    if (kind === 'interface_declaration' && node.field('name')?.text() === typeName) {
      return node.field('body') ?? undefined;
    }
    if (kind === 'type_alias_declaration' && node.field('name')?.text() === typeName) {
      const value = node.field('value');
      return value?.kind() === 'object_type' ? value : undefined;
    }
  }
  return undefined;
}

/**
 * Navigate a dot path (e.g. `outDir` or `components.prefix`) from a type body
 * to the `property_signature` node it names, descending into inline
 * object-literal types for each intermediate segment. Returns `undefined` if
 * any segment is missing. Used by the config refine source to locate the
 * declaration whose leading JSDoc carries a property's routing tags.
 */
export function findPropertyByPath(body: SgNode, path: string): SgNode | undefined {
  const parts = path.split('.');
  let currentBody: SgNode | undefined = body;
  for (let i = 0; i < parts.length; i++) {
    if (!currentBody) return undefined;
    const prop: SgNode | undefined = currentBody
      .children()
      .find(
        (c: SgNode) => c.kind() === 'property_signature' && c.field('name')?.text() === parts[i]
      );
    if (!prop) return undefined;
    if (i === parts.length - 1) return prop;
    currentBody = prop
      .field('type')
      ?.children()
      .find((n: SgNode) => n.kind() === 'object_type');
  }
  return undefined;
}

/** Walk every `property_signature` directly under `bodyNode`. */
function walkProperties(bodyNode: SgNode, prefix: string): ExtractedConfigOption[] {
  const options: ExtractedConfigOption[] = [];
  for (const child of bodyNode.children()) {
    if (child.kind() !== 'property_signature') continue;
    const nameNode = child.field('name');
    if (!nameNode) continue;
    const name = nameNode.text();
    const configKey = prefix ? `${prefix}.${name}` : name;

    // type_annotation text is `: <type>`; strip the leading colon/space and
    // collapse internal whitespace so a multi-line type (e.g. a mapped type
    // spanning several lines) renders as one line — a literal newline in the
    // captured text would otherwise corrupt the markdown options table.
    const typeNode = child.field('type');
    const typeText = (typeNode?.text() ?? '')
      .replace(/^\s*:\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Optional when a `?` precedes the `:` (type-level `?` comes after the colon).
    const required = !/^[^:]*\?/.test(child.text());

    const doc = parsePropertyJsDoc(child.prev() ?? undefined);
    const option: ExtractedConfigOption = {
      name,
      configKey,
      type: typeText || 'unknown',
      description: doc.description ?? '',
      required
    };
    if (doc.defaultValue !== undefined) option.defaultValue = doc.defaultValue;
    if (doc.useWhen) option.useWhen = splitTagContent(doc.useWhen);
    if (doc.avoidWhen) option.avoidWhen = splitTagContent(doc.avoidWhen);
    if (doc.pitfalls) option.pitfalls = splitTagContent(doc.pitfalls);
    if (doc.remarks !== undefined) option.remarks = doc.remarks;
    options.push(option);

    // Recurse into an inline object-literal type → dot-notation child keys.
    const objectType = typeNode?.children().find((n) => n.kind() === 'object_type');
    if (objectType) {
      options.push(...walkProperties(objectType, configKey));
    }
  }
  return options;
}

/**
 * Escape the comment-close sequence `*` + `/` in text destined for a JSDoc
 * block, so model-drafted content containing it — e.g. a `**` + `/*.ts` glob in
 * an `include`/`exclude` pitfall — cannot terminate the block early and corrupt
 * the file. A backslash is inserted between the star and the slash, which the
 * comment scanner does not treat as a close (the star is followed by the
 * backslash, not the slash). Idempotent: an already-escaped sequence has no bare
 * star-slash left to match.
 */
export function escapeJsDocClose(text: string): string {
  return text.replace(/\*\//g, '*\\/');
}

/** Inverse of {@link escapeJsDocClose}, applied when reading tag content back. */
export function unescapeJsDocClose(text: string): string {
  return text.replace(/\*\\\//g, '*/');
}

/**
 * Split a JSDoc tag's content into discrete entries. A markdown bullet list
 * (lines starting with `-` or `*`) becomes one entry per bullet (marker
 * stripped, continuation lines folded in); plain prose stays a single entry.
 * This keeps `useWhen`/`avoidWhen`/`pitfalls` — which are `string[]` — as clean
 * per-item arrays so the renderer emits one bullet each, instead of wrapping a
 * whole pre-bulleted blob in another `- ` (the `- - …` double-bullet defect).
 */
function splitTagContent(raw: string): string[] {
  const lines = raw.split('\n');
  const bulleted = lines.some((line) => /^\s*[-*]\s+/.test(line));
  if (!bulleted) {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  const items: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s+(.*)$/);
    if (match) {
      items.push((match[1] ?? '').trim());
    } else if (items.length > 0 && line.trim()) {
      items[items.length - 1] += `\n${line.trim()}`;
    }
  }
  return items.filter((item) => item.length > 0);
}

interface PropertyDoc {
  description?: string;
  defaultValue?: string;
  useWhen?: string;
  avoidWhen?: string;
  pitfalls?: string;
  remarks?: string;
}

/**
 * Parse a property's leading `/** … *\/` JSDoc into a description plus the
 * `@default` / routing tags. Returns an empty object when `node` is not a
 * JSDoc comment.
 */
function parsePropertyJsDoc(node: SgNode | undefined): PropertyDoc {
  if (!node || node.kind() !== 'comment' || !node.text().startsWith('/**')) {
    return {};
  }
  const lines = node
    .text()
    .replace(/^\/\*\*/, '')
    .replace(/\s*\*\/\s*$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*? ?/, '').trimEnd());

  const descriptionLines: string[] = [];
  const tags: Record<string, string[]> = {};
  let current: string | undefined;
  for (const line of lines) {
    const tagMatch = line.match(/^@(\w+)\s?(.*)$/);
    if (tagMatch?.[1]) {
      current = tagMatch[1];
      (tags[current] ??= []).push(tagMatch[2] ?? '');
    } else if (current) {
      (tags[current] ??= []).push(line);
    } else {
      descriptionLines.push(line);
    }
  }

  const join = (key: string): string | undefined =>
    tags[key] ? unescapeJsDocClose(tags[key]!.join('\n').trim()) : undefined;
  const description = descriptionLines.join('\n').trim();
  const doc: PropertyDoc = {};
  if (description) doc.description = description;
  const defaultValue = join('default');
  if (defaultValue !== undefined) doc.defaultValue = defaultValue;
  const useWhen = join('useWhen');
  if (useWhen !== undefined) doc.useWhen = useWhen;
  const avoidWhen = join('avoidWhen');
  if (avoidWhen !== undefined) doc.avoidWhen = avoidWhen;
  const pitfalls = join('pitfalls');
  if (pitfalls !== undefined) doc.pitfalls = pitfalls;
  const remarks = join('remarks');
  if (remarks !== undefined) doc.remarks = remarks;
  return doc;
}

/** Depth-first iterator over all descendant nodes (including `root`). */
function* descendants(root: SgNode): Generator<SgNode> {
  yield root;
  for (const child of root.children()) {
    yield* descendants(child);
  }
}
