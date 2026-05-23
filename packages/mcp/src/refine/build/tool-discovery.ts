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

export function discoverTools(file: string, source: string): DiscoveryResult {
  const tools = new Map<string, ToolLocation>();
  const warnings: string[] = [];

  for (const match of source.matchAll(TOOL_CALL_RE)) {
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
