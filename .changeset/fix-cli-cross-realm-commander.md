---
'@skillit/cli': patch
---

fix(program-loader): duck-type Commander check for cross-realm instances

`instanceof Command` fails when the consumer's `commander` package is a
different module instance (e.g. separate monorepos with separate
`node_modules`). Structural duck-type check on `name`, `commands`, and
`parseAsync` is cross-realm safe.
