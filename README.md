# skillit

> **skillit** — Compile-time generator of AI agent skills from your codebase.

Inline docs, CLI definitions, config schemas, and examples compile into progressively disclosed [SKILL.md](https://agentskills.io) files that any LLM can discover. Integrated with TypeDoc, with support for conventional repo docs, and plugins for Docusaurus and VitePress provided for what code can't cover.

## MCP Servers (orthogonal workflow)

`skillit` can also generate skills from **any live MCP server**, even when the
server was not authored with `skillit`.

This is separate from the TypeDoc/docs extraction flow above: it introspects MCP
tools/resources/prompts over stdio or HTTP and emits a progressive-disclosure
`SKILL.md`. You can render:

- native MCP launch instructions (`mcp:` frontmatter in `SKILL.md`, which tells
  MCP-capable agents how to start/connect to the server), or
- CLI-proxy launch instructions for non-MCP harnesses (such as mcpc/fastmcp).

```bash
# Inspect any running or launchable MCP server and generate skills
npx skillit mcp extract \
  --command "npx -y @modelcontextprotocol/server-filesystem /tmp" \
  --out ./skills

# Optional: install non-default CLI invocation adapters
npm install --save-dev @skillit/target-mcpc @skillit/target-fastmcp

# Emit CLI-proxy invocation variants for non-MCP agents
npx skillit mcp extract \
  --command "npx -y @modelcontextprotocol/server-filesystem /tmp" \
  --invocation cli:mcpc \
  --invocation cli:fastmcp \
  --out ./skills
```

For server package authors, `skillit mcp bundle` can be run in your build to
ship pre-generated skills with your MCP package.

See [`packages/mcp/README.md`](packages/mcp/README.md) for install, extract,
bundle, config-file batch mode (`mcp.json` / `claude_desktop_config.json`), and
programmatic API details.

### Bootstrap (recommended): `/skillit-bootstrap`

The primary way to create or improve a skill is the **`/skillit-bootstrap`**
Claude Code skill (bundled with `@skillit/client`). It runs the deterministic
generate → audit loop and lets the agent enrich your repo's source (JSDoc,
README, examples, package.json) until the skill hits its grade target — you
never hand-edit a `SKILL.md`.

```bash
# Install the bundled skill into your user skill roots (one time)
mkdir -p ~/.claude/skills ~/.copilot/skills ~/.agents/skills
cp -R node_modules/@skillit/client/skills/skillit-bootstrap ~/.claude/skills/
cp -R node_modules/@skillit/client/skills/skillit-bootstrap ~/.copilot/skills/
cp -R node_modules/@skillit/client/skills/skillit-bootstrap ~/.agents/skills/

# Then, in your agent:
/skillit-bootstrap --source cli --program ./dist/cli.js#program
/skillit-bootstrap --source typedoc
```

Supported sources this release: **cli** and **typedoc**. For `config` / `mcp`,
use `skillit refine` (below); slash-command support for those lands in a later
phase. The CLI commands (`skillit gen`, `skillit audit --json`, `skillit
refine`) remain for headless/CI use.

### Init: detect → install

`skillit init` wires a project up. It detects the project's nature and installs
the matching `@skillit/*` package with your package manager, then points you at
`skillit gen` to produce the skill. It does **not** generate or refine — those
are separate, explicit commands (`skillit gen`, `skillit refine`).

```bash
# Auto-detects nature and package manager, installs the right @skillit package
npx skillit init

# Force the source kind
npx skillit init --source mcp

# Config source is built in (no install) — init just points at `skillit gen`
npx skillit init --source config --config-type ./src/config.ts#MyConfig
```

Detection:

- **Nature** — `commander` / `yargs` dep → `cli`; `@modelcontextprotocol/sdk` →
  `mcp`; otherwise a plain TS library → `typedoc`. Override with `--source`.
- **Package** — `cli` → `@skillit/cli`, `mcp` → `@skillit/mcp`, `typedoc` →
  `typedoc-plugin-skillit`. The `config` source is built into the CLI (no
  install).
- **Package manager** — `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm.

If the install step fails, `init` prints the exact add command and stops.

| Flag                           | Default | Description                       |
| ------------------------------ | ------- | --------------------------------- |
| `--source <cli\|mcp\|typedoc>` | auto    | Override project-nature detection |
| `--config-type <file#export>`  | —       | Config type entry (config source) |

