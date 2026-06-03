# Commands

## refine

Autonomously improve a skill via the audit→draft→review loop

```
[options]
```

### Options

#### --mcp

path to mcp.json or MCP config file

**Type:** `string`

**Required:** yes

#### --server

server name within the config (defaults to first enabled)

**Type:** `string`

#### --overlay

path to overlay JSON file (runtime mode only)

**Type:** `string`

#### --mode

refine mode: build or runtime (auto-detected if omitted)

**Type:** `string`

#### --source-glob

glob pattern for TypeScript source files (build mode)

**Type:** `string`

#### --max-iterations

iteration cap (default 5)

**Type:** `string`

**Default:** `5`

#### --items

work items per iteration (default 5)

**Type:** `string`

**Default:** `5`
