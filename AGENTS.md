# Agent Instructions

This document provides guidelines and instructions for AI coding agents working with this TypeScript project. These instructions are designed to work with multiple agents including GitHub Copilot, Claude Code, Gemini Code Assist, and Codex.

## Project Overview

to-skills is a TypeDoc plugin ecosystem that generates structured AI agent skills (SKILL.md files following the agentskills.io spec) and llms.txt documentation from TypeScript API docs. It's a pnpm monorepo with three packages:

- **`@skillit/core`** — Shared types (`ExtractedSkill` hierarchy), SKILL.md renderer (progressive disclosure), llms.txt renderer, token budgeting
- **`@skillit/typedoc`** — TypeDoc plugin that extracts from the reflection tree and hooks into the TypeDoc lifecycle
- **`typedoc-plugin-to-skills`** — Auto-discovery wrapper (just `pnpm add -D` and TypeDoc finds it)

The extraction pipeline: TypeDoc parses TS source → `extractor.ts` walks the reflection tree → `ExtractedSkill` intermediate representation → `renderer.ts` produces SKILL.md + references/ files → `writer.ts` writes to disk.

## Workflow & Tooling Preferences

### Version Control

- Use git for version control
- Follow gitflow branching strategy
- Use semantic versioning for version management
- Use conventional commits for commit messages (format: `type(scope): description`)
- Add a pre-commit hook for running formatters

### Project Management

- Use GitHub Issues for tracking bugs and features
- Use Pull Request templates for consistent PR descriptions
- Set up GitHub Actions for CI/CD pipelines

### CI/CD Guidelines

- Include formatting, linting, testing and build steps in the CI pipeline
- Automate deployment to npm registry on release tags
- Tag releases automatically based on package.json versions
- For multi-package repos, use format `<package-name>-v<version>` for tags
- Mark releases with pre-release identifiers as pre-releases in GitHub

## Coding Style Guidelines

### Naming Conventions

- Use **camelCase** for JavaScript/TypeScript variable and function names
- Use **PascalCase** for:
  - React component names
  - Classes, types, enums, and interfaces
  - File and folder names (except scripts)
- Use **kebab-case** for script files that are not modules (e.g., build scripts, code generation scripts)
- Use **#** syntax (ES2022) for private class fields and methods

### Code Formatting

- Use 2 tab spaces for indentation
- Use semicolons at the end of statements
- Use single quotes for strings
- Do not use trailing commas in object and array literals

### Configuration Files

Ensure configuration files (oxfmt, prettier, eslint) align with these style guidelines. If conflicts arise, ask for confirmation before updating.

## Coding Standards

### TypeScript Best Practices

- Use decorators for logging, caching, validation (wire to preferred utilities: pino, zod)
- Use mixins where appropriate to share functionality between classes
- Use generics liberally for reusable components and functions
- Use type aliases for union and intersection types
- Use explicit return types for functions
- Avoid using `any` type
- Use enums for defining a set of named constants
- Use interfaces for defining object shapes

### Modern JavaScript/TypeScript Patterns

- Use async/await syntax for asynchronous operations (prefer over Promises)
- Promisify all functions that perform asynchronous operations where possible
- Use strict equality (`===` and `!==`) instead of loose equality
- Use arrow functions for callbacks and functional components
- Use template literals for string concatenation
- Use try/catch blocks for error handling in async functions
- Use destructuring assignment for objects and arrays
- Use spread/rest operators for copying and merging objects/arrays

### Documentation

- Use JSDoc comments for documenting functions and classes public APIs
- **Only document public APIs** - do not document private methods/internal implementation
- If unclear whether something is public API, ask the user

### Testing

- Write unit tests for all public APIs using vitest
- Aim for high code coverage
- Write integration tests for critical workflows and components
- Only write unit tests for public APIs

### Architecture

- Use dependency injection for managing dependencies
- Use decorators to define injectable classes and services
- Follow ESLint recommended rules for JavaScript/TypeScript code

## Preferred Technologies

**Always use the latest stable versions** of all libraries and frameworks unless otherwise specified. Prefer versions tagged as "latest" in the npm registry.

### Technology Stack

