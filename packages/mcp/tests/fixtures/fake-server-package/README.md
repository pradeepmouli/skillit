# @fixture/my-mcp-server

Single-bin MCP server fixture for `@skillit/mcp` bundle integration tests.

The server emits one tool, `echo`, which echoes its input. Tests assert that
`bundle` produces a SKILL.md whose `mcp:` frontmatter contains the npx-by-name
self-reference (`npx -y @fixture/my-mcp-server`) per FR-033, and that
`references/functions.md` documents the `echo` tool.

This package is never published — `private: true`. Tests copy it into a tmpdir
before running so the fixture's `package.json` stays byte-identical.
