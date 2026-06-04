# Feature Specification: `@skillit/mcp` — Extract and Bundle MCP Servers as Agent Skills

**Feature Branch**: `001-mcp-extract-bundle`
**Created**: 2026-04-21
**Last Updated**: 2026-04-24
**Status**: Draft
**Input**: User description: "Single `@skillit/mcp` package with two modes plus pluggable invocation targets. Extract mode introspects a running MCP server (local stdio or remote HTTP) and produces an ExtractedSkill compatible with the existing core renderer. Bundle mode runs at build time in an MCP server's own package — it invokes Extract against the locally-built server and emits a paired SKILL.md into the same package, producing an npm artifact consumable both as an MCP server and as an Agent Skill from a single install. Invocation targets (`mcp-protocol` default, plus `cli:mcpc`, `cli:fastmcp`, etc.) control how generated skills tell the agent to invoke tools — so the same extraction can serve MCP-native agents via protocol and non-MCP agents via shell commands through existing MCP CLIs."

## Context

The existing to-skills monorepo extracts agent skills from static code artifacts: TypeScript source via TypeDoc, commander/yargs programs via the CLI extractor, and prose docs via the VitePress/Docusaurus adapters. All three extractors produce an `ExtractedSkill` object that `@skillit/core` renders into a SKILL.md + references directory.

A fifth class of input differs from all of these: **live MCP servers**. An MCP server is a running process (stdio) or a remote endpoint (HTTP) that exposes structured metadata at runtime via the Model Context Protocol — `tools` (with `name`, `description`, and JSON Schema `inputSchema`), `resources` (with `uri`, `name`, `mimeType`), and `prompts` (with `name`, `description`, and typed arguments). The metadata is machine-readable and already designed for LLM consumption, but it is delivered only at connection time and re-sent every session.

Three trends in the agent tooling ecosystem shape the design of this package:

1. **The MCP specification (draft, April 2026) does not define a Skills primitive.** The three server primitives remain Prompts, Resources, and Tools. No `skills` capability, no SKILL.md resource type. Skill support is happening at the ecosystem level, not the protocol level.
2. **Agent harnesses have converged on a "skills bundle MCP servers" pattern.** OpenAI Codex plugins can bundle skills together with MCP server configuration and presentation assets in a single package. OpenCode's embedded-skill MCP plugin lets skills configure their MCP servers directly in markdown frontmatter, with zero opencode.json wiring. Cramer's January 2026 post sketched the same direction for Sentry — skill frontmatter declaring `mcp: sentry: https://mcp.sentry.dev/mcp` so the skill encapsulates both the instructions and the tool connection.
3. **Distribution remains fragmented.** MCP servers ship as npm packages, Python wheels, or hosted endpoints. Skills ship as git repos, npm packages, or directories. There is no single artifact that serves both consumption paths from one install. A maintainer today must publish twice — once as an MCP server, once as a skill — and keep them in sync by hand.
4. **Not every agent harness speaks MCP.** The skills ecosystem is broader than the MCP ecosystem. Agents without native MCP support can still consume skills if the skill's instructions describe capabilities in terms of operations the agent already knows how to perform — shell commands, HTTP calls, scripts. A mature category of MCP CLI clients (`mcpc`, `fastmcp`, `mcptools`, `mcp-cmd`) already provides shell access to MCP backends. These CLIs are the invocation mechanism; what's missing is the skill layer that teaches agents which commands to run and when.

This feature adds a single package, `@skillit/mcp`, with two modes and multiple invocation targets that together close all four gaps:

- **Extract mode** — connects to a running MCP server, introspects tools/resources/prompts, produces a progressive-disclosure SKILL.md. For third-party or hosted servers where the author doesn't own the source.
- **Bundle mode** — runs at build time inside an MCP server's own package, invokes Extract against the locally-built server, and writes the generated skill directly into the package with `mcp:` frontmatter that self-references the package's bin. The published artifact is consumable two ways from a single install: as an MCP server via `npx @org/pkg`, or as a skill via `npx skills add @org/pkg`.