### Gen: deterministic skill generation

`skillit gen` (re)generates the skill from the current source — no install, no
model, no network. It is the deterministic, side-effect-free generate primitive:
the same source always yields the same skill. Run it after `init`, and again
whenever you change the documented source (JSDoc, config type, README).

```bash
# Generate from the auto-detected source into skills/
npx skillit gen

# CLI source with an explicit commander program entry
npx skillit gen --source cli --program ./dist/cli.js#program

# Config source
npx skillit gen --source config --config-type ./src/config.ts#MyConfig

# Generate into a custom directory (default: skills)
npx skillit gen --out docs/skills
```

| Flag                                   | Default  | Description                              |
| -------------------------------------- | -------- | ---------------------------------------- |
| `--source <cli\|config\|mcp\|typedoc>` | auto     | Source kind                              |
| `--program <file#export>`              | —        | Commander program entry (cli source)     |
| `--config-type <file#export>`          | —        | Config type entry (config source)        |
| `--mcp <path>`                         | —        | MCP config path (mcp source)             |
| `--server <name>`                      | —        | MCP server entry (mcp source)            |
| `--out <dir>`                          | `skills` | Output directory for the generated skill |

### Audit: score + findings as JSON

`skillit audit` runs the same audit + judge the refine loop uses and prints the
result. With `--json` it emits the full `AuditResult` + score estimate, plus a
resolved on-disk location for each improvement target — the machine-readable
read-surface an agent (or CI) can act on without re-deriving anything.

```bash
# Human summary (grade + severity counts)
npx skillit audit --source cli

# Full machine-readable report
npx skillit audit --source config --config-type ./src/config.ts#MyConfig --json
```

| Flag                                   | Default | Description                            |
| -------------------------------------- | ------- | -------------------------------------- |
| `--source <cli\|config\|mcp\|typedoc>` | auto    | Source kind                            |
| `--program <file#export>`              | —       | Commander program entry (cli source)   |
| `--config-type <file#export>`          | —       | Config type entry (config source)      |
| `--mcp <path>`                         | —       | MCP config path (mcp source)           |
| `--server <name>`                      | —       | MCP server entry (mcp source)          |
| `--json`                               | off     | Emit the full audit + estimate as JSON |

### Refine: autonomous annotation loop

`skillit refine` runs an audit → draft → review loop that iteratively improves
the `useWhen` / `avoidWhen` annotations in your generated skills. On each pass it
asks an LLM to evaluate the current guidance, proposes improvements, and applies
them — no manual editing required.

Refine is **source-aware**. It auto-detects the source from the installed
`@skillit/*` package, or you can choose explicitly:

```bash
# CLI source — writes guidance back into the *Options interface JSDoc
npx skillit refine --source cli --program ./dist/cli.js#program

# MCP source (see modes below)
npx skillit refine --source mcp --mcp ./mcp.json
```

For the **cli** source, refine writes annotations into the JSDoc of your typed
`*Options` interface (e.g. `GenerateOptions`), correlated to each command's flags.

Two modes depending on whether you own the server's source:

**Build mode** — for TypeScript MCP servers you own. `refine` writes annotations
directly into source as `_meta` fields on each `server.tool(...)` call:

```typescript
server.tool(
  'read_file',
  {
    description: 'Read a file',
    _meta: { useWhen: 'After listing a directory to inspect a specific file' }
  },
  schema,
  handler
);
```

```bash
# Auto-detected when @modelcontextprotocol/sdk appears in package.json
npx skillit mcp refine

# Explicit
npx skillit mcp refine --mode build
```

**Runtime mode** — for any MCP server, including ones you don't own. `refine`
writes an overlay JSON file that `extract` / `bundle` merges at render time:

```bash
# Auto-detected when --mcp points to mcp.json / claude_desktop_config.json
npx skillit mcp refine --mcp ~/.config/claude/mcp.json

# Refine only a subset of tools
npx skillit mcp refine --mode runtime --mcp ./mcp.json --items filesystem,github
```

**Auto-detection** checks for an SDK dependency (build signal) and a runtime
config path (runtime signal). When both are present the command is ambiguous —
pass `--mode` explicitly.

Key flags:

| Flag                           | Default   | Description                                                                       |
| ------------------------------ | --------- | --------------------------------------------------------------------------------- |
| `--source <cli\|mcp\|typedoc>` | auto      | Refine source (auto-detected from installed package)                              |
| `--program <file#export>`      | —         | Commander program entry (cli source)                                              |
| `--mode build\|runtime`        | auto      | Override auto-detection                                                           |
| `--mcp <path>`                 | —         | Path to `mcp.json` or `claude_desktop_config.json`                                |
| `--source-glob <glob>`         | `**/*.ts` | Glob for TypeScript files to scan (build mode)                                    |
| `--max-iterations <n>`         | `5`       | Iteration cap for the audit→draft→review loop                                     |
| `--items <n>`                  | `5`       | Work items per iteration                                                          |
| `--model-client <kind>`        | `api`     | Model backend: `api` (ANTHROPIC_API_KEY) or a CLI: `claude` / `codex` / `copilot` |
| `--model-cli-timeout <ms>`     | `120000`  | Per-call timeout for CLI model backends                                           |

**CLI model backends.** Instead of the Anthropic API, `refine` (and `init`) can
drive the loop through an already-authenticated agent CLI — `--model-client claude`,
`codex`, or `copilot`. The drafter/reviewer prompts are identical; only the
transport changes. `claude` maps the drafter/reviewer split to Sonnet/Opus via
`--model`; `codex`/`copilot` use their configured default model. Each CLI must be
installed and authenticated. Note: `copilot` prioritizes a `GH_TOKEN`/`GITHUB_TOKEN`
environment variable over its `/login` credential — if that token lacks the
"Copilot Requests" permission, unset it so copilot uses your login. On Windows the
CLIs are launched through the shell to support `.cmd` shims; the prompt is always
piped via stdin (never passed as a command argument), so untrusted content never
reaches the command line.

## Why Inline?

When an agent updates your code, inline docs update atomically. There's no separate file to remember, no coordination problem, no drift. The agent edits ONE location and the truth propagates mechanically.

```typescript
/**
 * Parse a configuration file.
 *
 * @useWhen
 * - Loading config from user-provided paths
 * - Dynamic config resolution at startup
 *
 * @pitfalls
 * - NEVER trust user paths without sanitization — resolves relative to cwd
 *
 * @param path Path to the config file
 * @returns Parsed and validated configuration
 */
export function loadConfig(path: string): Config { ... }
```

`pnpm typedoc` → the generated skill tells every LLM _when_ to use this function, _what_ to watch out for, and _how_ to call it.

## Configuration (new approach)

`skillit` now centralizes routing in `skillit.config.ts` (scaffolded by `skillit init`):

```ts
import { defineConfig } from '@skillit/client';

export default defineConfig({
  skillDir: 'skills',
  plugins: {
    cli: { skillDir: 'skills/cli' },
    typedoc: { maxTokens: 4000 }
  }
});
```

Use `skillDir` for global output defaults and `plugins.<source>` overrides for
source-specific output/token behavior (`cli`, `config`, `mcp`, `typedoc`).

## Plugin/content-source routing matrix

| Plugin surface                                | Primary content source(s)                                      | Additional content source(s)                   |
| --------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `@skillit/core`                               | Shared renderer + writer + token budgeting                     | README/docs/examples scanners                  |
| `@skillit/cli`                                | Commander/yargs command trees + flags                          | Typed option-interface JSDoc correlation       |
| `@skillit/typedoc` / `typedoc-plugin-skillit` | TypeScript API + JSDoc tags                                    | package.json metadata + optional docs/examples |
| `@skillit/vitepress`                          | VitePress sidebar/doc pages                                    | Merged with typedoc/core output in one skill   |
| `@skillit/docusaurus`                         | Docusaurus docs + `_category_.json`                            | Merged with typedoc/core output in one skill   |
| `@skillit/mcp` (bundled)                      | MCP server introspection + invocation adapters                 | Package build metadata (`skillit.mcp`)         |
| `@skillit/mcp` (runtime)                      | MCP runtime config (`mcp.json` / `claude_desktop_config.json`) | Runtime overlay JSON from refine               |

## Use-case routing matrix

