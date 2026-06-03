---
description: 'Autonomously improve an MCP skill via the to-skills audit→draft→review loop (build or runtime mode) Also: to-skills, refine, mcp, skill-generation, cli, audit, overlay.'
name: to-skills-refine
---

# to-skills-refine

Autonomously improve an MCP skill via the to-skills audit→draft→review loop (build or runtime mode)

## Commands

### refine

Autonomously improve a skill via the audit→draft→review loop

**Usage:**

```
[options]
```

| Flag               | Type     | Required | Default | Env | Description                                               |
| ------------------ | -------- | -------- | ------- | --- | --------------------------------------------------------- |
| `--mcp`            | `string` | yes      | —       | —   | path to mcp.json or MCP config file                       |
| `--server`         | `string` | no       | —       | —   | server name within the config (defaults to first enabled) |
| `--overlay`        | `string` | no       | —       | —   | path to overlay JSON file (runtime mode only)             |
| `--mode`           | `string` | no       | —       | —   | refine mode: build or runtime (auto-detected if omitted)  |
| `--source-glob`    | `string` | no       | —       | —   | glob pattern for TypeScript source files (build mode)     |
| `--max-iterations` | `string` | no       | `5`     | —   | iteration cap (default 5)                                 |
| `--items`          | `string` | no       | `5`     | —   | work items per iteration (default 5)                      |

## References

Load these on demand — do NOT read all at once:

- When using CLI commands → read `references/commands.md` for flags, arguments, and defaults

## Links

- [Repository](https://github.com/pradeepmouli/to-skills)
