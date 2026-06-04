# Contributing to skillit

Thank you for your interest in contributing to skillit! This document covers how to get set up and submit changes. For coding standards and conventions, see [AGENTS.md](./AGENTS.md).

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10.6+ (install via `npm install -g pnpm`)
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/skillit.git
cd skillit
```

3. Add the upstream repository:

```bash
git remote add upstream https://github.com/pradeepmouli/skillit.git
```

## Development Setup

1. Install dependencies:

```bash
pnpm install
```

2. Build all packages:

```bash
pnpm build
```

3. Run tests to verify setup:

```bash
pnpm test
```

### Development Workflow

```bash
# Build (uses tsgo)
pnpm build

# Run tests (vitest)
pnpm test

# Run tests in watch mode
pnpm test --watch

# Type check without building
pnpm type-check

# Lint (oxlint)
pnpm lint

# Format (oxfmt)
pnpm format

# Run all checks before committing
pnpm type-check && pnpm lint && pnpm test
```

## Project Structure

skillit is a pnpm monorepo with three packages:

```
skillit/
├── packages/
│   ├── core/               # Shared types, renderers, token budgeting, writer
│   │   └── src/
│   │       ├── types/      # ExtractedSkill hierarchy and shared interfaces
│   │       ├── renderers/  # SKILL.md and llms.txt renderers
│   │       └── writer.ts   # File output writer
│   ├── typedoc/            # TypeDoc plugin (hooks and reflection tree walking)
│   │   └── src/
│   │       ├── plugin.ts   # TypeDoc lifecycle hooks
│   │       └── extractor.ts # Reflection tree walker
│   └── typedoc-plugin/     # Auto-discovery wrapper (npm: typedoc-plugin-skillit)
├── AGENTS.md               # Coding standards and conventions
└── CONTRIBUTING.md         # This file
```

### Package Roles

- **packages/core** — Framework-agnostic types (`ExtractedSkill` hierarchy), renderers (SKILL.md, llms.txt), token budgeting utilities, and the file writer
- **packages/typedoc** — TypeDoc plugin that hooks into the TypeDoc lifecycle (`plugin.ts`) and walks the reflection tree to extract skill metadata (`extractor.ts`)
- **packages/typedoc-plugin** — Thin auto-discovery wrapper published to npm as `typedoc-plugin-skillit`

## Testing

All code changes must include tests. Tests are written with **Vitest**.

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test:coverage
```

Test requirements:

- New features must have tests
- Bug fixes must include regression tests
- Tests must pass before a PR is merged

## Submitting Changes

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `style`

**Scopes:** `core`, `typedoc`, `typedoc-plugin`, or omit for repo-wide changes

**Examples:**

```
feat(core): add token budget enforcement to SKILL.md renderer
fix(typedoc): handle missing @skill tag gracefully
docs: rewrite CONTRIBUTING.md for skillit
test(core): add llms.txt renderer edge case coverage
```

### Pull Request Process

1. Create a branch:

```bash
git checkout -b feat/your-feature-name
```

2. Make your changes following the standards in [AGENTS.md](./AGENTS.md)

3. Run quality checks:

```bash
pnpm type-check && pnpm lint && pnpm format && pnpm test
```

4. Commit your changes:

```bash
git add <files>
git commit -m "feat(scope): description"
```

5. Push to your fork:

```bash
git push origin feat/your-feature-name
```

6. Open a Pull Request against `master` on [github.com/pradeepmouli/skillit](https://github.com/pradeepmouli/skillit)

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Include tests and update documentation as needed
- Ensure all CI checks pass
- Respond to review feedback promptly

## Release Process

Releases are managed using [Changesets](https://github.com/changesets/changesets):

1. After making changes, run:

```bash
pnpm changeset
```

2. Select the affected packages and version bump type (major/minor/patch)
3. Write a description of the changes
4. Commit the generated changeset file

Maintainers will publish releases when ready.

## Getting Help

- **Questions**: Open a [Discussion](https://github.com/pradeepmouli/skillit/discussions)
- **Bug Reports**: Open an [Issue](https://github.com/pradeepmouli/skillit/issues)
- **Feature Requests**: Open an [Issue](https://github.com/pradeepmouli/skillit/issues) with the `enhancement` label

## License

By contributing to skillit, you agree that your contributions will be licensed under the MIT License.
