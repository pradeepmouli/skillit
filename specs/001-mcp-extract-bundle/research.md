# Phase 0 Research — `@skillit/mcp`

**Date**: 2026-04-24
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

Seven research questions emerged from the Technical Context. Each is resolved below.

---

## 1. MCP SDK client library — version pin & transport strategy

**Decision**: depend on `@modelcontextprotocol/sdk` at `^1.x`. Use the SDK's `Client` class paired with `StdioClientTransport` (for `--command`) or `StreamableHTTPClientTransport` (for `--url`, with SSE fallback negotiated by the SDK).

**Rationale**:

- Official, actively maintained, published by Anthropic. Matches the spec's explicit mandate (FR-005: "MUST use the official SDK, MUST NOT implement JSON-RPC framing").
- The 1.x line is stable; breaking changes occur at minor-version boundaries with migration notes. Pinning to `^1.x` gets security patches for free.
- Transport auto-negotiation lives inside the SDK. The package's job is to pick the right `Transport` constructor based on whether `--command` or `--url` was supplied, pass along headers via `requestInit` when HTTP, and hand the transport to `new Client({...}).connect(transport)`.

**Alternatives considered**:

- **Implement JSON-RPC framing directly** (rejected by FR-005 and by pragmatism — SDK handles initialize/capability negotiation, pagination cursors, notification filtering, and transport-specific framing; reimplementing is pure liability).
- **Use a community wrapper like `mcp-client-lite`** (rejected — transient maintenance, no official security surface, SDK is already TS-native).
- **Pin to a specific minor version** (rejected — blocks automated security patches; spec treats breaking SDK changes as rare and signaled).

---

## 2. Byte-identical idempotency (FR-038, SC-009) — feasibility and alternative

**Decision**: Relax "byte-identical" to "**canonicalized-content-identical**." Introduce a canonicalization pass in `@skillit/core/src/canonical.ts` that normalizes:

1. **Key order** — sort object keys alphabetically in all YAML frontmatter, JSON payloads, and parameter tables.
2. **Array order** — stable-sort tools, resources, and prompts by `name`; stable-sort parameters within each tool by (required-first, then alphabetical).
3. **Timestamps / nondeterministic prose** — strip or normalize any embedded timestamp, PID, or environment-derived string in generated prose. The canonicalization pass runs a configured regex list over descriptions (default: empty; adapters may contribute patterns).
4. **Whitespace** — collapse runs of blank lines, trim trailing whitespace per line, LF line endings.

**Rationale**:

- The MCP SDK returns tool lists in the order the server emits them. A server using `Map` iteration or a nondeterministic registry produces different orderings on repeat runs. True byte-identity would require the server be deterministic, which we cannot assume.
- JSON Schema `$ref` resolution via `@apidevtools/json-schema-ref-parser` can produce different key orderings depending on ref-cycle traversal. Canonicalization eliminates this variance.
- Pagination cursors can interleave results if the server rebuilds indices between pages. Canonicalization's stable-sort makes this invisible to the output.
- Renaming from "byte-identical" to "content-identical after canonicalization" preserves SC-009's practical value (clean commits, reliable CI diffs) without over-promising.

**Spec update implication**: FR-038 and SC-009 should be softened in a follow-up clarification. Suggested wording: _"MUST produce identical output on re-run after applying the documented canonicalization pass."_ This is flagged in `plan.md` "Open items" and will be handled in `/speckit.tasks` as a spec-delta task.

**Alternatives considered**:

