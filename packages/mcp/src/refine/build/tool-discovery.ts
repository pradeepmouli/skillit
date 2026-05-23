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
 * Replace comment and template-literal content with spaces so that match
 * indices remain valid for line-number computation. Newlines are preserved to
 * keep line counts accurate. Single- and double-quoted string contents are
 * intentionally kept — tool names live inside those strings.
 *
 * Template literal bodies are blanked to prevent fixture/test strings of the
 * form `server.tool('fake', ...)` from being treated as real declarations.
 * The `${...}` expression depth is tracked so the backtick that closes the
 * literal is identified correctly even when expressions contain braces.
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
    } else if (source[i] === '`') {
      out += '`';
      i++;
      let exprDepth = 0;
      while (i < source.length) {
        const ch = source[i]!;
        if (ch === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (exprDepth === 0 && ch === '`') {
          out += '`';
          i++;
          break;
        }
        if (ch === '$' && source[i + 1] === '{') {
          exprDepth++;
          out += '${';
          i += 2;
          continue;
        }
        if (exprDepth > 0 && ch === '{') {
          exprDepth++;
          out += ' ';
          i++;
          continue;
        }
        if (exprDepth > 0 && ch === '}') {
          exprDepth--;
          out += exprDepth === 0 ? '}' : ' ';
          i++;
          continue;
        }
        out += ch === '\n' ? '\n' : ' ';
        i++;
      }
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
    const afterComma = sanitized.slice(match.index! + match[0].length).trimStart();

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
