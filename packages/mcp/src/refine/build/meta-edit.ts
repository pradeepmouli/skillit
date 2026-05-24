import type { RefineTag } from '@to-skills/core';

/** Scan forward from `from`, skipping comments, and return the index of the first `{`. */
function skipToOptionsOpen(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (source[i] === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      if (i < source.length) i += 2;
    } else if (source[i] === '{') {
      return i;
    } else {
      i++;
    }
  }
  return -1;
}

/**
 * Finds the index of the opening `{` of the options object in a `server.tool(...)` call.
 *
 * Returns the index of the `{` character, or -1 if not found.
 */
function findOptionsStart(source: string, toolName: string, hintLine: number): number {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const callRe = new RegExp(`\\bserver\\.tool\\(\\s*['"]${escaped}['"]\\s*,\\s*`);

  const lines = source.split('\n');
  const windowStart = Math.max(0, hintLine - 3);
  const windowEnd = Math.min(lines.length, hintLine + 5);
  const windowLines = lines.slice(windowStart, windowEnd);
  const window = windowLines.join('\n');
  const offsetToWindow = windowStart > 0 ? lines.slice(0, windowStart).join('\n').length + 1 : 0;

  let m = window.match(callRe);
  if (!m || m.index === undefined) {
    // Fallback: search the entire source (useful for short fixtures)
    m = source.match(callRe);
    if (!m || m.index === undefined) return -1;
    return skipToOptionsOpen(source, m.index + m[0].length);
  }

  return skipToOptionsOpen(source, offsetToWindow + m.index + m[0].length);
}

/** Skip past a single- or double-quoted string literal; returns index after closing quote. */
function skipQuotedString(source: string, openIdx: number): number {
  const q = source[openIdx]!;
  let i = openIdx + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === q) return i + 1;
    i++;
  }
  return source.length;
}

/** Skip past a template literal (backtick string), including `${...}` expressions. */
function skipTemplateLiteral(source: string, openIdx: number): number {
  let i = openIdx + 1; // past opening backtick
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === '`') return i + 1; // past closing backtick
    if (source[i] === '$' && source[i + 1] === '{') {
      i += 2; // skip '${'
      let depth = 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '"' || source[i] === "'") {
          i = skipQuotedString(source, i);
          continue;
        }
        if (source[i] === '`') {
          i = skipTemplateLiteral(source, i);
          continue;
        }
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return source.length;
}

/**
 * Finds the index of the closing `}` that matches the opening `{` at `openIdx`.
 *
 * Tracks brace depth while skipping single-quoted, double-quoted, and backtick
 * template literal strings (including `${...}` expressions inside templates),
 * as well as line (//) and block (slash-star) comments whose braces must not
 * be counted as structural.
 */
function findMatchingClose(source: string, openIdx: number): number {
  let depth = 0;
  let i = openIdx;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      if (i < source.length) i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipQuotedString(source, i);
      continue;
    }
    if (ch === '`') {
      i = skipTemplateLiteral(source, i);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Returns true when `body` (the text between object braces) ends with a comma,
 * after stripping trailing whitespace, block comments, and line comments.
 * Used to avoid inserting a double-comma before a new property.
 */
function endsWithComma(body: string): boolean {
  let s = body;
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.trimEnd();
    if (s.endsWith('*/')) {
      const start = s.lastIndexOf('/*');
      if (start >= 0) s = s.slice(0, start);
      continue;
    }
    const nl = s.lastIndexOf('\n');
    const lastLine = s.slice(nl + 1).trimStart();
    if (lastLine.startsWith('//')) {
      s = nl >= 0 ? s.slice(0, nl) : '';
    }
  }
  return s.endsWith(',');
}

/**
 * Applies a `_meta` field edit to a `server.tool(...)` call in TypeScript source.
 *
 * - If no `_meta` block exists in the options object, one is inserted.
 * - If a `_meta` block exists but the `tag` field is absent, the field is added.
 * - If the `tag` field already exists inside `_meta`, its value is replaced.
 * - If the tool name is not found, the source is returned unchanged.
 */
