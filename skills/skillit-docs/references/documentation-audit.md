# Documentation Audit

# Documentation Audit

> The audit engine checks your docs against skill generation conventions during `pnpm typedoc` and tells you exactly what to fix.

The audit runs automatically as part of skill generation. It checks your JSDoc, README, and `package.json` against conventions at four severity levels, logging actionable suggestions with file and line references.

## Severity Levels

| Level       | Meaning                                                | CI behavior           |
| ----------- | ------------------------------------------------------ | --------------------- |
| **fatal**   | Skill is broken or useless without this                | Exit 1 (configurable) |
| **error**   | Skill exists but LLMs can't write correct code from it | Exit 1 (configurable) |
| **warning** | Skill works but isn't as good as it could be           | Exit 0 (logged)       |
| **alert**   | Stylistic / quality suggestion                         | Exit 0 (logged)       |

## Running the Audit

The audit runs during normal skill generation --- no extra command needed:

```bash
pnpm typedoc
```

Look for the audit summary after the `[skills]` log lines:

```
Skill Documentation Audit: @my-org/my-lib
   2 fatal · 3 error · 6 warning · 1 alert

FATAL (2)

  packages/core/package.json
    keywords: Only 2 keywords, need 5+ domain-specific
    Has: ["typescript", "utils"]
    Suggestion: Add terms describing what problems this solves

  src/renderer.ts:36
    renderSkill() --- no JSDoc summary
    Suggestion: /** Render a single extracted skill into SKILL.md + references */

ERROR (3)

  src/renderer.ts:36
    renderSkill() --- @returns missing
    Returns: RenderedSkill
    Suggestion: @returns Rendered skill with discovery file and reference files

  src/types.ts:104
    SkillRenderOptions.namePrefix --- property JSDoc missing

  src/types.ts:108
    SkillRenderOptions.license --- property JSDoc missing

WARNING (6)
  ...

PASSING (14 checks)
  package.json description
  README blockquote description
  6/6 exported functions have JSDoc summaries
  ...
```

## Key Checks by Level

### Fatal --- Fix these first (5 minutes of work)

| Code | Check                      | What it looks for                                                       |
| ---- | -------------------------- | ----------------------------------------------------------------------- |
| F1   | `package.json` description | Non-empty problem statement, >10 chars, not just adjectives             |
| F2   | `package.json` keywords    | 5+ domain-specific keywords (filters out "typescript", "library", etc.) |
| F3   | README description         | Blockquote or prose paragraph before the first `## heading`             |
| F4   | JSDoc on every export      | Every exported function, class, type, and enum has a summary            |

### Error --- The biggest quality jump

| Code | Check                   | What it looks for                                             |
| ---- | ----------------------- | ------------------------------------------------------------- |
| E1   | `@param` descriptions   | Every parameter has prose that doesn't just restate the type  |
| E2   | `@returns` on non-void  | Every function returning a value describes what it means      |
| E3   | Property JSDoc          | Every property on exported interfaces/types has a description |
| E4   | At least one `@example` | At least one exported function has a realistic usage example  |
| E5   | Repository URL          | `package.json` has a `repository` field                       |

### Warning --- Polish for quality

| Code | Check                     | What it looks for                                                 |
| ---- | ------------------------- | ----------------------------------------------------------------- |
| W1   | `@packageDocumentation`   | Module-level JSDoc in index.ts with overview (>50 chars)          |
| W2   | `@example` everywhere     | Every exported function has at least one example                  |
| W3   | Rich metadata tags        | At least one use of `@deprecated`, `@since`, `@throws`, or `@see` |
| W4   | 10+ keywords              | Enough domain-specific keywords for rich triggering               |
| W5   | README `## Features`      | Structured feature list section                                   |
| W6   | README `## Pitfalls`      | Expert "NEVER do X because Y" knowledge                           |
| W7   | `@useWhen` presence       | At least one export has a `@useWhen` tag                          |
| W8   | `@avoidWhen` presence     | At least one export has an `@avoidWhen` tag                       |
| W9   | `@never` presence         | At least one export has a `@never` tag                            |
| W10  | `@remarks` on complex fns | Functions with 3+ parameters have extended descriptions           |
| W11  | `@category` usage         | Exports use `@category` for intentional grouping                  |

### Alert --- Stylistic suggestions

| Code | Check                  | What it looks for                                                |
| ---- | ---------------------- | ---------------------------------------------------------------- |
| A1   | Generic keywords       | Keywords like "typescript" or "npm" that add no triggering value |
| A2   | `@param` restates type | Parameter description just repeats the name or type              |
| A3   | Trivial `@example`     | Single-line example with no imports or setup                     |
| A4   | Long Quick Start       | Quick Start code block exceeds 15 lines                          |

## CI Integration

### Fail on errors

Set `skillsAuditFailOnError` to fail the build when fatal or error issues exist:

```json
{
  "skillsAuditFailOnError": true
}
```

This is useful for CI pipelines where you want to enforce documentation quality as a gate.

### JSON report

Write a machine-readable audit report for tooling integration:

```json
{
  "skillsAuditJson": "audit-report.json"
}
```

The JSON report contains structured data for each issue:

```json
{
  "package": "@my-org/my-lib",
  "summary": { "fatal": 2, "error": 3, "warning": 6, "alert": 1 },
  "issues": [
    {
      "severity": "fatal",
      "code": "F2",
      "file": "package.json",
      "line": null,
      "symbol": "keywords",
      "message": "Only 2 keywords, need 5+ domain-specific",
      "suggestion": "Add terms describing what problems this solves"
    }
  ],
  "passing": [{ "code": "F1", "message": "package.json description" }]
}
```

## TypeDoc Options

| Option                   | Type    | Default | Description                                           |
| ------------------------ | ------- | ------- | ----------------------------------------------------- |
| `skillsAudit`            | boolean | `true`  | Run documentation audit during skill generation       |
| `skillsAuditFailOnError` | boolean | `false` | Fail build on fatal or error severity issues          |
| `skillsAuditJson`        | string  | `""`    | Path to write JSON audit report (empty = don't write) |

## Recommended Workflow

1. Run `pnpm typedoc` --- see audit output
2. Fix fatals first (5 minutes --- package.json fields + JSDoc summaries)
3. Fix errors next (this is the biggest quality jump)
4. Re-run and verify improvements
5. Check `skills/<name>/SKILL.md` --- does the description make sense?
6. Enable `skillsAuditFailOnError` in CI to prevent regressions

## What the Audit Does NOT Check

- **Prose quality** --- it checks presence, not whether your descriptions are well-written
- **Content accuracy** --- it doesn't verify that descriptions match actual behavior
- **Cross-package consistency** --- each package is audited independently
- **Auto-fix** --- the audit suggests but doesn't modify files (use the bundled `skillit-docs` Claude Code skill for interactive fixing)
