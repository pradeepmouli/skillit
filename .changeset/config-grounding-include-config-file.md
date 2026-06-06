---
'@skillit/core': patch
---

fix(core): config refine grounding now includes the config module's own declarations

`ConfigRefineSource` grounding previously fed only the external `--ground`
globs (the consuming code) and explicitly skipped the config file. But config
modules routinely hold the non-type declarations the model needs to be
accurate — preset/override tables, defaults, `defineConfig`/validation (e.g.
z2f's `SHADCN_OVERRIDES`). Excluding the config file forced the model to guess
those runtime values, producing factually-wrong routing prose. The config
module is now prepended to grounding with its JSDoc stripped (so the routing
tags accumulated across refine iterations aren't fed back as "implementation").
