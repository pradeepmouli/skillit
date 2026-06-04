# @skillit/mcp

> Extract and bundle MCP servers as Agent Skills — one extractor, every agent.

Introspects live Model Context Protocol (MCP) servers via stdio or HTTP and produces progressive-disclosure `SKILL.md` output consumable by MCP-native agents (via `mcp:` frontmatter) or non-MCP agents (via CLI-as-proxy adapters).

Part of the [skillit](https://github.com/pradeepmouli/skillit) monorepo. Designed against the spec at [`specs/001-mcp-extract-bundle/`](../../specs/001-mcp-extract-bundle/) — see `spec.md` for user stories and `spec-deltas.md` for the small set of decisions that diverge from the original spec.

---

## Install

```bash
npm install --save-dev @skillit/mcp
# Plus any non-default invocation adapters you intend to use:
npm install --save-dev @skillit/target-mcpc       # mcpc CLI proxy
npm install --save-dev @skillit/target-fastmcp    # fastmcp Python CLI proxy
# (`@skillit/target-mcp-protocol` ships with @skillit/mcp.)
```

Requires Node.js ≥ 20.

---

## Extract: connect to a live server, write a SKILL.md

Three transports are supported:

```bash
# Stdio (the typical case — npx-launched servers)
npx skillit mcp extract \
  --command "npx -y @modelcontextprotocol/server-filesystem /tmp" \
  --out ./skills

# HTTP / SSE
npx skillit mcp extract \
  --url https://example.com/mcp \
  --header "Authorization=Bearer $TOKEN" \
  --out ./skills

# Batch over an MCP config file (`mcp.json` or Claude-Desktop's
# `claude_desktop_config.json`)
npx skillit mcp extract \
  --config ~/.config/claude/claude_desktop_config.json \
  --out ./skills
```

Useful flags:

| Flag                    | Meaning                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `--invocation <target>` | Render with a specific invocation target (default `mcp-protocol`). Repeat for multi-target output. |
| `--install-target <d>`  | Also install generated skills into an agent discovery directory. Repeat for multiple targets.      |
| `--max-tokens <n>`      | Per reference-file token budget (default 4000).                                                    |
| `--llms-txt`            | Emit `llms.txt` next to `SKILL.md` per [llmstxt.org](https://llmstxt.org/).                        |
| `--skip-audit`          | Skip the post-render audit (M1–M4 rules).                                                          |
| `--force`               | Overwrite an existing skill directory.                                                             |
| `--skill-name <name>`   | Override the directory name (default: server's `serverInfo.name`).                                 |

Exit codes are documented in [`src/bin.ts`](src/bin.ts).

When `--install-target` is set, the CLI also installs the bundled
`skillit-mcp-docs` guidance skill beside the generated MCP skill. Bundled
skills are version-aware: newer packaged copies replace older packaged copies,
while custom or unversioned copies are preserved.

---

## Bundle: ship a skill with your MCP server package

Add a `skillit.mcp` field to your package's `package.json`:

```json
{
  "name": "@myorg/my-mcp-server",
  "bin": "./dist/server.js",
  "files": ["dist", "skills"],
  "scripts": {
    "build": "tsc",
    "postbuild": "skillit mcp bundle"
  },
  "skillit": {
    "mcp": { "skillName": "my-server" }
  },
  "devDependencies": {
    "@skillit/mcp": "^0.1.0"
  }
}
```

Run:

```bash
npm run build
```

Output lands at `<packageRoot>/skills/<skillName>/`. The emitted SKILL.md instructs MCP-native harnesses to launch the server via `npx -y <packageName>` so consumers don't need a separate install.

Multi-server packages declare an array of entries (one per `bin`):

```json
"skillit": {
  "mcp": [
    { "skillName": "server-a", "binName": "server-a" },
    { "skillName": "server-b", "binName": "server-b" }
  ]
}
```

---

## Programmatic API

```ts
import { extractMcpSkill, bundleMcpSkill } from '@skillit/mcp';
import { renderSkill, writeSkills } from '@skillit/core';
import McpProtocolAdapter from '@skillit/target-mcp-protocol';

// Extract → render → write yourself, e.g. inside a custom build pipeline:
const skill = await extractMcpSkill({
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
  }
});
// Pass an invocation adapter explicitly — `renderSkill` does NOT auto-load
// `mcp-protocol`. Use `loadAdapterAsync('mcp-protocol')` if you'd rather
// resolve via the loader (matches the CLI behavior).
const rendered = await renderSkill(skill, {
  invocation: McpProtocolAdapter,
  invocationLaunchCommand: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
  }
});
writeSkills([rendered], { outDir: './skills' });

// Or run the full bundle pipeline (reads `skillit.mcp` from package.json):
const result = await bundleMcpSkill({
  packageRoot: process.cwd(),
  installTargets: ['.claude/skills']
});
console.log(result.skills, result.failures);
```

Public entry points:

- [`extractMcpSkill`](src/extract.ts) — connects to a live server and returns an `ExtractedSkill` IR.
- [`bundleMcpSkill`](src/bundle.ts) — full bundle pipeline keyed off `package.json`.
- [`renderSkill`](../core/src/renderer.ts) (re-exported from `@skillit/core`) — turns the IR into `SKILL.md` + reference files.
- [`McpError`](src/errors.ts) — error class with stable `code` for exit-code mapping.

---

## Invocation adapters

The IR is target-agnostic. Adapters select the rendering dialect:

| Target                   | Package                        | Use when                                                                                    |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------- |
| `mcp-protocol` (default) | `@skillit/target-mcp-protocol` | Agent harness speaks MCP natively (Claude Code, Cursor, OpenCode).                          |
| `cli:mcpc`               | `@skillit/target-mcpc`         | Harness only runs shell commands; route through [mcpc](https://www.npmjs.com/package/mcpc). |
| `cli:fastmcp`            | `@skillit/target-fastmcp`      | Harness only runs shell; route through fastmcp's Python CLI.                                |

Building your own? See [`docs/adapter-authoring.md`](docs/adapter-authoring.md).

---

## Further reading

- [`specs/001-mcp-extract-bundle/quickstart.md`](../../specs/001-mcp-extract-bundle/quickstart.md) — three full walkthroughs (extract, bundle, multi-target).
- [`specs/001-mcp-extract-bundle/spec.md`](../../specs/001-mcp-extract-bundle/spec.md) — the source-of-truth spec.
- [`specs/001-mcp-extract-bundle/spec-deltas.md`](../../specs/001-mcp-extract-bundle/spec-deltas.md) — implementation deltas from the spec.

## License

MIT
