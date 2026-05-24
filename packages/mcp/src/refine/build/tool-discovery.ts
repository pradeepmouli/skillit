export interface ToolLocation {
  file: string;
  line: number;
}

export interface DiscoveryResult {
  tools: Map<string, ToolLocation>;
  warnings: string[];
}

// Locates server.tool( calls in sanitized source; name chars are blanked.
// \b prevents matching on myserver.tool( or getServer.tool( substrings.
const TOOL_CALL_RE = /\bserver\.tool\(\s*['"][^'"]*['"]\s*,\s*/g;

// Extracts the real tool name from source at the same position.
const TOOL_NAME_RE = /^\bserver\.tool\(\s*(['"])([^'"]+)\1\s*,\s*/;

// Matches an options object as the next token
const OPTIONS_OBJ_RE = /^\{/;

/**
 * Replace comment, template-literal, and quoted-string content with spaces so
 * that match indices remain valid for line-number computation. Newlines are
 * preserved to keep line counts accurate.
 *
 * Blanking quoted-string contents prevents fixture code like
 * `const src = "server.tool('fake', ...)"` from being matched as a real tool
 * declaration. Since positions are preserved 1:1, the tool name is then read
 * from the original source at the same index.
 *
 * Template literal `${...}` expression depth is tracked so the closing backtick
 * is identified correctly even when expressions contain braces.
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
    } else if (source[i] === '"' || source[i] === "'") {
      const q = source[i]!;
      out += q;
      i++;
      while (i < source.length) {
        const ch = source[i]!;
        if (ch === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (ch === q) {
          out += q;
          i++;
          break;
        }
        out += ch === '\n' ? '\n' : ' ';
        i++;
      }
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
    // Tool name chars are blanked in sanitized — read the real name from source.
    const nameMatch = source.slice(match.index!).match(TOOL_NAME_RE);
    if (!nameMatch) continue;
    const name = nameMatch[2]!;

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
