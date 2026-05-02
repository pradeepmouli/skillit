# Contract: Audit Suggestions

## Overview

All three audit pipelines (TypeDoc, MCP, CLI) emit actionable fix suggestion templates in their findings. Suggestions are static strings with placeholder brackets — specific enough for an eval loop agent to apply directly to source code.

## TypeDoc Audit (packages/core/src/audit.ts)

Existing `suggestion` field on `AuditIssue`. Currently populated with generic text. Enhance to use skill-creator heuristic templates:

| Code | Current Suggestion                                  | Enhanced Suggestion                                                                                                                      |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F1   | "Add a meaningful description to your package.json" | `"Add to package.json: \"description\": \"[One sentence: what problem this library solves for the caller]\""`                            |
| F2   | "Add domain-specific keywords"                      | `"Add to package.json: \"keywords\": [\"[domain-verb]\", \"[domain-noun]\", \"[use-case]\", \"[integration]\", \"[pattern]\"]"`          |
| F3   | "Add a description to your README"                  | `"Add after title: > [One sentence: what this library does and why someone would use it]"`                                               |
| F4   | "Add JSDoc to [symbol]"                             | `"Add: /** [One sentence: what problem [symbol] solves for the caller] */"`                                                              |
| E1   | "Add @param description"                            | `"Add: @param [name] — [What the caller controls with this parameter — not the type, but the effect]"`                                   |
| E2   | "Add @returns description"                          | `"Add: @returns [What the caller gets back and what they do with it]"`                                                                   |
| E3   | "Add property description"                          | `"Add: /** [What this property controls — one phrase] */"`                                                                               |
| E4   | "Add an @example"                                   | `"Add @example with: import statement, setup, call, assertion/output"`                                                                   |
| E5   | "Add repository URL"                                | `"Add to package.json: \"repository\": { \"type\": \"git\", \"url\": \"[repo-url]\" }"`                                                  |
| W7   | (none currently)                                    | `"Add @useWhen to 3-5 key exports: @useWhen - [Scenario where the caller should reach for this — include non-obvious expert knowledge]"` |
| W8   | (none currently)                                    | `"Add @avoidWhen: @avoidWhen - [When NOT to use this — name the alternative]"`                                                           |
| W9   | (none currently)                                    | `"Add @never: @never - NEVER [action] — [non-obvious reason]. Fix: [recovery path]"`                                                     |

## MCP Audit (packages/mcp/src/audit/)

Add `readonly suggestion?: string` to `McpAuditIssue` (forward-declared in `packages/core/src/types.ts`).

| Code     | Finding                                      | Suggestion Template                                                                                                   |
| -------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| M1       | Tool has empty description                   | `"Add a description to the tool: [One sentence: what this tool does and when an agent should call it]"`               |
| M2       | Parameter has no description                 | `"Add description to parameter [name]: [What this parameter controls — valid values and their effects]"`              |
| M3       | Malformed `_meta.toSkills`                   | `"Fix _meta.toSkills shape: { useWhen: string[], avoidWhen?: string[], remarks?: string }"`                           |
| M3 (sub) | `_meta.toSkills.useWhen` is string not array | `"Change to array: _meta.toSkills.useWhen = [\"[scenario]\"]"`                                                        |
| M4       | Missing input schema                         | `"Add inputSchema to tool: { type: 'object', properties: { [param]: { type: '[type]', description: '[effect]' } } }"` |

## CLI Audit (packages/cli/src/ — new, minimal)

New audit for CLI-extracted skills. Operates on `ExtractedSkill` after CLI introspection. Checks:

| Code | Finding                                                                                             | Suggestion Template                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | Command has no description                                                                          | `"Add .description('[One sentence: what this command does and why]') to Commander command"`                                                             |
| C2   | Option has no description (and no correlated config interface)                                      | `"Add description to .option(): .option('[flag]', '[What this option controls — effect on behavior, not the type]')"`                                   |
| C3   | No examples / usage string                                                                          | `"Add .usage('[command] [options] <required-arg>') and .addHelpText('after', 'Examples:\\n  $ [command] [typical-args]')"`                              |
| C4   | Positional argument has no description                                                              | `"Add .argument('<[name]>', '[What this argument represents — expected format/values]')"`                                                               |
| C5   | Subcommand has no description                                                                       | `"Add .description('[One sentence]') to subcommand '[name]'"`                                                                                           |
| C6   | Option accepts env var but env var undocumented                                                     | `"Add .env('[ENV_VAR_NAME]') to option or document in help text: 'Also settable via [ENV_VAR_NAME]'"`                                                   |
| C7   | Option has empty description after correlation (neither CLI help nor config interface provided one) | `"Neither --help text nor typed config interface has a description for '[name]'. Add JSDoc to the config interface property or .option() description."` |
| C8   | Command has no @useWhen (and no correlated configSurface.useWhen)                                   | `"Add @useWhen to the config interface or .addHelpText() with scenario: when to prefer this command over alternatives"`                                 |

## Eval Loop Integration

The suggestion templates are designed so an agent can:

1. Run skill generation → get audit output
2. Parse findings with suggestions
3. Apply suggestions to source files (JSDoc, package.json, tool definitions)
4. Re-run skill generation
5. Repeat until audit is clean

The placeholder brackets (`[...]`) indicate where the agent should fill in project-specific content. The surrounding structure (JSDoc syntax, YAML shape, Commander API) is exact and copy-pasteable.

## Test Contract

1. TypeDoc F4 finding for `renderSkill` includes text matching `/\[.*problem.*renderSkill.*solves\]/`
2. TypeDoc E1 finding for `@param options` includes text matching `/@param options —/`
3. MCP M1 finding includes text matching `/description.*tool/i`
4. MCP M3 finding for malformed useWhen includes text matching `/useWhen.*string\[\]/`
5. CLI C1 finding includes text matching `/\.description\(/`
6. CLI C4 finding for unnamed argument includes text matching `/\.argument\(/`
7. CLI C7 finding for uncorrelated option includes text matching `/neither.*help.*config/i`
8. All existing audit tests pass (suggestions are additive, don't change severity/code/message)
