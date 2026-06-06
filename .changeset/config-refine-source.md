---
  "@skillit/core": minor
  "@skillit/client": minor
---

feat: refine TypeScript config surfaces (`--source config`)

- `@skillit/core` adds `ConfigRefineSource` + `extractConfigSurface`: extract a
  config type's options (incl. nested dot-path keys) and refine their per-option
  routing JSDoc (`@useWhen`/`@avoidWhen`/`@pitfalls`) in place via
  `upsertPropertyJsDocTag`. The audit credits per-option config tags and
  audit-score emits per-option `config-option` targets so the refine loop
  converges on a config skill.
- `@skillit/client` wires `skillit refine --source config --config-type <file#export>`
  and `skillit init --source config` (generate → refine in place → regenerate;
  installs nothing — config is built into the client).
- fix(core): normalize multi-line config option types to one line so a mapped
  type can't corrupt the rendered options table.