Both modes support multiple **invocation targets**. These are not merely rendering profiles — they are **two architectures for how the agent reaches the MCP server, sharing one extractor and one intermediate representation**. The default target, `mcp-protocol`, produces skills in which the agent harness itself holds the MCP session (via `mcp:` frontmatter that the harness's built-in MCP client consumes). CLI targets (`cli:mcpc`, `cli:fastmcp`, `cli:mcptools`, and third-party contributions) produce skills in which an **externally-installed CLI terminates the MCP protocol at the shell boundary** — the agent sees only shell commands, the CLI is the MCP client, and MCP is entirely invisible to the harness.

The two architectures differ in four material ways:

| Property                                | `mcp-protocol` target                                                                 | `cli:*` targets (CLI-as-proxy)                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Who holds the MCP session               | Agent harness                                                                         | External CLI process                                                                         |
| When tool schemas enter context         | At session open (all tools, at once — the context-bloat pattern mcpc's docs call out) | On demand (SKILL.md's Quick Reference first, `references/tools.md` only for the needed tool) |
| Hard dependency for the consumer        | MCP-capable harness                                                                   | A shell tool + one CLI install                                                               |
| Where auth, retries, session state live | Harness's MCP client                                                                  | The CLI                                                                                      |

This architectural split is the source of the package's reach: it lets a single extraction serve MCP-native agents via protocol _and_ non-MCP agents via proxy CLIs, without either path compromising the other. The extraction engine, intermediate representation, and audit logic are identical across targets; only the final rendering and the runtime topology differ. One extractor, every agent.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Extract from a Local stdio MCP Server (Priority: P1)

A developer wants a SKILL.md for an MCP server whose source they don't own — for example, a third-party server they've installed from npm. They want the documentation committed to their repo so their team's agents can reference the API surface without connecting.

**Why this priority**: The primary extract-mode use case. Teams adopt MCP servers faster than maintainers publish docs. Extract lets any downstream user generate a skill from any server they can launch.

**Independent Test**: Point the CLI at a local MCP server binary, verify `skills/<server-name>/SKILL.md` is produced with the server's tools in Quick Reference and detailed in `references/tools.md`.

**Acceptance Scenarios**:

1. **Given** a local MCP server that exposes 5 tools, **When** the user runs `npx @skillit/mcp extract --command "npx -y @modelcontextprotocol/server-filesystem /tmp" --out skills/`, **Then** `skills/filesystem/` is produced containing `SKILL.md` and `references/tools.md`.
2. **Given** the generated `SKILL.md`, **When** the user reads it, **Then** the file contains YAML frontmatter (`name`, `description`, `license`), a description of what the server does, a Quick Reference table listing all 5 tools, and a link to `references/tools.md`.
3. **Given** the generated `references/tools.md`, **When** the user reads it, **Then** each tool appears with its full description, a JSON Schema `inputSchema` rendered as a parameter table, and any `@useWhen`/`@avoidWhen` annotations derived from metadata if present.
4. **Given** a server that declares `prompts` and `resources` in addition to `tools`, **When** extraction runs, **Then** separate `references/prompts.md` and `references/resources.md` files are produced, each linked from SKILL.md.

---

### User Story 2 — Extract from a Remote HTTP MCP Server (Priority: P1)

A developer wants to generate a SKILL.md for a third-party hosted MCP server (e.g., `https://mcp.stripe.com/sse`, `https://mcp.asana.com/sse`) so their team's agents can reference the API surface without the connection overhead on every session.

**Why this priority**: Hosted MCP servers are a fast-growing category. Existing converters require local process spawning; this story serves developers who only need to extract metadata from a public endpoint.

**Independent Test**: Point the CLI at an HTTP SSE endpoint, with or without auth, and verify a valid SKILL.md is produced.

**Acceptance Scenarios**:

1. **Given** a public HTTP MCP endpoint, **When** the user runs `npx @skillit/mcp extract --url https://mcp.example.com/sse --out skills/`, **Then** the tool connects, performs the `initialize` handshake, enumerates tools/resources/prompts, and writes the skill.
2. **Given** an HTTP MCP endpoint requiring a bearer token, **When** the user runs the command with `--header "Authorization: Bearer $TOKEN"`, **Then** the header is forwarded on the handshake and subsequent list requests.
3. **Given** an HTTP MCP endpoint that is unreachable or returns an error during initialization, **When** extraction runs, **Then** the tool exits with a non-zero status and prints a clear diagnostic (e.g., "Connection refused", "Invalid JSON-RPC response at initialize").
4. **Given** an SSE endpoint that streams a long list of tools, **When** extraction runs, **Then** all tools are collected before rendering — partial output is never written.

---

### User Story 3 — Batch Extract from an MCP Config File (Priority: P2)

A developer has an existing `mcp.json` or `claude_desktop_config.json` file listing multiple MCP servers their project uses. They want to batch-generate skills for every server listed, matching the format Claude Desktop, Cursor, and the MCP CLI already consume.

**Why this priority**: Batch generation serves teams that use many MCP servers and want uniform skill coverage from one command. Reuses a config file format developers already maintain.

**Independent Test**: Pass a config file with 3 server definitions and verify 3 skill directories are produced.

**Acceptance Scenarios**:

1. **Given** an `mcp.json` file with 3 server entries, **When** the user runs `npx @skillit/mcp extract --config mcp.json --out skills/`, **Then** 3 subdirectories are produced in `skills/`, one per server, each named after the server's `name` key.
2. **Given** the config file format matches Claude Desktop's schema (servers under `mcpServers` key), **When** extraction runs, **Then** the tool reads the same format without modification.
3. **Given** one server in the config is unreachable, **When** extraction runs, **Then** the other servers are still extracted successfully and a non-zero exit reports which servers failed.
4. **Given** a server entry with `disabled: true`, **When** extraction runs, **Then** that server is skipped without error.

---

### User Story 4 — Bundle an MCP Server Project at Build Time (Priority: P1)

An MCP server maintainer wants their published npm package to ship with a generated skill directory alongside the server binary. When they run `pnpm build`, the build emits the server artifact into `dist/` as usual, and then invokes `@skillit/mcp` in bundle mode, which launches the just-built server, extracts its surface, and writes `skills/<name>/SKILL.md` into the same package. The skill's frontmatter references the package by name so the single published artifact is consumable two ways from a single `npm install` or `npx` invocation.

**Why this priority**: Bundle mode is the killer feature that extract mode alone does not provide. It eliminates the dual-publishing problem MCP server maintainers face today. One package, two consumption paths, zero drift between server capabilities and documented skill.

**Independent Test**: In a TypeScript MCP server project, add a `to-skills.mcp` config to package.json, add `to-skills-mcp bundle` as a postbuild step, run `pnpm build`, and verify the output package contains a functional MCP server in `dist/` AND a generated `skills/<name>/` directory with self-referential `mcp:` frontmatter.

**Acceptance Scenarios**:

1. **Given** an MCP server project whose `package.json` declares:

   ```json
   {
     "name": "@myorg/my-mcp-server",
     "bin": "./dist/server.js",
     "scripts": { "build": "tsc", "postbuild": "to-skills-mcp bundle" },
     "to-skills": {
       "mcp": { "skillName": "my-server" }
     }
   }
   ```

   **When** the user runs `pnpm build`, **Then** the postbuild step launches the newly-built server via `node ./dist/server.js`, extracts its surface, and writes `skills/my-server/SKILL.md` plus reference files into the package root.

2. **Given** a successful bundle, **When** the user inspects the generated `skills/my-server/SKILL.md` frontmatter, **Then** it contains an `mcp:` block referencing the package by name:

   ```yaml
   mcp:
     my-server:
       command: npx
       args: ['-y', '@myorg/my-mcp-server']
   ```

   rather than a local file path, so the reference resolves identically wherever the skill is installed.

3. **Given** a bundle run, **When** the tool completes, **Then** the `files` field in package.json is read (not modified) to verify it includes both `dist/` and `skills/` — if either is missing, the tool emits a warning with the exact line to add, but does not rewrite the user's package.json.
4. **Given** a published package consumed as an MCP server, **When** a consumer adds `{ "command": "npx", "args": ["-y", "@myorg/my-mcp-server"] }` to their MCP client config, **Then** the server runs normally with no skill-related overhead.
5. **Given** the same published package consumed as a skill, **When** a consumer runs `npx skills add @myorg/my-mcp-server`, **Then** the skill is installed into the agent's skills directory, the agent reads the `mcp:` frontmatter, and the agent offers to add the MCP server connection using the npx invocation from the frontmatter.
6. **Given** an MCP server written in Python or another non-Node language, **When** the maintainer configures `to-skills.mcp` with the appropriate launch command, **Then** bundle mode still works: extract invokes the server via the configured command, and the generated frontmatter reflects whatever launch incantation the package ships with.
7. **Given** a package with multiple MCP servers under one repository, **When** the user declares an array under `to-skills.mcp`, **Then** each server is extracted independently and each produces its own skill directory, all within the same published package.

---

### User Story 5 — Emit Skills for Agents Without MCP Support via CLI Invocation Targets (Priority: P1)

A developer wants to use an MCP server from an agent harness that does not speak MCP natively — either an older agent, an in-house agent, or a provider whose MCP support hasn't shipped yet. The agent does have a shell tool (it can execute commands and parse output). The developer runs extract with `--invocation cli:mcpc`, which produces a skill whose Quick Reference and tool reference pages document shell commands using the `mcpc` CLI instead of advertising capabilities through the MCP protocol. The agent reads the skill and invokes tools by running the documented commands — no MCP-layer negotiation required.

**Why this priority**: The skills ecosystem is strictly larger than the MCP ecosystem. CLI invocation targets let a single extraction produce skills that work with every agent harness that has a shell tool, massively expanding the addressable audience. Mature MCP CLIs already exist (`mcpc`, `fastmcp`, `mcptools`); this feature makes them first-class invocation mechanisms for generated skills without requiring the package to ship its own CLI.

**Independent Test**: Run extract against a known MCP server with `--invocation cli:mcpc`. Verify that the generated SKILL.md's Quick Reference lists `mcpc` commands rather than MCP tool names, that `references/tools.md` documents each tool as a shell command with CLI-native argument syntax, and that the frontmatter does NOT contain an `mcp:` block (since invocation goes through the CLI, not through a direct MCP connection).

**Acceptance Scenarios**:

1. **Given** a local MCP server and a user who runs `npx @skillit/mcp extract --command "..." --invocation cli:mcpc --out skills/`, **When** extraction completes, **Then** the generated `SKILL.md` Quick Reference table contains entries like `mcpc @server tools-call create_customer email:=<email>` rather than MCP tool names, and the setup section documents the one-time `mcpc connect` command the user must run before the skill is usable.
2. **Given** an extraction run with `--invocation cli:fastmcp`, **When** the tool renders tool parameters, **Then** the output uses fastmcp's `key=value` argument convention (e.g., `fastmcp call @server create_customer email=test@example.com`), distinct from mcpc's `key:=value` convention and mcptools's `--flag=value` convention.
3. **Given** a skill generated with a CLI invocation target, **When** the generated frontmatter is inspected, **Then** it does NOT contain an `mcp:` block — because MCP protocol connection is not how this skill invokes tools. Instead, a `setup:` section or equivalent documents the CLI prerequisite.
4. **Given** an extraction run with `--invocation cli:unknown`, **When** the tool attempts to render, **Then** it exits with a clear error listing available invocation targets and the names of any installed third-party target packages.
5. **Given** a third-party package that contributes a new CLI invocation target (e.g., `@foo/to-skills-target-foo-cli`), **When** that package is installed alongside `@skillit/mcp` and the user passes `--invocation cli:foo`, **Then** the target adapter is resolved via a documented plugin interface, the extraction proceeds, and the skill is rendered using the third-party adapter without any changes to `@skillit/mcp` itself.
6. **Given** bundle mode with an invocation target of `mcp-protocol` (the default), **When** the bundle runs, **Then** the generated skill's frontmatter contains a self-referential `mcp:` block as specified in Story 4. **Given** bundle mode with `--invocation cli:mcpc`, **When** the bundle runs, **Then** the generated skill instead documents the CLI commands a consumer should run after installing the bundled package, and no `mcp:` frontmatter is emitted.
7. **Given** a batch extraction against a config file with multiple servers and `--invocation cli:mcpc`, **When** extraction completes, **Then** every generated skill uses the same CLI target consistently, and the set of skills taken together documents all servers in the config in a format the target CLI can invoke.

---

### User Story 6 — Programmatic API for Build Pipelines (Priority: P2)

A library author who builds an MCP server wants to drive both extraction and bundling from their own Node scripts rather than through the CLI — for example, to merge extracted MCP skills with TypeDoc-generated skills before writing to disk, or to run the full pipeline in a custom CI step.

**Why this priority**: Programmatic use unlocks CI integration and custom compositions. Matches the pattern established by `extractCliSkill` in `@skillit/cli` and keeps the API surface consistent across extractors.

**Independent Test**: Import `extractMcpSkill` and `bundleMcpSkill` in a Node script, pass connection options, verify return types match the shape consumed by `renderSkill` and the bundle mode emits the expected filesystem state.

**Acceptance Scenarios**:

1. **Given** an MCP server startable in the same process, **When** the user calls `await extractMcpSkill({ transport: 'stdio', command: 'node', args: ['./server.js'], invocation: 'mcp-protocol' })`, **Then** the returned `ExtractedSkill` has `functions` populated from tools, `resources` populated from MCP resources, `prompts` populated from MCP prompts, and `configSurfaces` populated from tool `inputSchema` objects.
2. **Given** an `ExtractedSkill` from `extractMcpSkill`, **When** passed to `renderSkill` from `@skillit/core` with a matching invocation target, **Then** the resulting SKILL.md is functionally equivalent to what the CLI produces for the same server and target.
3. **Given** a build script that wants to drive bundle mode programmatically, **When** the user calls `await bundleMcpSkill({ packageRoot: process.cwd(), invocation: 'mcp-protocol' })`, **Then** the function reads `to-skills.mcp` config from package.json, invokes extract, writes the skill directory, and resolves with a report of what was written.
4. **Given** a monorepo build that generates skills for multiple packages, **When** each package's build invokes `bundleMcpSkill`, **Then** no collision occurs and each package ends up with its own `skills/` directory independently.
5. **Given** a programmatic caller that wants to emit skills for multiple invocation targets from a single extraction (e.g., one `mcp-protocol` skill and one `cli:mcpc` skill from the same server), **When** the caller invokes `extractMcpSkill` once and `renderSkill` twice with different targets, **Then** both outputs are produced without re-running the extraction — the `ExtractedSkill` IR is target-agnostic and reusable.

---

### User Story 7 — Annotation Enrichment via Extended Metadata (Priority: P3)

An MCP server author wants richer SKILL.md output than the raw MCP spec alone provides. The MCP `tool.description` field is a single string; the author wants to express `@useWhen`, `@avoidWhen`, and `@pitfalls` for each tool. The extractor looks for these fields in the MCP server's tool metadata under a namespaced extension, mirroring how the TypeDoc extractor reads custom JSDoc tags.

**Why this priority**: Additive polish, not a blocker. The MCP spec's `_meta` field is experimental; supporting a convention for richer extraction raises the ceiling on skill quality without breaking base compatibility.

**Independent Test**: Construct a fake MCP server whose tool definitions include a `_meta.toSkills` object with `useWhen` and `avoidWhen` arrays; verify the rendered SKILL.md includes a "When to Use" section derived from those arrays.

**Acceptance Scenarios**:

1. **Given** a tool whose `_meta` field contains `{ "toSkills": { "useWhen": ["..."], "avoidWhen": ["..."], "pitfalls": ["..."] } }`, **When** extraction runs, **Then** those arrays populate the corresponding fields on the generated `ExtractedFunction`.
2. **Given** a tool without any `_meta.toSkills` extension, **When** extraction runs, **Then** only the base `name`, `description`, and `inputSchema` are used — no error, no invented content.
3. **Given** a server that declares extension fields at the server level (via the `serverInfo._meta.toSkills` convention), **When** extraction runs, **Then** those apply to the SKILL.md overview (`packageDescription`, `remarks`, aggregated `useWhen`).
4. **Given** bundle mode in a package whose server emits `_meta.toSkills` annotations, **When** the bundle runs, **Then** those annotations flow through to the committed SKILL.md automatically — the server source is the single source of truth for both runtime metadata and generated documentation.

---

### Edge Cases

- **MCP server exposes zero tools**: Produce a SKILL.md with the server's description and a note that this server exposes only resources or prompts. Never fail.
- **MCP server exposes 100+ tools**: Token-budget `references/tools.md` using the existing core budgeting logic. If the budget is exceeded, split by JSON Schema tag or by the tool's namespace prefix (e.g., `github.issues.*` vs `github.pulls.*`).
- **Tool `inputSchema` uses `$ref` to a shared schema**: Resolve references before rendering. Rendered output never contains unresolved `$ref` pointers — they're meaningless to an agent reading the file.
- **Tool `inputSchema` is missing or invalid JSON Schema**: Record the tool's name and description in Quick Reference but omit the parameter table in references. Flag in the audit engine as a `warning` severity issue.
- **Server announces `listChanged` capability and tools change during extraction**: Extraction is a snapshot — the tool list at the time of the `tools/list` response is the ground truth. Do not subscribe to change notifications.
- **Server requires initialization parameters** (e.g., workspace path for a filesystem server): The user supplies these via CLI args or the config file. If initialization fails because of missing params, report clearly.
- **Bundle mode invoked without a built server**: If `to-skills.mcp.bin` points at a path that doesn't exist, fail with a clear message suggesting the user run their build step first.
- **Bundle mode in a package whose `bin` differs from what the skill should launch**: The `to-skills.mcp` config takes an explicit `command` + `args` override. The frontmatter records whatever the user configured; the tool doesn't second-guess.
- **Bundle mode in a package that isn't published to npm**: The generated frontmatter uses the local package name anyway. If a consumer tries `npx skills add <name>` against an unpublished name, that's the consumer's problem — bundle mode's job is to produce correct output, not to verify distribution readiness.
- **Both `--url` and `--command` supplied to extract**: Error. They are mutually exclusive.
- **Same server name appears in multiple configs or arguments**: Second write errors unless `--force` is passed, matching behavior of TypeDoc extractor output collisions.
- **Authentication fails mid-extraction**: Treat as a transport error; do not partially write output for that server.
- **Protocol version mismatch**: If the server's `protocolVersion` in the initialize response is newer than the client library supports, attempt extraction and warn. If older than a minimum supported version, refuse.
- **Invocation target references a CLI the user hasn't installed**: Rendering proceeds — the skill documents the commands regardless. The generated skill's Setup section explicitly tells the consumer to install the target CLI (with the right `npm i -g` or `pip install` command). The tool does not attempt to verify the CLI is present on the authoring machine.
- **Invocation target argument-encoding cannot represent a tool's inputSchema**: Some tool schemas (deeply nested objects, arbitrary binary payloads, schemas with recursive `$ref`) don't round-trip through a CLI's shell-argument syntax. When a parameter exceeds the target CLI's representational capacity, the rendered command uses the target's JSON-object fallback (e.g., mcpc's `--json '{...}'`, fastmcp's single-JSON-argument form). The renderer MUST choose the fallback automatically rather than producing a broken command.
- **A server exposes a tool whose name collides with the target CLI's reserved subcommands**: Rare but possible (e.g., a tool literally named `connect` for a CLI whose top-level command is also `connect`). Prefix with the configured session/server alias per target conventions. Document the prefix in the Setup section so the consumer knows which shell invocation pattern to follow.
- **Bundle mode with a CLI invocation target**: The generated skill does NOT embed `mcp:` frontmatter, because invocation flows through the CLI not through direct MCP protocol. The skill's Setup section instead documents the one-time `mcpc connect` (or equivalent) the consumer runs after installing the bundled package. The package.json `files` warning (FR-035) is unchanged.
- **Two invocation targets produce skills with colliding output paths**: When the user runs extract with two `--invocation` flags (or a build script renders twice) targeting the same `--out` directory, the second write collides. Resolve by suffixing the skill directory with the target name (`skills/<name>-mcp-protocol/`, `skills/<name>-mcpc/`) when more than one invocation target is active in the same run.

## Clarifications

### Session 2026-04-21

- Q: Should extract cache MCP connection results to speed up repeated runs? → A: No. Every run does a fresh handshake. The MCP server itself is the source of truth; caching introduces staleness risk.
- Q: Should the generated SKILL.md include an executor that calls the server at agent runtime? → A: No. Output is documentation-only. Execution is the agent harness's responsibility. The `mcp:` frontmatter block tells the harness how to connect; the harness's existing MCP client handles the protocol. This is the primary architectural difference from `mcp-to-skill-converter`.
- Q: Should bundle mode modify the consumer's package.json (e.g., adding `skills/` to `files`)? → A: No. Bundle reads package.json to verify configuration and may emit warnings, but never writes to it. The maintainer owns their package.json.
- Q: How should bundle-mode frontmatter reference the server when both live in the same package? → A: Via the package name using npx, not via file paths. `npx -y @org/pkg` resolves correctly whether the consumer has the package installed locally, globally, or accessed via npx's fetch path. File paths would require the skill to know its installation location.
- Q: Should bundle mode support servers that require compilation or bundling beyond what `postbuild` can express? → A: Bundle is a postbuild step. If the server needs multiple build stages, the maintainer composes those in their own `build` script and invokes bundle after all stages complete. Bundle does not orchestrate multi-stage builds.
- Q: Does either mode produce `llms.txt` like the TypeDoc extractor does? → A: Yes, gated behind the same `llmsTxt: true` option that core already supports. Reuse the existing renderer in both modes.
- Q: What happens if the MCP spec adds a native Skills primitive in the future? → A: The package's internal architecture separates transport (MCP SDK) from rendering (core) from the new `mcp:` frontmatter writer. A future spec addition would be a new render target alongside the existing SKILL.md output, not a rewrite.
- Q: Why ship multiple invocation targets instead of just `mcp-protocol` and letting users post-process? → A: Two reasons. First, the skills ecosystem is broader than the MCP ecosystem — agents without MCP support are the majority case, not the exception. Emitting skills that work for them out of the box is the whole point. Second, translating `inputSchema` into a target CLI's argument syntax is not trivial (type coercion, nested objects, arrays, enums, required vs optional), and doing it once inside the package is strictly better than asking every consumer to reimplement it.
- Q: Should the package ship its own CLI wrapper for invoking MCP backends? → A: No. Multiple mature MCP CLIs already exist (`mcpc`, `fastmcp`, `mcptools`, `mcp-cmd`). Building yet another would be redundant. The value-add is generating skills that reference whichever CLI the consumer prefers — the CLI is infrastructure, the skill is the product.
- Q: How are third-party invocation targets resolved? → A: Via a simple naming convention. The invocation string `cli:foo` causes the package to require `@skillit/target-foo` (or a configurable resolver path); if present, its default export is used as the adapter. If missing, the package emits a clear error listing installed targets. No dynamic registry, no config-driven plugin discovery — just npm install + flag.
- Q: Does an invocation target change what extract calls over the wire? → A: No. Extract always uses the MCP protocol to introspect the server regardless of target. Target selection only affects rendering. The same `ExtractedSkill` IR can be rendered into any target without re-extracting.
- Q: Can bundle mode emit skills for multiple invocation targets from one run? → A: Yes. The `to-skills.mcp` config accepts an `invocation` field that may be a string or an array of strings. When an array, bundle mode emits one skill directory per target, disambiguated per the edge case above. This lets a maintainer ship both an MCP-protocol skill and a CLI-invocation skill in the same package for maximum agent compatibility.
- Q: Are `mcp-protocol` and `cli:*` just different output formats, or something architecturally distinct? → A: Architecturally distinct. `mcp-protocol` produces skills where the agent harness holds the MCP session directly. `cli:*` targets produce skills where an externally-installed CLI terminates the MCP protocol at the shell boundary — the agent never sees MCP, the CLI is the MCP client, and session/auth/retry state lives in the CLI. The IR is shared; the runtime topology is not. Tests, docs, and audit rules must treat the two paths as distinct architectures rather than cosmetic render variants. (Practically: CLI targets need round-trip correctness tests on argument encoding; `mcp-protocol` does not. `mcp-protocol` needs frontmatter-dialect verification against harnesses that consume it; CLI targets do not.)
- Q: If the target CLI changes its argument grammar (e.g., a breaking minor release of `mcpc`), previously-generated skills in the wild become subtly stale. How do consumers know to regenerate? → A: The CLI-target rendered SKILL.md MUST embed the adapter package name and version in the Setup section (e.g., "Generated for mcpc 2.1.x via @skillit/target-mcpc 1.4.0"). The audit engine MUST flag a skill whose embedded adapter version is older than the currently-installed adapter. This gives consumers a mechanical signal to regenerate without requiring runtime coupling between the skill and the CLI.

## Requirements _(mandatory)_

### Functional Requirements — Shared

**Transport & Connection**

- **FR-001**: The package MUST support local MCP servers via stdio transport, launched with a command and args.
- **FR-002**: The package MUST support remote MCP servers via HTTP transport using the Streamable HTTP or SSE variants, as determined by content negotiation with the server.
- **FR-003**: The package MUST support custom headers (e.g., `Authorization`) forwarded on every request in the session.
- **FR-004**: The package MUST perform the standard MCP `initialize` handshake before requesting tools, resources, or prompts, advertising a client name of `@skillit/mcp` with the current package version.
- **FR-005**: The package MUST use the official `@modelcontextprotocol/sdk` client library for all transport and protocol handling; it MUST NOT implement JSON-RPC framing itself.

**Extraction**

- **FR-006**: The package MUST request the full list of tools via `tools/list`, paginating if the server returns a cursor, until all tools are collected.
- **FR-007**: The package MUST request resources and prompts via `resources/list` and `prompts/list` respectively, if the server advertises those capabilities in the initialize response.
- **FR-008**: The package MUST NOT invoke any tools, read any resources, or execute any prompts. Extraction is metadata-only.
- **FR-009**: For each tool, the package MUST capture `name`, `description`, `inputSchema`, and any extension metadata under `_meta.toSkills`.
- **FR-010**: The package MUST resolve JSON Schema `$ref` pointers within `inputSchema` before rendering; rendered output MUST NOT contain unresolved `$ref` references.
- **FR-011**: If a tool's `inputSchema` is missing or fails JSON Schema parsing, the package MUST record the tool in Quick Reference but omit the parameter table and emit an audit warning.

**Intermediate Representation**

- **FR-012**: The package MUST produce an `ExtractedSkill` object compatible with `@skillit/core`'s `renderSkill` function — the same IR used by TypeDoc and CLI extractors.
- **FR-013**: MCP tools MUST map to `ExtractedFunction` entries, with `inputSchema` properties expanded into `ExtractedParameter[]`.
- **FR-014**: MCP resources MUST map to a new `resources: ExtractedResource[]` field on `ExtractedSkill`, added to `@skillit/core`. Each `ExtractedResource` has `uri`, `name`, `description`, `mimeType`.
- **FR-015**: MCP prompts MUST map to a new `prompts: ExtractedPrompt[]` field on `ExtractedSkill`, added to `@skillit/core`. Each `ExtractedPrompt` has `name`, `description`, and an `arguments` array of typed parameters.

**Rendering**

- **FR-016**: The generated `SKILL.md` MUST include YAML frontmatter (`name`, `description`, `license`) consistent with other to-skills outputs.
- **FR-017**: The generated `SKILL.md` MUST include a Quick Reference table listing all tools, resources, and prompts with one-line summaries and relative links to the corresponding reference files.
- **FR-018**: `references/tools.md` MUST list each tool with its full description, parameter table, and any extension-derived `useWhen`/`avoidWhen`/`pitfalls` sections.
- **FR-019**: `references/resources.md` (when resources exist) MUST list each resource with its URI template, name, description, MIME type.
- **FR-020**: `references/prompts.md` (when prompts exist) MUST list each prompt with its name, description, and argument table.
- **FR-021**: Each reference file MUST be independently token-budgeted via `@skillit/core`'s `truncateToTokenBudget`, defaulting to 4000 tokens.
- **FR-022**: When a reference file exceeds its token budget, content MUST be split by namespace prefix (e.g., `github.issues.*` becomes `references/tools-github-issues.md`).

### Functional Requirements — Extract Mode

- **FR-023**: The CLI MUST expose `extract` as a subcommand: `npx @skillit/mcp extract [options]`.
- **FR-024**: The `extract` subcommand MUST accept a single-server form (`--command` or `--url`) and a multi-server form (`--config path/to/mcp.json`).
- **FR-025**: The `extract` subcommand MUST accept `--out <dir>` (default `skills`), `--max-tokens <n>` (default 4000), and `--llms-txt` (default false), mirroring the TypeDoc extractor's options.
- **FR-026**: The `extract` subcommand MUST read config files matching Claude Desktop's `mcpServers` schema without transformation.
- **FR-027**: The `extract` subcommand MUST exit with status 0 on success and non-zero on any extraction failure, with diagnostics written to stderr.
- **FR-028**: The package MUST export `extractMcpSkill(options): Promise<ExtractedSkill>` for programmatic use.

### Functional Requirements — Bundle Mode

- **FR-029**: The CLI MUST expose `bundle` as a subcommand: `npx @skillit/mcp bundle [options]`. With no options, it MUST read configuration from the nearest `package.json`'s `to-skills.mcp` field.
- **FR-030**: The `to-skills.mcp` config in package.json MUST support a single server or an array of servers:

  ```json
  {
    "to-skills": {
      "mcp": {
        "skillName": "my-server",
        "command": "node",
        "args": ["./dist/server.js"]
      }
    }
  }
  ```

  or

  ```json
  {
    "to-skills": {
      "mcp": [
        { "skillName": "server-a", "command": "node", "args": ["./dist/a.js"] },
        { "skillName": "server-b", "command": "node", "args": ["./dist/b.js"] }
      ]
    }
  }
  ```

- **FR-031**: When `command` and `args` are omitted, bundle mode MUST derive a launch command from the package's `bin` field. If no `bin` exists, the tool MUST fail with a clear message.
- **FR-032**: For each configured server, bundle mode MUST launch the server via the configured command, perform extract as defined in FR-001 through FR-022, and write the result into `<packageRoot>/skills/<skillName>/`.
- **FR-033**: Generated `SKILL.md` frontmatter MUST include an `mcp:` block that self-references the package by name:

  ```yaml
  mcp:
    <skillName>:
      command: npx
      args: ['-y', '<packageName>']
  ```

  Where `<packageName>` is read from the same package.json's `name` field.

- **FR-034**: When the package has multiple bins and the configured launch command corresponds to a named bin, the frontmatter MUST use the `--package` form: `npx -y --package=<packageName> <binName>`.
- **FR-035**: Bundle mode MUST check the package.json `files` field and emit a warning (not an error) if either `dist/` (or the equivalent output dir) or `skills/` is missing. The warning MUST include the exact line to add but MUST NOT modify package.json.
- **FR-036**: Bundle mode MUST accept a `--skip-audit` flag to disable the audit engine in CI contexts where audit failures would block publishing.
- **FR-037**: The package MUST export `bundleMcpSkill(options): Promise<BundleResult>` for programmatic use, where `BundleResult` reports which skills were written, any audit issues, and any package.json warnings.
- **FR-038**: Bundle mode MUST be idempotent when the server's surface hasn't changed. Running `bundle` twice in a row against an unchanged server MUST produce byte-identical output the second time.

### Functional Requirements — Invocation Targets

- **FR-IT-001**: The CLI MUST accept an `--invocation <target>` flag on both `extract` and `bundle` subcommands. The default value MUST be `mcp-protocol`.
- **FR-IT-002**: The `--invocation` flag MUST accept values of the form `mcp-protocol` (the default) or `cli:<name>` (e.g., `cli:mcpc`, `cli:fastmcp`, `cli:mcptools`). The flag MAY be repeated to emit skills for multiple targets in one run.
- **FR-IT-003**: The package MUST ship built-in adapters for at least three targets at v1: `mcp-protocol`, `cli:mcpc`, and `cli:fastmcp`. A fourth target, `cli:mcptools`, SHOULD ship at v1 if implementation effort permits but MAY defer to a later version.
- **FR-IT-004**: Each invocation target adapter MUST implement a documented interface that takes an `ExtractedSkill` plus target-specific options and returns the rendered SKILL.md + references output. The interface MUST be exported from `@skillit/mcp` for third-party adapters.
- **FR-IT-005**: Third-party invocation target packages MUST be resolvable by the convention `@skillit/target-<n>` (scoped) or `to-skills-target-<n>` (unscoped). When the user passes `--invocation cli:foo`, the package MUST attempt to `require` `@skillit/target-foo` first, falling back to `to-skills-target-foo`, and MUST emit a clear error if neither resolves.
- **FR-IT-006**: The `mcp-protocol` target MUST emit `mcp:` frontmatter as specified in Story 4 (FR-033, FR-034). CLI targets MUST NOT emit `mcp:` frontmatter; instead, they MUST emit a Setup section in the SKILL.md body documenting the target CLI's installation and one-time-setup commands.
- **FR-IT-007**: CLI target adapters MUST translate each tool's `inputSchema` into the target CLI's argument convention. Scalar parameters (strings, numbers, booleans) render as target-native flags; object or array parameters that exceed the target's simple-argument representation MUST fall back to the target's JSON-payload form without producing malformed commands.
- **FR-IT-008**: Bundle mode's `to-skills.mcp` config MUST accept an `invocation` field that is either a string (one target) or an array of strings (multiple targets). When the field is absent, bundle mode MUST default to `mcp-protocol`.
- **FR-IT-009**: When bundle mode emits skills for multiple invocation targets in one run, the output directory for each target MUST be disambiguated (e.g., `skills/<n>-mcp-protocol/`, `skills/<n>-mcpc/`) to avoid collisions.
- **FR-IT-010**: The `renderSkill` function in `@skillit/core` MUST accept an `invocation` parameter that selects the adapter. The same `ExtractedSkill` IR MUST be renderable into any installed target without re-running extraction.
- **FR-IT-011**: When rendering with a CLI target, the SKILL.md's Quick Reference table MUST show target-native commands (not MCP tool names). Full parameter tables in references files MUST be annotated with both the MCP tool's original parameter name and the target CLI's flag or key, so a developer can trace the mapping when debugging.
- **FR-IT-012**: Skills rendered with a CLI target MUST embed the adapter package name and version in the Setup section of SKILL.md (human-readable form, e.g., "Generated for mcpc 2.1.x via @skillit/target-mcpc 1.4.0") AND in a machine-readable field of the YAML frontmatter (e.g., `generated-by: { adapter: "@skillit/target-mcpc", version: "1.4.0", target-cli-range: "mcpc@^2.1" }`). This gives consumers a mechanical signal to regenerate when the adapter has advanced past the skill's embedded version.
- **FR-IT-013**: The audit engine MUST emit a warning when a generated skill's embedded adapter version (per FR-IT-012) is older than the currently-installed adapter in the authoring environment. This is a freshness check at re-audit time, not a runtime coupling.

### Functional Requirements — Audit Integration

- **FR-039**: Both modes MUST integrate with the existing audit engine in `@skillit/core`, contributing MCP-specific checks: missing tool descriptions (fatal), missing input schemas (error), missing `useWhen` annotations (warning), generic tool names (alert).
- **FR-040**: Audit issues MUST be surfaced with severity codes prefixed by `M` (e.g., `M1`, `M2`) to distinguish them from TypeDoc (`F`, `E`, `W`, `A`) audit codes.
- **FR-041**: Bundle mode MUST fail the build (non-zero exit) on fatal or error severity audit issues when the `skillsAuditFailOnError` config option is set, matching TypeDoc extractor behavior.

### Key Entities

- **McpExtractOptions**: Configuration for a single extract run — transport choice, connection parameters, output options, audit options, invocation target(s).
- **McpBundleOptions**: Configuration for a bundle run — typically a `packageRoot` path, optionally overriding skill name, output directory, or invocation target(s). All other values come from the package.json `to-skills.mcp` block.
- **BundleResult**: The return value of `bundleMcpSkill` — contains written file paths (keyed by invocation target when multiple are emitted), audit results per skill, and warnings about package.json configuration.
- **ExtractedResource**: New field added to `ExtractedSkill` in core. Represents an MCP resource with URI, name, description, MIME type.
- **ExtractedPrompt**: New field added to `ExtractedSkill` in core. Represents an MCP prompt with name, description, arguments.
- **McpServerConfig**: The entry schema for a single server in the extract-mode `mcp.json` config file. Mirrors Claude Desktop's `mcpServers[name]` schema.
- **McpFrontmatter**: The `mcp:` block emitted into bundled SKILL.md frontmatter by the `mcp-protocol` invocation target. Maps server name to `{ command, args, env? }`, matching the conventions already in use by OpenCode, Codex, and Cursor's skill embedding implementations. Not emitted by CLI invocation targets.
- **InvocationTarget**: An identifier string of the form `mcp-protocol` or `cli:<n>` that selects a rendering adapter. Each target has an associated adapter package (built-in or third-party) that translates `ExtractedSkill` into the final SKILL.md + references output for that target.
- **InvocationAdapter**: The pluggable component a target provides. Accepts an `ExtractedSkill` plus adapter-specific options and returns the rendered files. Built-in adapters: `McpProtocolAdapter`, `McpcAdapter`, `FastMcpAdapter`, `McpToolsAdapter`.
- **AuditIssueMcp**: Audit issues specific to MCP, carrying the `M<digit>` severity codes.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Running extract against the `@modelcontextprotocol/server-filesystem` reference server produces a SKILL.md whose Quick Reference lists all tools exposed by that server, with no missing or duplicated entries.
- **SC-002**: For a server with 20 tools, the generated SKILL.md stays under 500 tokens and `references/tools.md` stays under 4000 tokens or splits cleanly.
- **SC-003**: A developer who runs the core audit engine on a generated skill sees a score estimate comparable to a well-annotated TypeDoc-generated skill (within 15% of the skill-judge rubric's B+ band).
- **SC-004**: Bundle mode in a reference project produces an npm package that, when published and installed, works correctly as an MCP server (via the package's `bin`) AND as a skill (via `npx skills add <pkg>`) — both consumption paths verified end-to-end.
- **SC-005**: The `mcp:` frontmatter emitted by bundle mode is consumed correctly without modification by at least two agent harnesses that support skill-embedded MCP configuration (e.g., OpenCode's embedded-skill plugin, Codex plugins).
- **SC-006**: Bundle mode completes in under 30 seconds on a typical CI machine for a server with 30 tools, 10 resources, and 5 prompts, excluding the server's own startup time.
- **SC-007**: `extractMcpSkill` composed with `@skillit/core`'s `renderSkill` produces output functionally equivalent to what `bundleMcpSkill` produces for the same server, verified via snapshot test.
- **SC-008**: The extractor successfully connects to and extracts from at least three categories of MCP servers during testing: a reference Anthropic server, a third-party TypeScript server (e.g., `@modelcontextprotocol/server-github`), and a Python server (e.g., any FastMCP-based server).
- **SC-009**: Both modes produce byte-identical output when run twice in a row against the same server or unchanged package, enabling clean commits and reliable CI diffs.
- **SC-010**: A skill generated with `--invocation cli:mcpc` is consumable end-to-end by an agent with only a shell tool: the agent reads the SKILL.md, identifies the right command for a test task, runs it via shell, and receives correct output. Verified with at least one non-MCP-native agent harness.
- **SC-011**: Running extract twice against the same server with two different invocation targets (`mcp-protocol` and `cli:mcpc`) produces two distinct, valid skill directories whose underlying `ExtractedSkill` IR matches — confirming that extraction is target-agnostic and reusable.
- **SC-012**: A third-party adapter package installed via `npm i @foo/to-skills-target-foo` is resolvable via `--invocation cli:foo` and produces valid output without any changes to `@skillit/mcp` itself.

## Assumptions

- Users of bundle mode own the package they're bundling. Users of extract mode have the target server's binary installed or have access to its remote endpoint. The package does not install servers on behalf of users.
- The MCP SDK's TypeScript client library (`@modelcontextprotocol/sdk`) is stable enough to take a dependency on; breaking changes are rare and signaled.
- Tool `description` fields in published MCP servers are human-readable enough to serve as SKILL.md content without rewriting. If they are not, the annotation enrichment feature (User Story 7) is the escape hatch.
- Most MCP servers declare a reasonable number of tools (under 100). Servers that expose hundreds of tools are an edge case handled by token-budgeting and namespace splitting.
- The `mcp:` frontmatter convention used by bundle mode is stable enough across OpenCode, Codex, and Cursor to produce forward-compatible output. If these harnesses diverge, the writer abstraction in the package allows emitting multiple frontmatter dialects without changing extract logic.
- Consumers of a bundled package have `npx` available. For consumers without npx (rare), the generated frontmatter is still valid config they can adapt manually.
- The audit engine's existing `AuditContext` type can accommodate MCP-specific context fields without breaking TypeDoc audits.
- For CLI invocation targets, the target CLI (`mcpc`, `fastmcp`, etc.) is stable enough that its argument-encoding conventions don't change between minor releases. If a target CLI introduces a breaking change, the adapter version is pinned and updated deliberately — not tracked as a floating dependency.
- Agents that consume CLI-invocation-target skills have a reliable shell tool that can execute commands and capture stdout/stderr. This is true for every major coding agent but not universally guaranteed for non-coding-context agents (e.g., pure chat UIs without code execution).
- Users selecting a CLI invocation target are willing to install one additional CLI tool as a prerequisite to using their MCP backends. This is a real friction point for some users but is strictly better than requiring every agent harness to natively support MCP.
- CLI-target skills embed an adapter-version fingerprint (FR-IT-012) rather than relying on runtime coupling between the skill and the installed CLI. This decouples skill distribution from CLI upgrade cycles while still giving consumers a mechanical signal to regenerate when the adapter has drifted forward — the freshness check happens at re-audit time, not at agent-invocation time.

## Scope Boundaries

**In scope**:

- stdio and HTTP transports via the official MCP SDK
- Extraction of tools, resources, prompts, and server-level metadata
- Generation of SKILL.md and progressive-disclosure reference files
- CLI with `extract` and `bundle` subcommands
- Programmatic API for both modes
- Single-server and batch (config-file) extraction in extract mode
- Single-server and multi-server configurations in bundle mode
- Multiple invocation targets: `mcp-protocol` (default) plus CLI targets `cli:mcpc` and `cli:fastmcp` built in at v1
- Plugin interface for third-party invocation target adapters
- Self-referential `mcp:` frontmatter generation in `mcp-protocol` target under bundle mode
- Setup-instruction rendering for CLI targets (in lieu of `mcp:` frontmatter)
- Integration with the existing core renderer, audit engine, and token budgeting
- Extension metadata support via `_meta.toSkills` convention
- `llms.txt` output gated on the existing core flag

**Out of scope**:

- Invoking MCP tools or reading MCP resources (extraction is metadata-only)
- Bundling a runtime executor that calls the MCP server at agent runtime (that's `mcp-to-skill-converter`'s scope and a different architectural choice — documented in Clarifications)
- Shipping a new MCP CLI — mature options already exist (`mcpc`, `fastmcp`, `mcptools`, `mcp-cmd`); we generate skills that target them rather than competing
- Serving a local skills directory as an MCP resource provider (that's `skill-to-mcp` and FastMCP's `SkillsDirectoryProvider` territory; explicitly deferred)
- Authentication negotiation beyond passing pre-supplied headers
- Real-time monitoring of MCP server changes via `listChanged` notifications
- Generating Python or other non-TypeScript output
- Editing existing SKILL.md files incrementally — every run is a full overwrite
- Modifying the consumer's package.json in bundle mode
- Orchestrating multi-stage builds in bundle mode (it's a postbuild step)
- Verifying that target CLIs are installed on the authoring machine (the generated skills' Setup section documents the requirement; installation is the consumer's responsibility)

## Competitive Landscape

**GBSOSS/mcp-to-skill-converter (Python)** converts MCP configs into Claude-specific skills by bundling a Python `executor.py` that calls the MCP server at agent runtime. Claims "90% context savings" by lazy-loading tool definitions at invocation. Pursues the same context-bloat win our CLI-target architecture pursues — but solves it by **bundling a runtime executor** (requires Python, embeds the proxy inside each skill), whereas our `cli:*` targets solve it by **delegating to an externally-installed CLI** (no bundled runtime, proxy process lives outside the skill). Both are "CLI-as-proxy" models in spirit; theirs couples the proxy to the skill artifact, ours couples the proxy to the consumer's environment. Our `mcp-protocol` target covers the complementary case (context bloat is acceptable, harness MCP support is available). One converter, two architectures; one bundled Python runtime vs. one pluggable adapter registry — the tradeoffs differ, and consumers pick per deployment.

**biocontext-ai/skill-to-mcp (Python)** is the inverse direction — it exposes a local skills directory as an MCP server so MCP clients can list and read skills as resources. Not a competitor; a complement. Explicitly out of scope for this spec; a future `@skillit/serve` package could cover this for TypeScript-native users.

**FastMCP `SkillsDirectoryProvider` (Python)** is the Python-native equivalent of skill-to-mcp. Same orthogonal positioning.

**android-skills-mcp (skydoves, TypeScript)** is the closest architectural cousin. It ships two artifacts from one repo: an MCP server that exposes a skills library, and a `pack` CLI that converts each SKILL.md into seven native rules formats (Claude Code, Cursor, Copilot, Gemini, Junie, Continue, Aider). Different input (curated Android skills from upstream) and different output (native rules files, not generated SKILL.md). Shares the insight that one package can serve both the MCP ecosystem and the skills ecosystem simultaneously — which is exactly what bundle mode productizes for arbitrary MCP servers.

**neutree-ai/openapi-to-skills (TypeScript)** converts OpenAPI specs into agent skills using a similar parser → IR → renderer → writer pattern. Stylistically the closest to to-skills, but targets a different input (OpenAPI) and lives in its own repo. The architectural similarities confirm the pattern is right. There is no reason for the two projects to converge unless neutree-ai chooses to contribute their OpenAPI extractor to the to-skills monorepo.

**OpenCode embedded-skill MCP plugin (TypeScript)** lets skills bundle and manage their own MCP servers via markdown frontmatter or `mcp.json`. This is the consumer side of what bundle mode produces — OpenCode reads the exact frontmatter convention bundle mode emits. Validates the design.

**OpenAI Codex plugins** bundle skills together with MCP server configuration, app mappings, and presentation assets. Similar consumer-side validation for bundle mode's output format.

**Anthropic's built-in `mcp-builder` skill** guides an agent through building an MCP server. Prescriptive authoring guidance, not programmatic extraction. Orthogonal.

**Figma's "Create skills for the Figma MCP server" docs** walk a developer through hand-writing a skill for the Figma MCP server. Manual authoring, not programmatic extraction. Orthogonal.

**Apify/mcpc (TypeScript)** is a feature-complete universal MCP CLI — persistent sessions, OAuth 2.1, stdio/HTTP, tasks, JSON output, x402 payment support. Explicitly positions itself as enabling "AI coding agents to use MCP 'code mode' in shell" and acknowledges the context-bloat problem that native MCP-in-context creates. This is the mature target we'd render to when a user passes `--invocation cli:mcpc`. Not a competitor — a distribution target.

**FastMCP CLI (`fastmcp list`, `fastmcp call`)** is the Python-native equivalent, explicitly positioned for "LLM-based agents that lack native MCP support." JSON output is "designed for programmatic consumption" by agents using shell tools. Another rendering target for our CLI invocation mode, not a competitor.

**f/mcptools (Go)** offers the richest command surface of any MCP CLI: `tools`, `call`, `shell`, `web`, `proxy`, `mock`, `alias`, `configs`. Multi-transport, JSON output. A third viable rendering target.

**IBM/mcp-cli (Python)** and **developit/mcp-cmd (Node)** are additional CLI implementations with different architectural tradeoffs (IBM ships LLM integration; mcp-cmd keeps background server processes for reuse). Either could become a future invocation target.

**MCPShell (Go)** inverts the direction — it wraps arbitrary shell commands _as_ MCP tools for LLMs that do speak MCP. Different direction, different audience, complementary rather than competing.

**Summary**: The MCP CLI space is mature and crowded — building yet another MCP CLI would be redundant. But nobody has built the layer on top that generates skills describing those CLIs' commands. That's the niche this spec targets: a single package that (a) programmatically extracts a SKILL.md from any live MCP server, (b) bundles a generated SKILL.md into the MCP server's own published package, and (c) renders to multiple invocation targets so the same extraction serves MCP-native agents (via `mcp:` frontmatter) and non-MCP agents (via documented CLI commands through `mcpc`, `fastmcp`, `mcptools`, or third-party adapters). `mcp-to-skill-converter` is the closest functional competitor but takes a fundamentally different architectural approach (runtime executor bundle vs documentation-only). No competitor offers bundle mode. No competitor offers pluggable invocation targets. Being the first TypeScript-native extractor-plus-bundler that bridges MCP backends to both ecosystems — MCP-native and CLI-driven — from a single extraction is a defensible position, and the CLI incumbents (`mcpc`, `fastmcp`, `mcptools`) are rendering targets, not competitors.
