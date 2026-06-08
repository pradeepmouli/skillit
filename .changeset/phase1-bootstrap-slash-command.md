---
'@skillit/client': minor
'@skillit/core': minor
'@skillit/cli': minor
'@skillit/typedoc': minor
---

feat: ship the `/skillit-bootstrap` agent skill (Phase 1)

- New bundled Claude Code skill `skillit-bootstrap` (`packages/client/skills/`)
  that orchestrates the agent-bootstrap loop — `skillit gen` → `skillit audit
--json` → agent enriches repo source → regenerate — for the **cli** and
  **typedoc** source kinds. The agent never writes a `SKILL.md`; it edits only
  source surfaces (JSDoc / README / examples / package.json). `@skillit/client`
  now ships its `skills/` directory.
- **fix(cli):** `CliRefineSource` now reads package.json metadata + README
  (description, keywords, repository) into its audit context. Previously it
  returned an empty context, so the F1/F3 (description/README) audit findings
  were unaddressable and a cli-source skill could not reach grade B.
- **core:** new shared `readPackageMetadata()` / `findNearestPackageDir()`
  exports (the single package-metadata reader used by both the config and cli
  sources).
- **typedoc + client:** `skillit gen --source typedoc` and `skillit audit
--source typedoc` are now wired, so the bootstrap skill's typedoc claim is
  real. `gen` drives the existing `@skillit/typedoc` plugin pipeline
  (`load(app)` + `convert()`); `audit` reuses `extractSkills`. New
  `@skillit/typedoc` exports: `generateTypeDocSkills`, `extractTypeDocSkills`,
  `createTypeDocRefineSource`.
- config / mcp orchestration and the mechanical no-hand-edit guard are deferred
  to later phases; the CLI commands remain for headless/CI use.
