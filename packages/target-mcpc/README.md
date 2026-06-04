# @skillit/target-mcpc

> CLI-as-proxy invocation-target adapter for `@skillit/mcp`. Emits shell-command skills that use Apify's [`mcpc`](https://github.com/apify/mcpc) CLI to invoke MCP tools.

Pairs with [`@skillit/mcp`](../mcp/). Where `@skillit/target-mcp-protocol` emits `mcp:` frontmatter for harnesses that hold an MCP session natively, `@skillit/target-mcpc` emits a SKILL.md whose body is a series of shell commands the agent runs through its standard shell tool. The CLI terminates the MCP protocol at the shell boundary; the agent never sees MCP.

Target CLI: **`mcpc@^2.1`**.

---

## Install

```bash
npm install --save-dev @skillit/target-mcpc
```

The adapter is loaded by `@skillit/mcp` on demand when you pass `--invocation cli:mcpc`. You also need `mcpc` available at run time on whatever machine consumes the skill — see Setup commands below.

---

## When to pick this target

Pick `cli:mcpc` when **the agent harness has a shell tool but cannot speak MCP natively**. Typical cases:

- Pipelines orchestrated by `gh` workflow runners or generic shell agents.
- IDE-side agents whose tool surface is `bash` only (no `mcp:` reader).
- Any time you'd rather give a non-MCP agent a "run this CLI" recipe than wire up a custom proxy.

---

## What it emits

A `SKILL.md` body whose Tools section pairs each MCP tool with its concrete shell invocation:

````markdown
## connect

Establish an outbound connection to a peer.

```sh
mcpc collision-server tools-call connect host=<value> port:=<value>
```

### Parameters

| MCP Name | CLI Flag/Key  | Type   | Required | Description   |
| -------- | ------------- | ------ | -------- | ------------- |
| host     | host=<value>  | string | yes      | Peer hostname |
| port     | port:=<value> | number | yes      | Peer TCP port |
````

Plus a Setup section with one-time install + `mcpc connect` registration commands, and a `generated-by:` frontmatter block carrying the adapter fingerprint (per FR-IT-012 — used by the M5 freshness audit to detect drift between rendered output and the installed adapter version).

---

## Argument encoding

mcpc parses each positional after `tools-call <tool>` as `KEY=VALUE` (literal string) or `KEY:=VALUE` (JSON-typed). The adapter classifies each parameter via the host's shared `classifyParameters` helper and emits the appropriate form (driven by `args.ts`):

| Tier | Per-parameter form                                                                              | Used when                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | `key=<value>` (string scalar / enum) **or** `key:=<value>` (number/integer/bool / string-array) | Parameter is a scalar, enum, or simple string array — encoder picks `:=` for typed, `=` for literal-string. |
| 2    | `parent.child=<value>` / `parent.child:=<value>` (dotted, same string-vs-typed rule)            | Parameter is a flat object whose every leaf is itself a Tier-1 type — flattened into dotted keys.           |
| 3    | One additional `--json '<JSON-payload>'` flag for the whole tool call                           | Any parameter that doesn't fit Tier 1 or 2 (nested objects deeper than one level, arrays of objects, $ref). |

The Parameters table in the rendered Markdown shows both the tier and the literal CLI form per parameter so the consumer can copy-paste with confidence.

---

## Setup commands

The Setup section the adapter emits looks like this (verbatim):

```sh
# 1. Install mcpc (CLI for invoking MCP servers from shells; tested with mcpc 2.x)
npm install -g mcpc

# 2. Register this server with mcpc
mcpc connect <skill-name> -- <launchCommand>

# 3. (Optional) Verify the registration
mcpc list
```

The `mcpc connect <skill-name> -- ...` line is intentional: `connect` is a reserved mcpc subcommand that registers a server, and `<skill-name>` lands in the slot that mcpc parses as the connection name. This is unrelated to (and does not collide with) any MCP tool also named `connect` — tool dispatch lives at `mcpc <skill-name> tools-call <tool>`, where the tool name occupies a different positional slot.

---

## Adapter contract

| Field                        | Value                                         |
| ---------------------------- | --------------------------------------------- |
| `target`                     | `'cli:mcpc'`                                  |
| `fingerprint.adapter`        | `'@skillit/target-mcpc'`                      |
| `fingerprint.version`        | This package's `version` from `package.json`. |
| `fingerprint.targetCliRange` | `'mcpc@^2.1'`                                 |

Future major versions of mcpc that change the `tools-call` arg shape MUST bump this adapter's major version and update `targetCliRange` so the freshness audit (M5) can detect drift.

---

## Programmatic use

```ts
import McpcAdapter from '@skillit/target-mcpc';
import { renderSkill } from '@skillit/core';

const rendered = await renderSkill(skill, { invocation: McpcAdapter });
```

---

## Further reading

- [`@skillit/mcp` README](../mcp/README.md) — host package, CLI usage.
- [`docs/adapter-authoring.md`](../mcp/docs/adapter-authoring.md) — building your own invocation adapter.

## License

MIT
