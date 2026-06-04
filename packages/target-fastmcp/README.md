# @skillit/target-fastmcp

> CLI-as-proxy invocation-target adapter for `@skillit/mcp`. Emits shell-command skills that use the [fastmcp](https://gofastmcp.com) Python CLI to invoke MCP tools.

Pairs with [`@skillit/mcp`](../mcp/). Where `@skillit/target-mcp-protocol` emits `mcp:` frontmatter for harnesses that hold an MCP session natively, `@skillit/target-fastmcp` emits a SKILL.md whose body is a series of shell commands the agent runs through its standard shell tool. The CLI terminates the MCP protocol at the shell boundary; the agent never sees MCP.

Target CLI: **`fastmcp@^2`** (Python, installed via `pip install fastmcp`).

---

## Install

```bash
npm install --save-dev @skillit/target-fastmcp
```

The adapter is loaded by `@skillit/mcp` on demand when you pass `--invocation cli:fastmcp`. Consumers of the rendered SKILL.md additionally need a Python environment with `fastmcp` installed — see Setup commands below.

---

## When to pick this target

Pick `cli:fastmcp` when **the agent harness has a shell tool but cannot speak MCP natively**, AND you prefer the Python `fastmcp` CLI to Node-based alternatives. Common reasons:

- Your team already deploys Python; another Node CLI would be the only Node dep.
- You want to use fastmcp's richer Python-side ergonomics (server authoring, debugging) end-to-end.
- The harness machine has Python pre-installed but not Node.

If neither of those applies, `cli:mcpc` is the lighter alternative — see [`@skillit/target-mcpc`](../target-mcpc/).

---

## What it emits

A `SKILL.md` body whose Tools section pairs each MCP tool with its concrete shell invocation:

````markdown
## search

Search the index.

```sh
pyfastmcp call my-server search query=<value>
```

### Parameters

| MCP Name | CLI Flag/Key  | Type   | Required | Description  |
| -------- | ------------- | ------ | -------- | ------------ |
| query    | query=<value> | string | yes      | Query string |
````

Plus a Setup section with one-time install + connection registration commands, and a `generated-by:` frontmatter block carrying the adapter fingerprint.

---

## Argument encoding

The fastmcp CLI parses each positional after `call <server> <tool>` as `key=value`. Unlike mcpc, fastmcp does not currently expose a typed-literal form (`:=`) — every value is passed as a string and the server-side schema validator coerces. The adapter:

- Emits `key=<value>` for every parameter (Tier 1).
- Falls back to a single `--input-json '<JSON-payload>'` flag when any parameter is a complex object or array that wouldn't survive shell tokenization (Tier 3).

The Parameters table in the rendered Markdown shows the literal CLI form so the consumer can copy-paste with confidence.

---

## Setup commands

The Setup section the adapter emits looks like this (verbatim):

```sh
# 1. Install fastmcp (Python CLI for invoking MCP servers; tested with fastmcp 2.x)
pip install fastmcp

# 2. Register this server (the renderer emits `pyfastmcp connect`, fastmcp's
#    Python CLI binary name; some distributions alias it to `fastmcp`)
pyfastmcp connect <skill-name> -- <launchCommand>

# 3. (Optional) Verify the registration
pyfastmcp list
```

---

## Adapter contract

| Field                        | Value                                         |
| ---------------------------- | --------------------------------------------- |
| `target`                     | `'cli:fastmcp'`                               |
| `fingerprint.adapter`        | `'@skillit/target-fastmcp'`                   |
| `fingerprint.version`        | This package's `version` from `package.json`. |
| `fingerprint.targetCliRange` | `'fastmcp@^2'`                                |

Future major versions of fastmcp that change the `call` arg shape MUST bump this adapter's major version and update `targetCliRange` so the freshness audit (M5) can detect drift.

---

## Programmatic use

```ts
import FastMcpAdapter from '@skillit/target-fastmcp';
import { renderSkill } from '@skillit/core';

const rendered = await renderSkill(skill, { invocation: FastMcpAdapter });
```

---

## Further reading

- [`@skillit/mcp` README](../mcp/README.md) — host package, CLI usage.
- [`docs/adapter-authoring.md`](../mcp/docs/adapter-authoring.md) — building your own invocation adapter.

## License

MIT
