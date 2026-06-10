---
'@skillit/core': minor
'@skillit/cli': minor
'@skillit/client': minor
---

Add npx invocation mode for CLI skills on public packages.

- `skillit gen --source cli` now defaults to `npx <packageName>` as the invocation prefix for public packages that declare a `bin` field in `package.json` (mirrors `npm install -g` detection: `bin` present + not `"private": true`).
- Add `--invocation npx|global` flag to `skillit gen` to override the auto-detected mode.
- README sections (features, troubleshooting, quick start) are now included in generated CLI skills, with the bare binary name substituted by `npx <packageName>` in npx mode.
- New `applyNpxMode` / `resolveInvocationMode` helpers exported from `@skillit/cli`.
- New `PackageMetadata` fields: `fullPackageName`, `bin`, `isPrivate`.
- New `ExtractedSkill` field: `cliInvocationPrefix`.
- `CliRefineSource` and `CliRefineSourceOptions` support `invocationMode` override.