export function applyMetaEdit(
  source: string,
  toolName: string,
  hintLine: number,
  tag: RefineTag,
  value: string
): string {
  const optionsOpenIdx = findOptionsStart(source, toolName, hintLine);
  if (optionsOpenIdx === -1) return source;

  const optionsCloseIdx = findMatchingClose(source, optionsOpenIdx);
  if (optionsCloseIdx === -1) return source;

  const optionsContent = source.slice(optionsOpenIdx, optionsCloseIdx + 1);

  // Escape the value for use in a single-quoted JS string literal
  const escapedValue = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

  // Check if _meta exists inside the options object (word-boundary prevents matching _metadata)
  const metaMatch = optionsContent.match(/_meta\b\s*:\s*\{/);

  if (!metaMatch || metaMatch.index === undefined) {
    // No _meta block — insert before the options closing }
    // Determine indentation from the options object context
    const closeLineMatch = source.slice(0, optionsCloseIdx).match(/[^\n]*$/);
    const closeLinePrefix = closeLineMatch ? closeLineMatch[0] : '';
    const indent = closeLinePrefix.match(/^\s*/)?.[0] ?? '';

    // Add a comma only when the object already has properties (non-empty body)
    // endsWithComma strips trailing comments before checking to avoid a double-comma
    // when the body ends with something like: description: 'x', /* note */
    const existingBody = source.slice(optionsOpenIdx + 1, optionsCloseIdx).trimEnd();
    const comma = existingBody.length > 0 && !endsWithComma(existingBody) ? ',' : '';

    const newInsertion = `${comma}\n${indent}  _meta: { ${tag}: '${escapedValue}' }`;
    return (
      source.slice(0, optionsCloseIdx) +
      newInsertion +
      '\n' +
      indent +
      source.slice(optionsCloseIdx)
    );
  }

  // _meta block exists — find it and its closing }
  const metaAbsoluteIdx = optionsOpenIdx + metaMatch.index;
  const metaBraceOpenIdx = metaAbsoluteIdx + metaMatch[0].length - 1; // index of the { in _meta: {
  const metaBraceCloseIdx = findMatchingClose(source, metaBraceOpenIdx);
  if (metaBraceCloseIdx === -1) return source;

  const metaContent = source.slice(metaBraceOpenIdx, metaBraceCloseIdx + 1);

  // Check if tag field already exists inside _meta
  const tagRe = new RegExp(`\\b${tag}\\s*:\\s*`);
  const tagMatch = metaContent.match(tagRe);

  if (tagMatch && tagMatch.index !== undefined) {
    // Tag exists — find and replace its value
    const tagAbsoluteIdx = metaBraceOpenIdx + tagMatch.index + tagMatch[0].length;
    // Skip leading whitespace so we replace only the string literal, not the space after ':'
    let valueStart = tagAbsoluteIdx;
    while (valueStart < source.length && /\s/.test(source[valueStart]!)) valueStart++;
    let valueEnd = valueStart;

    // Only replace quoted string literals. Non-quoted values (identifiers, template
    // literals, computed expressions) are left untouched to avoid corrupting source.
    if (source[valueEnd] !== "'" && source[valueEnd] !== '"') return source;

    const quoteChar = source[valueEnd]!;
    valueEnd++; // skip opening quote
    let innerEscaped = false;
    while (valueEnd < source.length) {
      const ch = source[valueEnd]!;
      if (innerEscaped) {
        innerEscaped = false;
      } else if (ch === '\\') {
        innerEscaped = true;
      } else if (ch === quoteChar) {
        valueEnd++; // include closing quote
        break;
      }
      valueEnd++;
    }

    return source.slice(0, valueStart) + `'${escapedValue}'` + source.slice(valueEnd);
  }

  // Tag does not exist in _meta — insert before the closing }
  const metaBody = source.slice(metaBraceOpenIdx + 1, metaBraceCloseIdx).trimEnd();
  const prefix = metaBody.length === 0 ? ' ' : endsWithComma(metaBody) ? '' : ', ';
  const insertText = `${prefix}${tag}: '${escapedValue}'`;
  return source.slice(0, metaBraceCloseIdx) + insertText + source.slice(metaBraceCloseIdx);
}
