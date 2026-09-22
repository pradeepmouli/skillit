---
'@skillit/client': patch
---

Bump `@anthropic-ai/sdk` from `^0.102.0` to `^0.127.0` (runtime dependency). Checked the intervening changelog for the two categories of real breaking change (removed/retired models, removed content-block types) — this package's usage is a single plain-text `messages.create()` call per role, with model IDs (`claude-sonnet-4-6`, `claude-opus-4-7`) that were never affected. No test suite exists for this package; verified via clean build + full-workspace type-check.
