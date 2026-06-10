---
'@skillit/client': minor
---

`skillit init --source cli` now wires a postinstall script.

- After installing `@skillit/cli`, `init` writes a self-contained `skillit-postinstall.cjs` script to the project root and sets `scripts.postinstall` in `package.json` to `node ./skillit-postinstall.cjs`.
- The postinstall script replaces `npx <packageName>` with the bare binary name in all `skills/**/*.md` files, so globally-installed consumers get invocation examples that match their actual shell command.
- Skips wiring (with a warning) if `scripts.postinstall` is already set.
- New injectable `wirePostinstall` dep on `InitDeps` for testing.
- New `generatePostinstallScript()` export from `@skillit/client`.
