---
'@to-skills/cli': patch
---

fix(cli): only mark `.requiredOption()` flags as required

`introspectCommander` conflated commander's `opt.required` (the option's _value_ is required — `<x>` vs `[x]`, true for any value-taking flag) with `opt.mandatory` (the option _itself_ must be supplied, set by `.requiredOption()`). As a result every `--flag <value>` was emitted with `Required: yes` in the generated skill. It now reads `opt.mandatory`, so optional value-taking options are correctly reported as not required.
