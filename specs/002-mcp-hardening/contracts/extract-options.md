# Contract — `extractMcpSkill` Options & Return Shape Changes

**Owner**: `@skillit/mcp`
**Stability**: stable (additive — backward-compatible)

---

## 1. `McpExtractOptions.transport.stdio` — `initializeTimeoutMs` (FR-H008)

```ts
interface McpStdioTransportOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly initializeTimeoutMs?: number; // NEW — default 30_000
}
```

**Semantics**:

- Default 30 000 ms (30 s) when omitted.
- `<= 0` disables the race entirely (existing behavior — caller opts out).
- On timeout, `extractMcpSkill` throws `McpError('INITIALIZE_FAILED', /timed out after \\d+ms/)`.
- Applies to stdio transport only. HTTP transports already have `fetch`-level timeouts.

**Example**:

```ts
const skill = await extractMcpSkill({
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'some-server'],
    initializeTimeoutMs: 60_000 // wait up to 60s for cold-start servers
  }
});
```

---

## 2. `ExtractedSkill.auditIssues` — programmatic audit access (FR-H006, US3)

```ts
interface ExtractedSkill {
  // ... existing fields
  readonly auditIssues?: readonly AuditIssue[];
}
```

**Tri-state semantics**:

| Value       | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| `undefined` | Audit was skipped OR this skill came from a non-MCP extractor |
| `[]`        | Audit ran, found no issues                                    |
| `[ ... ]`   | Audit ran, found one or more issues                           |

**`AuditIssue` shape** (unchanged):

```ts
interface AuditIssue {
  readonly code: 'M1' | 'M2' | 'M3' | 'M4' | 'M5';
  readonly severity: 'fatal' | 'error' | 'warning' | 'alert';
  readonly tool?: string;
  readonly message: string;
}
```

**CI-gate use case**:

```ts
const skill = await extractMcpSkill({ transport });
if (skill.auditIssues?.some((i) => i.severity === 'fatal' || i.severity === 'error')) {
  process.exit(3); // matches existing CLI exit code for AUDIT_FAILED
}
```

## 3. Backward compatibility

- Both fields are optional. Existing callers that don't pass `initializeTimeoutMs` get the 30 s default (slight behavior change vs. PR 20's "infinite wait" — documented in CHANGELOG as a _fix_, not a breaking change, since the prior behavior was a hang bug).
- Callers that ignore `auditIssues` see no behavior change. CLI's stderr emission of audit issues is preserved.

## 4. Cross-references

- Spec: FR-H006, FR-H008, US3, US4, SC-H005, SC-H007.
- Migration cookbook: `quickstart.md` §3, §4.
- Implementation: `packages/mcp/src/extract.ts`, `packages/mcp/src/types.ts`, `packages/core/src/types.ts`.