| Use Case                           | Technology                                                  |
| ---------------------------------- | ----------------------------------------------------------- |
| Language                           | TypeScript                                                  |
| Package Management                 | pnpm                                                        |
| Web Development                    | React with TypeScript                                       |
| Mobile App Development             | React Native with Expo (New Architecture, managed workflow) |
| HTTP/REST APIs                     | Axios                                                       |
| WebSocket Implementations          | ws                                                          |
| Backend Development                | Express.js                                                  |
| Database (Lightweight)             | SQLite                                                      |
| Database (ORM)                     | Prisma                                                      |
| Containerization                   | Docker                                                      |
| CI/CD Pipelines                    | GitHub Actions                                              |
| Testing (JavaScript/TypeScript)    | vitest                                                      |
| Linting (JavaScript/TypeScript)    | oxlint                                                      |
| Formatting (JavaScript/TypeScript) | oxfmt                                                       |
| String Manipulation                | Native methods or sindresorhus utilities                    |
| Environment Variables              | dotenvx and dotenvx/expand                                  |
| Schema/Runtime Type Validation     | Zod                                                         |
| Script Automation & Task Running   | tsx                                                         |
| Logging                            | pino                                                        |
| Advanced Type Manipulation         | type-fest                                                   |
| Utility Functions                  | sindresorhus collection of packages                         |
| Documentation Generation           | TypeDoc                                                     |
| API Documentation                  | OpenAPI/Swagger                                             |
| Monorepo Management                | pnpm workspaces with Lerna                                  |
| Error Handling                     | Custom error classes with structured logging                |
| Code Generation                    | ts-morph                                                    |
| Time/Date Handling                 | date-fns or Day.js                                          |

## Configuration Preferences

- Prefer environment variables for sensitive configuration data
- Use `.env` files for local development (with dotenvx)
- Never commit sensitive data to version control

## Output Guidelines

### Code Generation

- Include comments explaining complex logic
- Follow the coding style guidelines above
- Ensure type safety with TypeScript

### Commit Messages

- Follow Conventional Commits specification
- Format: `type(scope): description`
- Types: feat, fix, docs, style, refactor, test, chore
- Example: `feat(auth): add JWT authentication`

## Knowledge Base & Context

### Up-to-Date Information

- Use Context7 via the MCP server to get up-to-date information on libraries and frameworks
- Refer to official documentation for best practices and advanced usage
- Use GitHub repos and websites to find additional context when prompted

### MCP Configuration

This project is configured with Model Context Protocol (MCP) servers for enhanced agent capabilities:

- **Context7**: Provides up-to-date library documentation and examples
- **MarkItDown**: Converts documents to Markdown for easy ingestion
- **Codemod**: Supports AST-driven refactors via codemod@latest mcp adapter

### Codemod Usage Guidelines

- Use codemod for repetitive, mechanical refactors (API renames, import moves, prop renames, consistent options).
- Prefer reading definitions/usages first; avoid codemod on ambiguous or dynamically typed areas.
- Start with a narrow scope pattern; run on smallest affected path first, review diff, then widen.
- Keep changes incremental: one behavioral change per codemod; add or update tests alongside.
- If codemod output is uncertain, fall back to manual edits or tighten the pattern.

## Agent-Specific Notes

### For All Agents

- Ask for clarification when requirements are ambiguous
- Propose solutions that align with the preferred technologies above
- Consider maintainability and scalability in all suggestions
- Follow the principle of least surprise in API design

### When Generating New Code

1. Check existing code patterns in the project first
2. Follow the naming conventions and style guidelines
3. Add appropriate type annotations
4. Include JSDoc comments for public APIs
5. Consider writing tests alongside the implementation

### When Modifying Existing Code

1. Understand the context and purpose of existing code
2. Maintain consistency with existing patterns
3. Update tests if behavior changes
4. Update documentation if public APIs change
5. Consider backward compatibility

## Quick Reference

### File Naming

- Components: `PascalCase.tsx` (e.g., `UserProfile.tsx`)
- Utilities: `PascalCase.ts` (e.g., `StringUtils.ts`)
- Scripts: `snake_case.ts` (e.g., `generate_types.ts`)
- Tests: `*.test.ts` or `*.spec.ts`

### Import Organization

1. External dependencies (from node_modules)
2. Internal modules (absolute imports)
3. Relative imports
4. Type imports (if not inline)

### Error Handling Pattern

```typescript
try {
  // Operation
} catch (error) {
  // Log error with context
  logger.error('Operation failed', { error, context });
  // Re-throw or handle appropriately
  throw new CustomError('Friendly message', { cause: error });
}
```

### Async Function Pattern

```typescript
async function fetchData(): Promise<DataType> {
  try {
    const response = await axios.get('/api/data');
    return response.data;
  } catch (error) {
    logger.error('Failed to fetch data', { error });
    throw new FetchError('Unable to fetch data', { cause: error });
  }
}
```

---

_Last Updated: December 21, 2025_
