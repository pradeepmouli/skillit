/**
 * CLI extraction for commander/yargs programs.
 *
 * Provides a three-phase pipeline for extracting structured skill data from CLI tools:
 * 1. **Introspect** — walk a Commander program tree to extract commands, options, and arguments
 * 2. **Parse** — fallback: parse `--help` text output when runtime introspection is unavailable
 * 3. **Correlate** — merge JSDoc metadata from typed config interfaces into CLI option metadata
 *
 * The result is an `ExtractedSkill` that can be rendered by `@to-skills/core`.
 *
 * @remarks
 * Commander introspection is preferred over help-text parsing because it captures
 * default values, variadic arguments, and required/optional distinctions precisely.
 * Help-text parsing is a best-effort fallback with known limitations around multi-line
 * descriptions and non-standard help formatting.
 *
 * @packageDocumentation
 */

export { introspectCommander } from './introspect-commander.js';
export { parseHelpOutput } from './help-parser.js';
export { correlateFlags } from './correlator.js';
export { runCliAudit } from './audit.js';
export { extractCliSkill, writeCliSkill } from './extract.js';
export type { CliExtractionOptions, CliWriteOptions } from './extract.js';
export type { CliAuditIssue } from './audit.js';
export { loadProgram } from './program-loader.js';
export type { LoadProgramOptions } from './program-loader.js';
export { readOptionsTags } from './options-jsdoc.js';
export { CliRefineSource } from './refine-source.js';
export type { CliRefineSourceOptions } from './refine-source.js';
