---
'@to-skills/client': minor
---

`refine` and `init` gain `--model-client api|claude|codex|copilot`: drive the
audit→draft→review loop through an already-authenticated agent CLI instead of
the Anthropic API. Per-CLI adapters (claude maps the drafter/reviewer split to
Sonnet/Opus; codex/copilot use their default model) reuse the existing prompt
builders and verdict parser; `--model-cli-timeout` bounds each call. Default
remains `api`.
