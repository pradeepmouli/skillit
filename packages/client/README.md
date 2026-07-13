# @skillit/client

> The `skillit` command-line interface: generate, audit, and refine AI-agent
> skills from a TypeScript codebase, plus the Anthropic model client that powers
> the headless refine loop.

`@skillit/client` ships the `skillit` binary. It ties together the skillit
source extractors (`@skillit/cli`, `@skillit/mcp`, `@skillit/core`) behind one
CLI, and provides the Anthropic-backed `ModelClient` used by `skillit refine`
when run without an agent.

## Commands

| Command          | What it does                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `skillit gen`    | Deterministically (re)generate the skill from current source — no model, no install.                 |
| `skillit audit`  | Audit + judge the generated skill; `--json` emits the full report with per-finding source locations. |
| `skillit init`   | Detect the project and install the matching `@skillit/*` package (install/wire only).                |
| `skillit refine` | Headless audit → draft → review loop that writes routing annotations back into source.               |
| `skillit mcp`    | Extract / bundle skills from a live MCP server.                                                      |

`skillit init` now also scaffolds a `skillit.config.ts` file (if none exists),
so you can set a global `skillDir` and per-source (`cli` / `config` / `mcp` /
`typedoc`) overrides.

## Quick start

```bash
# Install
npm install --save-dev @skillit/client

# Generate a skill from a Commander CLI
skillit gen --source cli --program ./dist/cli.js#program

# Check its grade and findings as JSON
skillit audit --source cli --program ./dist/cli.js#program --json
```

For the agent-driven workflow (recommended), use the bundled
`/skillit-bootstrap` skill. This package includes the skill files, and generated
CLI packages wired by `skillit init` install bundled skills to user roots via
postinstall: Claude (`~/.claude/skills`), Copilot (`~/.copilot/skills`), and
Codex (`~/.agents/skills`).

## License

MIT