- **Require the server to be deterministic** (rejected — no way to enforce on third-party servers).
- **Hash-only comparison** (rejected — developers want readable diffs when content changes, not opaque hashes).
- **Ignore the problem** (rejected — breaks CI diffs for bundle mode, which the spec's bundle-mode story depends on).

---

## 3. JSON Schema `$ref` resolution

**Decision**: Use `@apidevtools/json-schema-ref-parser` (package name: `@apidevtools/json-schema-ref-parser`, current 11.x).

**Rationale**:

- Most mature ref-resolver in the Node ecosystem. Handles `$ref`, `definitions`, external refs (disabled by us — we only resolve intra-document refs), and cycle detection.
- Dereferences in-place, returning a Schema with no `$ref` left — matches FR-010's rendering contract.
- On cycle detection, throws `ono.ReferenceError` — the extractor catches this, records the tool's name + schema in Quick Reference, omits parameter table, emits audit warning M2 ("invalid inputSchema"). Per FR-011.

**Alternatives considered**:

- **`ajv.compile({...}).schema` side-effect** (rejected — `ajv` is a validator, not a dereferencer; requires coercing its internals).
- **Custom recursive resolver** (rejected — schema cycles are subtle; the spec acknowledges recursive `$ref` as an edge case worth handling correctly).
- **`json-schema-ref-parser` v9.x** (rejected — pre-TypeScript-native; 11.x is natively typed and tree-shakeable).

---

## 4. `_meta.toSkills.pitfalls` vs the project's renamed `@never` JSDoc tag

**Decision**: Keep `pitfalls` as the extension key in `_meta.toSkills`. Map it to the existing `pitfalls` field on `ExtractedSkill` (already present at line 54 of `packages/core/src/types.ts`, populated by the TypeDoc extractor from `@never` tags).

**Rationale**:

- Two naming conventions coexist: a **tag name** (in source files, `@never` — the project-level JSDoc-tag rename) and a **field name** (in the IR, `pitfalls` — the stable semantic label). The TypeDoc extractor already bridges these: it reads `@never` tags and populates `pitfalls`.
- MCP is a separate ecosystem. `_meta.toSkills.pitfalls` is an extension key that might be set by tool authors writing MCP servers in Python, Go, Rust — any of whom have no reason to track a TypeScript project's tag renaming. Naming the extension key `pitfalls` matches what external server authors would naturally write, matches the IR field, and matches the spec's acceptance scenarios.
- The extension key and the JSDoc tag name are decoupled. This is intentional cross-ecosystem design, not an oversight.

**Contract note**: `contracts/package-json-config.md` and the adapter README will explicitly document: "MCP extension key is `pitfalls`. The project's internal JSDoc tag is `@never`. These are two sides of the same bridge — the IR field name (`pitfalls`) is the stable contract."

**Alternatives considered**:

- **Rename extension key to `never`** (rejected — externalizes an internal project rename to third-party server authors; inconsistent with IR field name; breaks the already-written acceptance scenarios).
- **Accept both `pitfalls` and `never` as aliases** (rejected — invites ambiguity; two keys for one concept is a smell; servers might set both to conflicting values).

---

## 5. Third-party adapter plugin resolution

**Decision**: Implement in `packages/mcp/src/adapter/loader.ts`:

```typescript
function resolveAdapter(target: string): InvocationAdapter {
  if (target === 'mcp-protocol') return require('@skillit/target-mcp-protocol').default;
  if (!target.startsWith('cli:')) throw new McpError(`Unknown target form: ${target}`);
  const name = target.slice('cli:'.length);
  const candidates = [`@skillit/target-${name}`, `to-skills-target-${name}`];
  for (const pkg of candidates) {
    try {
      return require(pkg).default;
    } catch {
      /* try next */
    }
  }
  throw new McpError(`No adapter for target '${target}'. Looked for ${candidates.join(', ')}.`);
}
```

Use `createRequire(import.meta.url)` for ESM compatibility.

**Rationale**:

- Matches FR-IT-005 exactly: scoped name first, unscoped fallback, clear error if neither resolves.
- No config plumbing, no dynamic registry, no discovery protocol. A third-party adapter is just an npm package with a conventional name and a default export.
- Synchronous resolution. The CLI can verify all requested targets exist before starting the server process (fail-fast).

**Alternatives considered**:

- **Dynamic import** (considered but rejected for v1 — synchronous resolution is simpler and the SDK is already synchronous-on-startup. Revisit if third-party adapters need top-level await.)
- **Plugin registry in `package.json`** (rejected — extra indirection; npm install + flag is the minimum-friction path).
- **Load all installed `@skillit/target-*` packages at startup** (rejected — wastes time when the user is only rendering one target; fail-lazy is better.)

---

## 6. CLI argument encoding per target

**Decision**: Each target adapter owns its encoding, but all three share a common **tier classifier** from the host package:

```text
Tier 1 (native flag)   — scalars (string, number, boolean), enums, simple string arrays
Tier 2 (native flag)   — objects whose properties are all Tier 1 (flattened with dot notation)
Tier 3 (JSON fallback) — anything else: nested objects beyond depth 1, arrays of objects,
                         schemas with recursive $ref, schemas that failed resolution
```

Adapter-specific encoding:

| Adapter                  | Tier 1                                       | Tier 2                | Tier 3 fallback  |
| ------------------------ | -------------------------------------------- | --------------------- | ---------------- |
| `target-mcpc`            | `key:=value` (typed) or `key=value` (string) | `parent.child:=value` | `--json '{...}'` |
| `target-fastmcp`         | `key=value`                                  | `parent.child=value`  | single JSON arg  |
| `target-mcptools` (v1.1) | `--flag=value`                               | `--flag.sub=value`    | `-p '{...}'`     |

**Rationale**:

- The tier classifier is a pure function of the `inputSchema` — it doesn't depend on the target, so it lives in the host. This keeps each adapter small and avoids the three classifiers diverging in subtle ways.
- The classifier returns a `ParameterPlan` (per-parameter: `tier: 1|2|3`, `path: string[]`, `type: "scalar" | "enum" | "string-array" | "json"`). Each adapter consumes the plan and emits its own syntax.
- FR-IT-007 is satisfied structurally — there is no code path that emits "partial" flags; Tier 3 always produces a JSON argument.

**Alternatives considered**:

- **Let each adapter parse schemas itself** (rejected — triplication of complex logic, drift risk).
- **Single `encode()` function per adapter that takes an `inputSchema`** (too abstract; the classifier/encoder split is clearer).

---

## 7. Frontmatter writer — YAML emission

**Decision**: Use the `yaml` npm package (the yaml.org reference TypeScript implementation, not the deprecated `js-yaml`) for frontmatter emission. Configure for deterministic output:

```typescript
import YAML from 'yaml';
YAML.stringify(doc, {
  sortMapEntries: false, // preserve our canonicalized order
  defaultStringType: 'PLAIN',
  defaultKeyType: 'PLAIN',
  lineWidth: 0, // never wrap
  minContentWidth: 0
});
// Force flow style for args arrays specifically:
// args: ["-y", "@myorg/my-mcp-server"]   ← flow
// (not block-style with dashes, which some harnesses misparse)
```

**Rationale**:

- Observed convention in OpenCode, Codex, Cursor fixtures: `args: ["...", "..."]` in flow style. Block style works but visually groups worse with the surrounding `mcp:` block.
- `sortMapEntries: false` is critical — our canonicalization pass (Research §2) already sorted keys; don't re-sort.
- `lineWidth: 0` prevents the library from inserting soft-wraps mid-string, which would break literal npm package names containing `@` and `/`.

**Alternatives considered**:

- **`js-yaml`** (rejected — deprecated; no longer maintained).
- **String templates** (rejected — fragile; fails on names containing YAML reserved characters).
- **`yaml.stringify` with defaults** (rejected — defaults sort keys, which fights our canonicalization).

---

## Summary

All seven research questions resolved. Zero `NEEDS CLARIFICATION` markers remain. The plan gate passes; proceed to Phase 1 design.

Cross-cutting obligations for `/speckit.tasks`:

- Canonicalization pass (`@skillit/core/src/canonical.ts`) is a new shared primitive; both adapters and the host invoke it.
- Spec-delta task: soften FR-038 / SC-009 from "byte-identical" to "content-identical after canonicalization" in a follow-up `/speckit.clarify` pass.
- Adapter-side contract: every built-in adapter must pass the host's tier-classifier round-trip tests against a fixed schema corpus.
