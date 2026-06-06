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
 * Returns `undefined` when no matching type declaration is found.
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
function findTypeBody(root: SgNode, typeName: string): SgNode | undefined {
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

/** Walk every `property_signature` directly under `bodyNode`. */
function walkProperties(bodyNode: SgNode, prefix: string): ExtractedConfigOption[] {
  const options: ExtractedConfigOption[] = [];
  for (const child of bodyNode.children()) {
    if (child.kind() !== 'property_signature') continue;
    const nameNode = child.field('name');
    if (!nameNode) continue;
    const name = nameNode.text();
    const configKey = prefix ? `${prefix}.${name}` : name;

    // type_annotation text is `: <type>`; strip the leading colon/space.
    const typeNode = child.field('type');
    const typeText = (typeNode?.text() ?? '').replace(/^\s*:\s*/, '').trim();

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
    if (doc.useWhen) option.useWhen = [doc.useWhen];
    if (doc.avoidWhen) option.avoidWhen = [doc.avoidWhen];
    if (doc.pitfalls) option.pitfalls = [doc.pitfalls];
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
    tags[key] ? tags[key]!.join('\n').trim() : undefined;
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
