# Contract: CLI

**Binary**: `to-skills-mcp` (exposed via `bin` field in `@skillit/mcp` package.json).
**Invocation forms**: `npx @skillit/mcp <subcommand>` or `to-skills-mcp <subcommand>` when globally installed.

---

## `extract` subcommand

**FR references**: FR-023 through FR-028, FR-IT-001, FR-IT-002.

### Synopsis

```text
to-skills-mcp extract [--command <cmd> [--arg <a>]...  |  --url <url>  |  --config <file>]
                      [--header "K: V"]... [--env K=V]...
                      [--invocation <target>]...
                      [--out <dir>] [--max-tokens <n>] [--llms-txt]
                      [--force] [--skip-audit]
                      [--canonicalize | --no-canonicalize]
```

### Flags

| Flag                                   | Type     | Default            | Notes                                                                            |
| -------------------------------------- | -------- | ------------------ | -------------------------------------------------------------------------------- |
| `--command <cmd>`                      | string   | —                  | Stdio server launch command. Mutually exclusive with `--url`, `--config`.        |
| `--arg <a>`                            | string[] | `[]`               | Repeatable. Appended to `--command`.                                             |
| `--env K=V`                            | string[] | `[]`               | Repeatable. Appended to stdio env.                                               |
| `--url <url>`                          | string   | —                  | HTTP MCP endpoint. Mutually exclusive with `--command`, `--config`.              |
| `--header "K: V"`                      | string[] | `[]`               | Repeatable. Forwarded on every HTTP request.                                     |
| `--config <file>`                      | path     | —                  | Claude-Desktop-shaped config file. Mutually exclusive with `--command`, `--url`. |
| `--invocation <target>`                | string[] | `['mcp-protocol']` | Repeatable. Each value is `mcp-protocol` or `cli:<name>`.                        |
| `--out <dir>`                          | path     | `skills`           | Output root directory.                                                           |
| `--max-tokens <n>`                     | integer  | `4000`             | Token budget per reference file.                                                 |
| `--llms-txt`                           | flag     | off                | Emit `llms.txt` alongside skills.                                                |
| `--force`                              | flag     | off                | Overwrite existing skill directories on collision.                               |
| `--skip-audit`                         | flag     | off                | Skip the audit pass entirely.                                                    |
| `--canonicalize` / `--no-canonicalize` | flag     | on                 | Toggle the content-canonicalization pass. Off is escape hatch only.              |

### Mutually exclusive groups

- `--command` | `--url` | `--config` — exactly one required.

### Exit codes

| Code | Meaning                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | All servers extracted and rendered successfully.                                                                                                                              |
| 1    | One or more servers failed (transport error, initialize failure, protocol version mismatch). Other servers in a config file are still attempted; stderr reports which failed. |
| 2    | Misuse — flag conflict, missing required flag, invalid argument format, unknown invocation target.                                                                            |
| 3    | Audit failure at `error` or `fatal` severity when `--skip-audit` not set.                                                                                                     |

### stderr format

Each diagnostic is one line, prefixed with severity and code:

```text
[error M2 filesystem] tool 'read_file' has no inputSchema — parameter table omitted
[fatal E1 server-everything] initialize handshake failed: connection refused
```

### Examples

```bash
# Local stdio server
npx @skillit/mcp extract \
  --command "npx -y @modelcontextprotocol/server-filesystem /tmp" \
  --out skills/

# Remote HTTP server with auth
npx @skillit/mcp extract \
  --url https://mcp.example.com/sse \
  --header "Authorization: Bearer $TOKEN" \
  --out skills/

# Multi-target render from one extraction
npx @skillit/mcp extract \
  --command "node ./server.js" \
  --invocation mcp-protocol \
  --invocation cli:mcpc \
  --out skills/

# Batch from a Claude Desktop config
npx @skillit/mcp extract --config ~/.claude/mcp.json --out skills/
```

---

## `bundle` subcommand

**FR references**: FR-029 through FR-041, FR-IT-008, FR-IT-009.

### Synopsis

```text
to-skills-mcp bundle [--package-root <dir>]
                     [--out <dir>] [--max-tokens <n>] [--llms-txt]
                     [--invocation <target>]...
                     [--force] [--skip-audit]
                     [--canonicalize | --no-canonicalize]
```

### Flags

Same as `extract` minus the transport group (`--command`/`--url`/`--config`). All transport and skill-name configuration comes from `package.json` `to-skills.mcp`.

| Flag                    | Type     | Default                         | Notes                                            |
| ----------------------- | -------- | ------------------------------- | ------------------------------------------------ |
| `--package-root <dir>`  | path     | `process.cwd()`                 | Directory containing the package.json to bundle. |
| `--out <dir>`           | path     | `<package-root>/skills`         | Output root.                                     |
| `--invocation <target>` | string[] | package.json → `'mcp-protocol'` | Overrides package.json setting.                  |

### Exit codes

Same as `extract`. Additionally:

| Code | Meaning                                                                            |
| ---- | ---------------------------------------------------------------------------------- |
| 4    | `to-skills.mcp` field missing from `package.json`, or malformed.                   |
| 5    | `package.json` `bin` missing and no `command` override → `MISSING_LAUNCH_COMMAND`. |

### stdout / stderr

- **stderr**: audit issues, extraction errors, package.json warnings (FR-035).
- **stdout**: `BundleResult` as JSON when `--json` is passed (reserved for v1.1; default v1 is human-readable).

### Examples

```bash
# Typical postbuild step — reads package.json
to-skills-mcp bundle

# Emit skills for both targets in one run
to-skills-mcp bundle --invocation mcp-protocol --invocation cli:mcpc

# CI with audit enforcement
to-skills-mcp bundle --canonicalize   # audit defaults to failing on error
```

---

## Global behavior

- All subcommands exit quickly on misuse (code 2) before launching any server.
- SIGINT (Ctrl-C) terminates any spawned stdio server, closes HTTP transports, and exits with code 130.
- No interactive prompts. Every decision is driven by flags or config.
