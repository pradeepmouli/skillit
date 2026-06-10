---
'@skillit/client': minor
---

Postinstall script now copies skills to `~/.claude/skills/` after rewriting invocations.

Global installs (`npm install -g <pkg>`) will have their skills available to Claude Code immediately after install, with no manual configuration.
