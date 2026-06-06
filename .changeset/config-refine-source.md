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
- `ConfigRefineSource` enriches the skill + audit context from the nearest
  package.json (description/keywords/repository) and a sibling README, and drafts
  a type-correct example to a sibling `<config>.example.ts` (only if absent),
  read back as the skill's usage example. `guidance()` scopes drafting to the
  single named option.
- audit-score surfaces config per-option routing coverage and the example
  independent of dimension thresholds, so the loop documents the whole surface
  rather than stopping once the rubric is satisfied.
- `--ground <glob>` (repeatable) feeds the code that CONSUMES the config to the
  draft model as a token-capped implementation reference, so it states correct
  runtime behavior instead of guessing from the type; without it the model is
  instructed not to assert unverifiable runtime semantics.
- fixes surfaced by dogfooding against a real generic config:
  - normalize multi-line option types to one line (mapped types can't corrupt
    the options table);
  - prefix every line when creating a JSDoc block with multi-line content
    (no column-0 continuation bullets, which also broke later merges);
  - escape the comment-close sequence in written tag content so a value
    containing it (e.g. a `**`-glob) can't terminate the block and corrupt the
    file; unescape on read;
  - don't truncate per-option targets at the class cap;
  - the rendered skill describes the config surface, not the package blurb.
