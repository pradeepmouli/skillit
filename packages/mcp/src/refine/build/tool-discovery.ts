export interface ToolLocation {
  file: string;
  line: number;
}

export interface DiscoveryResult {
  tools: Map<string, ToolLocation>;
  warnings: string[];
}

// Matches: server.tool( 'name', ...  — capture group 1 is the tool name
const TOOL_CALL_RE = /server\.tool\(\s*['"]([^'"]+)['"]\s*,\s*/g;

// Matches an options object as the next token
const OPTIONS_OBJ_RE = /^\{/;

/**
 * Replace line and block comment content with same-length spaces so that
 * match indices remain valid for line-number computation. Newlines inside
 * block comments are preserved to keep line counts accurate. String literal
 * contents are intentionally NOT stripped — tool names live inside strings.
 *
 * Limitation: a `//` inside a string literal triggers erroneous stripping of
 * the rest of that line. This edge case is rare enough in practice (the regex
 * already requires the specific pattern `server.tool(`) that it's acceptable.
 */
function sanitizeComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '/') {
      const start = i;
      while (i < source.length && source[i] !== '\n') i++;
      out += ' '.repeat(i - start);
    } else if (source[i] === '/' && source[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else {
      out += source[i]!;
      i++;
    }
  }
  return out;
}

export function discoverTools(file: string, source: string): DiscoveryResult {
  const tools = new Map<string, ToolLocation>();
  const warnings: string[] = [];
  const sanitized = sanitizeComments(source);

  for (const match of sanitized.matchAll(TOOL_CALL_RE)) {
    const name = match[1]!;
    const afterComma = source.slice(match.index! + match[0].length).trimStart();

    if (!OPTIONS_OBJ_RE.test(afterComma)) {
      warnings.push(
        `tool '${name}' uses minimal form; add a metadata object to enable annotation.`
      );
      continue;
    }

    const lineNumber = source.slice(0, match.index).split('\n').length;
    tools.set(name, { file, line: lineNumber });
  }

  return { tools, warnings };
}
