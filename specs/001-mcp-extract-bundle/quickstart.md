# Quickstart — `@skillit/mcp`

Three short walkthroughs covering the three primary user stories. Each takes under five minutes. All commands assume Node ≥20 and a working `npx`.

---

## 1. Extract a skill from a third-party MCP server (US1)

**Goal**: generate a SKILL.md for the reference `@modelcontextprotocol/server-filesystem` so your agents can reference it without connecting.

```bash
npx @skillit/mcp extract \
  --command "npx -y @modelcontextprotocol/server-filesystem /tmp" \
  --out ./skills
```

Expected output:

```text
skills/
└── filesystem/
    ├── SKILL.md
    └── references/
        └── tools.md
```

Inspect `skills/filesystem/SKILL.md`:

```markdown
---
name: filesystem
description: 'Secure file system access scoped to /tmp...'
license: MIT
mcp:
  filesystem:
    command: npx
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
---

## Quick Reference

| Tool       | Description                           |
| ---------- | ------------------------------------- |
| read_file  | Read the contents of a file           |
| write_file | Write to a file (create or overwrite) |

...
```

The `mcp:` block is what OpenCode / Codex / Cursor consume to wire up the server automatically. You're done — commit `skills/` and your agent has persistent documentation for the server without an active connection.

---

## 2. Bundle an MCP server with its own skill (US4)

**Goal**: ship one npm package that's consumable both as an MCP server AND as an agent skill.

Edit `package.json`:

```json
{
  "name": "@myorg/my-mcp-server",
  "version": "1.0.0",
  "bin": "./dist/server.js",
  "files": ["dist", "skills"],
  "scripts": {
    "build": "tsc",
    "postbuild": "to-skills-mcp bundle"
  },
  "to-skills": {
    "mcp": { "skillName": "my-server" }
  },
  "devDependencies": {
    "@skillit/mcp": "^1.0.0"
  }
}
```

Build:

```bash
pnpm build
```

The `postbuild` step runs `to-skills-mcp bundle`, which:

1. Reads `to-skills.mcp` from package.json.
2. Launches `node ./dist/server.js` (derived from `bin`).
3. Introspects the server via MCP.
4. Writes `skills/my-server/SKILL.md` with frontmatter referencing the package by name:

   ```yaml
   mcp:
     my-server:
       command: npx
       args: ['-y', '@myorg/my-mcp-server']
   ```

5. Closes the server.
6. Audits the generated skill; exits non-zero if any error-severity issue is found.

Publish with `npm publish`. Consumers now have two paths:

**As an MCP server** — add to their MCP client config:

```json
{ "command": "npx", "args": ["-y", "@myorg/my-mcp-server"] }
```

**As a skill** — install into their skills directory:

```bash
npx skills add @myorg/my-mcp-server
```

Both paths resolve to the same published artifact.

---

## 3. Emit a skill for a non-MCP agent via CLI invocation target (US5)

**Goal**: use the same MCP server from an agent harness that only has a shell tool.

Prereq — install the CLI you'll target:

```bash
npm install -g mcpc
```

Extract with the CLI target:

```bash
npx @skillit/mcp extract \
  --command "npx -y @modelcontextprotocol/server-filesystem /tmp" \
  --invocation cli:mcpc \
  --out ./skills
```

Output shape differs from §1:

````markdown
---
name: filesystem
description: '...'
license: MIT
generated-by:
  adapter: '@skillit/target-mcpc'
  version: '1.0.0'
  target-cli-range: 'mcpc@^2.1'
---

## Setup

One-time: install `mcpc` and connect to this server.

```bash
npm install -g mcpc
mcpc connect @filesystem "npx -y @modelcontextprotocol/server-filesystem /tmp"
```
````

## Quick Reference

| Command                                                                  | Description                 |
| ------------------------------------------------------------------------ | --------------------------- |
| `mcpc @filesystem tools-call read_file path:=<path>`                     | Read the contents of a file |
| `mcpc @filesystem tools-call write_file path:=<path> content:=<content>` | Write to a file             |

...

````

No `mcp:` frontmatter — the agent doesn't need MCP support. It reads SKILL.md, sees shell commands, and runs them. The CLI (`mcpc`) handles the MCP protocol transparently.

Emit BOTH targets in one run:

```bash
npx @skillit/mcp extract \
  --command "npx -y @modelcontextprotocol/server-filesystem /tmp" \
  --invocation mcp-protocol \
  --invocation cli:mcpc \
  --out ./skills
````

Produces:

```text
skills/
├── filesystem-mcp-protocol/    # for MCP-native agents
└── filesystem-mcpc/             # for shell-only agents
```

One extraction, two consumption paths.

---

## Programmatic usage (US6)

For CI pipelines that want to compose with `@skillit/typedoc` or other extractors:

```typescript
import { extractMcpSkill, loadAdapter } from '@skillit/mcp';
import { renderSkill } from '@skillit/core';
import { writeSkill } from '@skillit/core/writer';

const skill = await extractMcpSkill({
  transport: { type: 'stdio', command: 'node', args: ['./server.js'] }
});

// Render for MCP-native agents
const mcpOutput = await renderSkill(skill, {
  outDir: './skills/server-mcp-protocol',
  maxTokens: 4000,
  invocation: loadAdapter('mcp-protocol')
});

// Render again for shell agents — no re-extraction
const cliOutput = await renderSkill(skill, {
  outDir: './skills/server-mcpc',
  maxTokens: 4000,
  invocation: loadAdapter('cli:mcpc')
});

await Promise.all([writeSkill(mcpOutput), writeSkill(cliOutput)]);
```

Key property (SC-011): `extractMcpSkill` runs once; rendering is target-agnostic and idempotent.

---

## Troubleshooting

| Symptom                            | Cause                                               | Fix                                                                                                                      |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ADAPTER_NOT_FOUND: cli:foo`       | Adapter package not installed                       | `npm install @skillit/target-foo`                                                                                        |
| `MISSING_LAUNCH_COMMAND`           | Bundle mode, no `bin`, no `command` override        | Add `bin` to package.json or `command`/`args` to `to-skills.mcp`                                                         |
| `SCHEMA_REF_CYCLE: tool 'X'`       | Tool's `inputSchema` uses recursive `$ref`          | Server-side bug; the tool is still documented, just without parameter table                                              |
| `DUPLICATE_SKILL_NAME: filesystem` | Re-running without `--force` overwrite              | Add `--force` flag                                                                                                       |
| `PROTOCOL_VERSION_UNSUPPORTED`     | Server uses newer spec than SDK                     | Update `@skillit/mcp` to pull in a newer `@modelcontextprotocol/sdk`                                                     |
| Generated CLI commands don't parse | Target CLI upgraded past the adapter's pinned range | Regenerate: `npm update @skillit/target-<n> && to-skills-mcp extract ...` (freshness warning in next audit will confirm) |

---

## What this quickstart doesn't cover

- Audit configuration (see `contracts/cli.md` `--skip-audit` flag).
- Writing a third-party adapter (see `contracts/adapter.md`).
- Token budgeting tuning (`--max-tokens` flag; defaults are good for most servers).
- `llms.txt` output (`--llms-txt` flag, toggles the same emitter `@skillit/typedoc` uses).
