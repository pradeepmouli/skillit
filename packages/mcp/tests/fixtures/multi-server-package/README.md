# @fixture/multi-server

Multi-bin MCP server fixture for `@skillit/mcp` bundle integration tests.
Two stdio servers (`server-a`, `server-b`) live in the same npm package,
exposed via the `bin` object. Each emits a uniquely-named tool so tests can
distinguish skill outputs.

Tests assert that the generated SKILL.md frontmatter uses the npx
`--package=<pkg> <binName>` form (FR-034) for each bin.

`private: true` — never published.
