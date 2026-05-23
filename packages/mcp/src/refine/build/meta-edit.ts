import type { RefineTag } from '@to-skills/core';

/**
 * Finds the index of the opening `{` of the options object in a `server.tool(...)` call.
 *
 * Returns the index of the `{` character, or -1 if not found.
 */
function findOptionsStart(source: string, toolName: string, hintLine: number): number {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const callRe = new RegExp(`server\\.tool\\(\\s*['"]${escaped}['"]\\s*,\\s*`);

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
    const afterMatch = m.index + m[0].length;
    // Scan forward to find the opening {
    for (let i = afterMatch; i < source.length; i++) {
      if (source[i] === '{') return i;
    }
    return -1;
  }

  const afterMatch = offsetToWindow + m.index + m[0].length;
  // Scan forward to find the opening {
  for (let i = afterMatch; i < source.length; i++) {
    if (source[i] === '{') return i;
  }
  return -1;
}

/**
 * Finds the index of the closing `}` that matches the opening `{` at `openIdx`.
 *
 * Tracks brace depth while skipping characters inside string literals.
 */
function findMatchingClose(source: string, openIdx: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (inString) {
      if (ch === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
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

  // Escape the value for use in a single-quoted JS string (escape backslashes and single quotes)
  const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // Check if _meta exists inside the options object
  const metaMatch = optionsContent.match(/_meta\s*:\s*\{/);

  if (!metaMatch || metaMatch.index === undefined) {
    // No _meta block — insert before the options closing }
    const insertion = `\n    _meta: { ${tag}: '${escapedValue}' }`;
    // Find the last character before the closing } (handle trailing whitespace/newlines)
    const beforeClose = source.slice(optionsOpenIdx, optionsCloseIdx);
    // Determine indentation from the options object context
    const closeLineMatch = source.slice(0, optionsCloseIdx).match(/[^\n]*$/);
    const closeLinePrefix = closeLineMatch ? closeLineMatch[0] : '';
    const indent = closeLinePrefix.match(/^\s*/)?.[0] ?? '';

    const newInsertion = `\n${indent}  _meta: { ${tag}: '${escapedValue}' }`;
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
    // The value starts at tagAbsoluteIdx; find where it ends (string literal)
    const valueStart = tagAbsoluteIdx;
    let valueEnd = valueStart;

    // Skip leading whitespace
    while (valueEnd < source.length && /\s/.test(source[valueEnd]!)) valueEnd++;

    if (source[valueEnd] === "'" || source[valueEnd] === '"') {
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
    }

    return source.slice(0, valueStart) + `'${escapedValue}'` + source.slice(valueEnd);
  }

  // Tag does not exist in _meta — insert before the closing }
  const insertText = `, ${tag}: '${escapedValue}'`;
  return source.slice(0, metaBraceCloseIdx) + insertText + source.slice(metaBraceCloseIdx);
}
