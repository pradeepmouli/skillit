# Contract — Audit Rules: M3 Sub-Rule for Malformed `_meta.toSkills`

**Owner**: `@skillit/mcp`
**Stability**: stable (additive — extends existing M3 rule)

---

## Rule summary

`_meta.toSkills` is the in-band annotation surface MCP server authors use to flag skill-relevance hints (e.g., `useWhen: ['some context']`). When the value's shape doesn't match the expected schema, today's behavior is to silently drop the malformed entry. This contract adds a warning-severity audit issue so authors get a diagnostic.

## Rule encoding

| Field      | Value                                               |
| ---------- | --------------------------------------------------- |
| `code`     | `'M3'` (extends existing M3, does NOT introduce M6) |
| `severity` | `'warning'`                                         |
| `tool`     | The tool name whose annotation was malformed        |
| `message`  | `'malformed _meta.toSkills annotation: <reason>'`   |

The `<reason>` is the validation failure description (e.g., `'useWhen must be string[], got string'`).

## Detection contract

Detection happens in the _introspector_ (the code that reads `tool._meta` from the SDK response). Validation logic:

```ts
function validateMetaToSkills(meta: unknown): { ok: true } | { ok: false; reason: string } {
  if (!meta || typeof meta !== 'object') return { ok: true }; // absence is fine
  const ts = (meta as Record<string, unknown>).toSkills;
  if (ts === undefined) return { ok: true };
  if (typeof ts !== 'object' || ts === null)
    return { ok: false, reason: 'toSkills must be object' };
  const useWhen = (ts as Record<string, unknown>).useWhen;
  if (useWhen !== undefined) {
    if (!Array.isArray(useWhen))
      return { ok: false, reason: 'useWhen must be string[], got ' + typeof useWhen };
    if (!useWhen.every((s) => typeof s === 'string'))
      return { ok: false, reason: 'useWhen contains non-string entries' };
  }
  // ... other field validations
  return { ok: true };
}
```

When validation fails, the introspector writes a sentinel into the IR:

```ts
fn.tags = fn.tags ?? {};
fn.tags.metaToSkillsMalformed = result.reason;
```

## Audit emission contract

The audit engine reads the sentinel:

```ts
// In runMcpAudit, alongside existing M3 (missing useWhen) rule:
if (fn.tags?.metaToSkillsMalformed) {
  issues.push({
    code: 'M3',
    severity: 'warning',
    tool: fn.name,
    message: `malformed _meta.toSkills annotation: ${fn.tags.metaToSkillsMalformed}`
  });
}
```

## Why M3 and not M6 (per Clarifications)

The user-facing impact is identical: "the annotation didn't take effect". Reusing M3 keeps the audit-rule taxonomy stable and the existing `--audit-warnings` / severity filtering work as-is.

## Test contract (FR-H017)

`tests/unit/audit-malformed-meta.test.ts` MUST:

1. Construct an `ExtractedSkill` with one tool whose `tags.metaToSkillsMalformed = 'useWhen must be string[], got string'`.
2. Call `runMcpAudit(skill)`.
3. Assert the result includes an issue with `{ code: 'M3', severity: 'warning', tool: <name>, message: /malformed _meta.toSkills/ }`.
