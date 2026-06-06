---
'@skillit/core': patch
---

fix(core): correct config-refine JSDoc indentation and per-option coverage ordering

Two refinements surfaced by review of the config refine pipeline:

- `upsertTagOnAnchor` derived the JSDoc indent from the declaration's column.
  For a property documented on the same line (`/** desc */ outDir`), that column
  is the text _after_ the comment, so every rebuilt continuation line was
  massively over-indented and the declaration was packed onto the closing `*/`
  line. The indent now comes from the comment node, and a same-line declaration
  is spliced onto its own line.
- `selectWorkItems` sorted purely by points descending, so on a wide config
  surface all `@pitfalls` targets (higher points) filled every bounded iteration
  before any `@useWhen`/`@avoidWhen` target was drafted — letting the loop's
  score plateau stop early with those dimensions still failing. It now
  round-robins across tags so each iteration spreads over all still-failing
  dimensions. With one target per group this is identical to the old order.
- The refine loop's plateau check stopped on any flat-score iteration, but
  per-option coverage targets are score-neutral once the routing thresholds
  pass — so wide surfaces halted before every option was documented. The check
  is now coverage-aware: it only plateaus when the score is flat AND the
  available-work backlog is not shrinking, so score-neutral completeness work
  runs to exhaustion (bounded by `maxIterations`) while the genuinely-stuck case
  still stops early.
