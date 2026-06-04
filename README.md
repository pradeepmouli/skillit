# to-skills

> **to-skills** — Compile-time generator of AI agent skills from your codebase.

Inline docs, CLI definitions, config schemas, and examples compile into progressively disclosed [SKILL.md](https://agentskills.io) files that any LLM can discover. Integrated with TypeDoc, with support for conventional repo docs, and plugins for Docusaurus and VitePress provided for what code can't cover.

## MCP Servers (orthogonal workflow)

`to-skills` can also generate skills from **any live MCP server**, even when the
server was not authored with `to-skills`.

This is separate from the TypeDoc/docs extraction flow above: it introspects MCP
tools/resources/prompts over stdio or HTTP and emits a progressive-disclosure
`SKILL.md`. You can render:

- native MCP launch instructions (`mcp:` frontmatter in `SKILL.md`, which tells
  MCP-capable agents how to start/connect to the server), or
- CLI-proxy launch instructions for non-MCP harnesses (such as mcpc/fastmcp).

```bash
# Inspect any running or launchable MCP server and generate skills
npx to-skills-mcp extract \
  --command "npx -y @modelcontextprotocol/server-filesystem /tmp" \
  --out ./skills

# Optional: install non-default CLI invocation adapters
npm install --save-dev @skillit/target-mcpc @skillit/target-fastmcp

# Emit CLI-proxy invocation variants for non-MCP agents
npx to-skills-mcp extract \
  --command "npx -y @modelcontextprotocol/server-filesystem /tmp" \
  --invocation cli:mcpc \
  --invocation cli:fastmcp \
  --out ./skills
```

For server package authors, `to-skills-mcp bundle` can be run in your build to
ship pre-generated skills with your MCP package.

See [`packages/mcp/README.md`](packages/mcp/README.md) for install, extract,
bundle, config-file batch mode (`mcp.json` / `claude_desktop_config.json`), and
programmatic API details.

### Init: detect → install → generate → refine

`to-skills init` bootstraps a project in one step. It detects the project's
nature, installs the matching `@skillit/*` package with your package manager,
generates an initial skill into `skills/`, then runs `refine` on it.

```bash
# Auto-detects nature and package manager
npx to-skills init

# Force the source kind, or point at a specific program entry
npx to-skills init --source cli --program ./dist/cli.js#program

# Generate into a custom directory (default: skills)
npx to-skills init --out docs/skills
```

Detection:

- **Nature** — `commander` / `yargs` dep → `cli`; `@modelcontextprotocol/sdk` →
  `mcp`; otherwise a plain TS library → `typedoc`. Override with `--source`.
- **Package** — `cli` → `@skillit/cli`, `mcp` → `@skillit/mcp`, `typedoc` →
  `typedoc-plugin-to-skills`.
- **Package manager** — `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm.

The initial generate step is implemented for the **cli** source this pass; for
`mcp` / `typedoc` it is skipped (refine extracts live for mcp). If the install
step fails, `init` prints the exact add command and stops before generate/refine.

| Flag                           | Default  | Description                              |
| ------------------------------ | -------- | ---------------------------------------- |
| `--source <cli\|mcp\|typedoc>` | auto     | Override project-nature detection        |
| `--program <file#export>`      | —        | Commander program entry (cli source)     |
| `--out <dir>`                  | `skills` | Output directory for the generated skill |

### Refine: autonomous annotation loop

`to-skills refine` runs an audit → draft → review loop that iteratively improves
the `useWhen` / `avoidWhen` annotations in your generated skills. On each pass it
asks an LLM to evaluate the current guidance, proposes improvements, and applies
them — no manual editing required.

Refine is **source-aware**. It auto-detects the source from the installed
`@skillit/*` package, or you can choose explicitly:

```bash
# CLI source — writes guidance back into the *Options interface JSDoc
npx to-skills refine --source cli --program ./dist/cli.js#program

# MCP source (see modes below)
npx to-skills refine --source mcp --mcp ./mcp.json
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
npx to-skills-mcp refine

# Explicit
npx to-skills-mcp refine --mode build
```

**Runtime mode** — for any MCP server, including ones you don't own. `refine`
writes an overlay JSON file that `extract` / `bundle` merges at render time:

```bash
# Auto-detected when --mcp points to mcp.json / claude_desktop_config.json
npx to-skills-mcp refine --mcp ~/.config/claude/mcp.json

# Refine only a subset of tools
npx to-skills-mcp refine --mode runtime --mcp ./mcp.json --items filesystem,github
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

## Quick Start by Project Type

### TypeScript Library (most common)

```bash
pnpm add -D typedoc-plugin-to-skills
pnpm typedoc
```

That's it. TypeDoc auto-discovers the plugin. Skills appear at `skills/<package-name>/SKILL.md`.

### Monorepo

```json
// typedoc.json
{
  "entryPointStrategy": "packages",
  "entryPoints": ["packages/*"],
  "plugin": ["typedoc-plugin-to-skills"],
  "skillsPerPackage": true
}
```

One skill per package — each with its own SKILL.md, references, and config surfaces.

### CLI Tool (commander/yargs)

```typescript
import { extractCliSkill, writeCliSkill } from '@skillit/cli';

const skill = await extractCliSkill({
  program, // commander Program object
  metadata: { name: 'my-tool', keywords: ['build', 'deploy'] }
});

writeCliSkill(skill, {
  outDir: 'skills',
  installTargets: ['.claude/skills']
});
```

Introspects command definitions, correlates flags with typed `*Options` interfaces for JSDoc enrichment, surfaces CLI audit findings on `skill.audit`, and can install the generated skill plus bundled CLI guidance into agent discovery roots.

### Library with Docs Site (VitePress)

```typescript
// .vitepress/config.mts
import { defineConfig } from 'vitepress';
import { toSkills } from '@skillit/vitepress';

export default defineConfig({
  vite: {
    plugins: [toSkills({ skillsOutDir: 'skills' })]
  },
  themeConfig: { sidebar: [...] }
});
```

The VitePress plugin uses your sidebar for authoritative page ordering — no frontmatter heuristics.

### Library with Docs Site (Docusaurus)

```typescript
import { extractDocusaurusDocs } from '@skillit/docusaurus';

const docs = extractDocusaurusDocs({ projectRoot: '.' });
// Returns ExtractedDocument[] — merge into your skill
```

Reads `_category_.json` for folder labels and ordering. Excludes `api/` and `blog/` by default.

### Library with Prose Docs (any framework)

```json
// typedoc.json — opt-in alongside API extraction
{
  "plugin": ["typedoc-plugin-to-skills"],
  "skillsIncludeDocs": true,
  "skillsDocsDir": "docs"
}
```

Scans `docs/` directory for markdown files. Also picks up root-level docs (ARCHITECTURE.md, MIGRATION.md, TROUBLESHOOTING.md).

## What Gets Extracted

### Sources

| Source                         | Extractor                                      | What It Produces                                                        |
| ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| TypeScript source + JSDoc      | `typedoc-plugin-to-skills`                     | API reference — functions, classes, types, enums, variables             |
| `@useWhen` / `@avoidWhen` tags | TypeDoc plugin                                 | Decision procedures in SKILL.md "When to Use"                           |
| `@pitfalls` tag                | TypeDoc plugin                                 | Anti-patterns in SKILL.md "Pitfalls"                                    |
| `@remarks` tag                 | TypeDoc plugin                                 | Expert knowledge in references                                          |
| `@category` tag                | TypeDoc plugin                                 | Export grouping in Quick Reference + references                         |
| `@config` interfaces           | TypeDoc plugin                                 | Configuration tables in SKILL.md + references/config.md                 |
| Commander/yargs programs       | `@skillit/cli`                                 | CLI commands + flags in references/commands.md                          |
| `examples/` directory          | `@skillit/core`                                | Linked to matching exports by import analysis                           |
| `docs/` directory              | `@skillit/core` or VitePress/Docusaurus plugin | Prose docs as reference files                                           |
| Root `.md` files               | `@skillit/core`                                | ARCHITECTURE.md, MIGRATION.md, etc. as references                       |
| README.md                      | `@skillit/core`                                | Blockquote description, ## Features, ## Quick Start, ## Troubleshooting |
| package.json                   | TypeDoc plugin                                 | Name, description, keywords, repository, license                        |

### Audit Checks

The documentation audit runs automatically during `pnpm typedoc` and reports issues at four severity levels:

| Severity    | What It Checks                                                                                                                          | CI Behavior           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **fatal**   | package.json description, 5+ keywords, README description, JSDoc on every export                                                        | Exit 1 (configurable) |
| **error**   | @param prose, @returns on non-void, interface property JSDoc, at least one @example, repository URL                                     | Exit 1 (configurable) |
| **warning** | @useWhen, @avoidWhen, @pitfalls presence, @remarks on complex functions, @category usage, README ## Features, README ## Troubleshooting | Exit 0 (logged)       |
| **alert**   | Generic keywords, @param restates type, trivial @example, verbose Quick Start                                                           | Exit 0 (logged)       |

Enable CI enforcement: `"skillsAuditFailOnError": true`

### Generated Output

```
skills/<package-name>/
  SKILL.md                     # Discovery file (~200 tokens)
  references/
    functions.md               # Grouped by @category or source module
    types.md                   # Interfaces with properties, type aliases
    classes.md                 # With inheritance, methods, properties
    config.md                  # @config interfaces as option tables
    commands.md                # CLI commands with flags (from @skillit/cli)
    variables.md               # Exported constants
    examples.md                # From @example tags
    architecture.md            # From root ARCHITECTURE.md
    getting-started.md         # From docs/ pages
    ...                        # One file per doc page
```

Each reference file is token-budgeted independently (default 4000 tokens).

## Packages

| Package                                                        | Description                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`typedoc-plugin-to-skills`](packages/typedoc-plugin)          | Auto-discovery wrapper — just install, no config                       |
| [`@skillit/core`](packages/core)                               | Types, renderer, audit engine, token budgeting, docs/examples scanning |
| [`@skillit/typedoc`](packages/typedoc)                         | TypeDoc plugin — API + config extraction from the reflection tree      |
| [`@skillit/cli`](packages/cli)                                 | Commander/yargs introspection + `--help` fallback + flag correlation   |
| [`@skillit/vitepress`](packages/vitepress)                     | VitePress Vite plugin — sidebar-driven docs extraction                 |
| [`@skillit/docusaurus`](packages/docusaurus)                   | Docusaurus adapter — `_category_.json` + docs scanning                 |
| [`@skillit/mcp`](packages/mcp)                                 | MCP extractor/bundler — introspect live servers and emit SKILL.md      |
| [`@skillit/target-mcp-protocol`](packages/target-mcp-protocol) | MCP-native invocation target adapter for rendered skills               |
| [`@skillit/target-mcpc`](packages/target-mcpc)                 | CLI-proxy invocation adapter via `mcpc`                                |
| [`@skillit/target-fastmcp`](packages/target-fastmcp)           | CLI-proxy invocation adapter via Python `fastmcp` CLI                  |

## Configuration

```json
{
  "plugin": ["typedoc-plugin-to-skills"],
  "skillsOutDir": "skills",
  "skillsPerPackage": true,
  "skillsAudit": true,
  "blockTags": ["@useWhen", "@avoidWhen", "@pitfalls", "@config"]
}
```

| Option                   | Default    | Description                                     |
| ------------------------ | ---------- | ----------------------------------------------- |
| `skillsOutDir`           | `"skills"` | Output directory for SKILL.md files             |
| `skillsInstallTargets`   | `[]`       | Additional agent discovery directories to sync  |
| `skillsPerPackage`       | `true`     | One skill per package in monorepos              |
| `skillsMaxTokens`        | `4000`     | Max token budget per reference file             |
| `skillsAudit`            | `true`     | Run documentation audit during generation       |
| `skillsAuditFailOnError` | `false`    | Fail build on fatal/error audit issues (for CI) |
| `skillsIncludeDocs`      | `false`    | Include prose docs from `docs/` directory       |
| `llmsTxt`                | `false`    | Generate llms.txt and llms-full.txt             |

See the [full options reference](packages/typedoc/src/plugin.ts) for all 14 options.

## Examples

See the [`examples/`](examples/) directory for runnable scripts:

- **[basic-skill-generation.ts](examples/basic-skill-generation.ts)** — generate a SKILL.md from an ExtractedSkill object
- **[audit-and-fix.ts](examples/audit-and-fix.ts)** — run the documentation audit and print results
- **[cli-extraction.ts](examples/cli-extraction.ts)** — extract skills from a commander program
- **[docs-scanning.ts](examples/docs-scanning.ts)** — include prose docs alongside API skills

## Case Study: PixiJS (47K stars)

We forked [PixiJS](https://github.com/pixijs/pixijs) and bootstrapped to-skills to measure the before/after impact on generated skill quality, scored against the [skill-judge](https://github.com/anthropics/skill-judge) rubric (120 points, 8 dimensions).

### Results

| Phase                       | Score   | Grade | What Changed                                                 | Agent Cost  |
| --------------------------- | ------- | ----- | ------------------------------------------------------------ | ----------- |
| **Install + generate**      | 84/120  | B-    | `npm install typedoc-plugin-to-skills && pnpm typedoc`       | 0 tokens    |
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