| Use case                               | Primary plugin/source                            | Additional source(s)                                     |
| -------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Monorepo / multi-use-case routing      | `typedoc` + `skillit.config.ts` plugin overrides | `core` docs/examples scanning                            |
| CLI tool                               | `cli` (`skillit gen --source cli`)               | `core` + typed options JSDoc                             |
| API/library                            | `typedoc` (`typedoc-plugin-skillit`)             | `core`, optionally `vitepress`/`docusaurus`              |
| MCP server (owned, build mode)         | `mcp` (`skillit gen/audit/refine --source mcp`)  | `target-mcp-protocol` / `target-mcpc` / `target-fastmcp` |
| MCP server (third-party, runtime mode) | `mcp` runtime (`--mcp <config>`)                 | Runtime overlay from `skillit refine`                    |

## Package readers

For package-level details and options, use the package READMEs directly:

- [`packages/core/README.md`](packages/core/README.md)
- [`packages/cli/README.md`](packages/cli/README.md)
- [`packages/typedoc/README.md`](packages/typedoc/README.md)
- [`packages/typedoc-plugin/README.md`](packages/typedoc-plugin/README.md)
- [`packages/vitepress/README.md`](packages/vitepress/README.md)
- [`packages/docusaurus/README.md`](packages/docusaurus/README.md)
- [`packages/mcp/README.md`](packages/mcp/README.md)
- [`packages/client/README.md`](packages/client/README.md)

## Examples

See the [`examples/`](examples/) directory for runnable scripts:

- **[basic-skill-generation.ts](examples/basic-skill-generation.ts)** — generate a SKILL.md from an ExtractedSkill object
- **[audit-and-fix.ts](examples/audit-and-fix.ts)** — run the documentation audit and print results
- **[cli-extraction.ts](examples/cli-extraction.ts)** — extract skills from a commander program
- **[docs-scanning.ts](examples/docs-scanning.ts)** — include prose docs alongside API skills

## Case Study: PixiJS (47K stars)

We forked [PixiJS](https://github.com/pixijs/pixijs) and bootstrapped skillit to measure the before/after impact on generated skill quality, scored against the [skill-judge](https://github.com/anthropics/skill-judge) rubric (120 points, 8 dimensions).

### Results

| Phase                       | Score   | Grade | What Changed                                                 | Agent Cost  |
| --------------------------- | ------- | ----- | ------------------------------------------------------------ | ----------- |
| **Install + generate**      | 84/120  | B-    | `npm install typedoc-plugin-skillit && pnpm typedoc`         | 0 tokens    |
| **After JSDoc conventions** | 113/120 | A     | `@useWhen`/`@pitfalls` on 7 key classes (110 lines of JSDoc) | ~80K tokens |

**B- → A with 110 lines of JSDoc annotations.** The generator handles structure, progressive disclosure, config detection, and reference splitting automatically. The annotations add the expert knowledge — when to use each class, what to never do, and why.

### What the agent wrote (110 lines, ~80K tokens)

```typescript
// src/scene/sprite/Sprite.ts — added to existing JSDoc
/**
 * @useWhen
 * - Displaying images, texture regions, or sprite sheets
 * - You need fast batched rendering of many images
 * @avoidWhen
 * - Drawing dynamic shapes — use Graphics instead
 * - Rendering text — use Text or BitmapText
 * @pitfalls
 * - NEVER create Sprites from unloaded textures — always Assets.load() first
 * - NEVER use Sprite.from() in hot loops — it creates new textures each call
 */
```

Similar annotations on Application, Container, Graphics, Text, Assets, and AbstractRenderer. The `@packageDocumentation` block added 6 NEVER rules covering v8 migration pitfalls.

### Generated output (224 reference files)

```
skills/pixi-js/
  SKILL.md (343 lines)
  references/
    classes/
      scene/                    # Per-class files + index.md
        container.md, sprite.md, graphics.md, ...
      rendering/                # 80+ renderer system classes
        abstractrenderer.md, webglrenderer.md, ...
      text/, assets/, events/, filters/, maths/, ...
    functions.md, types.md, config.md, variables.md
    architecture.md, scene-graph.md, render-loop.md
    performance-tips.md, garbage-collection.md
    v5-migration-guide.md ... v8-migration-guide.md
```

Fork: [pradeepmouli/pixijs](https://github.com/pradeepmouli/pixijs/tree/dev/skills/pixi-js)

## Ecosystem

- **[agentskills.io](https://agentskills.io)** — the SKILL.md specification
- **[skills.sh](https://skills.sh)** — skill registry and CLI (`npx skills add`)
- **[llmstxt.org](https://llmstxt.org)** — the llms.txt specification

## License

MIT
