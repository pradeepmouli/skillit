# Contract: `to-skills.mcp` package.json field

**FR references**: FR-029, FR-030, FR-031, FR-IT-008.

---

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "to-skills.mcp configuration",
  "type": "object",
  "properties": {
    "to-skills": {
      "type": "object",
      "properties": {
        "mcp": {
          "oneOf": [
            { "$ref": "#/definitions/McpServerEntry" },
            {
              "type": "array",
              "items": { "$ref": "#/definitions/McpServerEntry" },
              "minItems": 1
            }
          ]
        }
      }
    }
  },
  "definitions": {
    "McpServerEntry": {
      "type": "object",
      "required": ["skillName"],
      "properties": {
        "skillName": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9-]*$",
          "description": "Directory name under skills/. Must be lowercase-kebab."
        },
        "command": {
          "type": "string",
          "description": "Launch command. If omitted, derived from package.json bin (FR-031)."
        },
        "args": {
          "type": "array",
          "items": { "type": "string" }
        },
        "env": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        },
        "invocation": {
          "oneOf": [
            { "$ref": "#/definitions/InvocationTarget" },
            {
              "type": "array",
              "items": { "$ref": "#/definitions/InvocationTarget" },
              "minItems": 1,
              "uniqueItems": true
            }
          ]
        }
      }
    },
    "InvocationTarget": {
      "type": "string",
      "pattern": "^(mcp-protocol|cli:[a-z0-9][a-z0-9-]*)$"
    }
  }
}
```

---

## Examples

### Single server, default invocation

```json
{
  "name": "@myorg/my-mcp-server",
  "bin": "./dist/server.js",
  "scripts": { "postbuild": "to-skills-mcp bundle" },
  "to-skills": {
    "mcp": { "skillName": "my-server" }
  }
}
```

`command`/`args` omitted → bundle mode derives from `bin` = `node ./dist/server.js`.
`invocation` omitted → defaults to `mcp-protocol`.

### Single server, multiple invocation targets

```json
{
  "to-skills": {
    "mcp": {
      "skillName": "my-server",
      "invocation": ["mcp-protocol", "cli:mcpc"]
    }
  }
}
```

Bundle mode writes two skill directories: `skills/my-server-mcp-protocol/` and `skills/my-server-mcpc/` (FR-IT-009 disambiguation rule).

### Python server — explicit launch command

```json
{
  "name": "@myorg/py-mcp-server",
  "to-skills": {
    "mcp": {
      "skillName": "py-server",
      "command": "python",
      "args": ["-m", "my_package.server"]
    }
  }
}
```

### Multiple servers in one package (monorepo-within-a-package)

```json
{
  "to-skills": {
    "mcp": [
      { "skillName": "server-a", "command": "node", "args": ["./dist/a.js"] },
      {
        "skillName": "server-b",
        "command": "node",
        "args": ["./dist/b.js"],
        "invocation": "cli:mcpc"
      }
    ]
  }
}
```

---

## Validation behavior

On `to-skills-mcp bundle`:

- `to-skills.mcp` absent → exit code 4 with message `to-skills.mcp field is required. See https://...`.
- `skillName` missing on an entry → exit code 4 with the index of the offending entry.
- `skillName` violates the kebab pattern → exit code 4.
- `command` omitted AND `bin` absent → exit code 5 with code `MISSING_LAUNCH_COMMAND`.
- `invocation` references an unknown target → exit code 2 with code `UNKNOWN_TARGET`; if the target looks resolvable (`cli:*`), suggests `npm install @skillit/target-<name>`.
- Two entries with the same `skillName` → exit code 4 with code `DUPLICATE_SKILL_NAME`.

---

## What the tool does NOT touch

The tool never writes back to `package.json`. If `files` is missing `dist/` or `skills/`, a warning is emitted to stderr and included in `BundleResult.packageJsonWarnings` (FR-035). The message includes the exact line to add, but the user is responsible for editing their own `package.json`.
