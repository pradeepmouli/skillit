import { describe, it, expect } from 'vitest';
import { parseHelpOutput } from '../src/help-parser.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_HELP = `Usage: zod-to-form generate [options] <schema>

Generate form components from Zod v4 schemas

Options:
  --config <path>          Path to config file (required)
  -o, --out <dir>          Output directory
  --dry-run                Preview without writing (default: false)
  --server-action          Generate Next.js server action (default: false)
  -h, --help               display help for command
`;

const HELP_WITH_VERSION = `Usage: mytool [options]

Options:
  -V, --version  output the version number
  --verbose      Enable verbose output
  -h, --help     display help for command
`;

const HELP_MULTI_POSITIONAL = `Usage: mytool build [options] <input> [output]

Build the project

Options:
  --watch   Watch for file changes
`;

const HELP_VARIADIC = `Usage: mytool bundle <files...>

Bundle files

Options:
  --minify   Minify output
`;

const HELP_WITH_ARGUMENTS_SECTION = `Usage: deploy [options] <environment> [artifact]

Deploy the project

Arguments:
  environment  Target environment name
  artifact     Optional artifact identifier

Options:
  --dry-run    Preview without writing
`;

const HELP_SHORT_ONLY = `Usage: prog [options]

Options:
  -v, --verbose   Enable verbose output (default: false)
  -c, --config <path>   Config file path (required)
`;

const HELP_OPTIONAL_VALUE = `Usage: prog [options]

Options:
  --config [path]   Optional config path
`;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('parseHelpOutput', () => {
  // -------------------------------------------------------------------------
  // Basic surface properties
  // -------------------------------------------------------------------------

  it('uses commandName as surface name', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    expect(result.name).toBe('generate');
  });

  it('sets sourceType to "cli"', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    expect(result.sourceType).toBe('cli');
  });

  it('extracts the command description', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    expect(result.description).toBe('Generate form components from Zod v4 schemas');
  });

  it('extracts the usage string', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    expect(result.usage).toBe('zod-to-form generate [options] <schema>');
  });

  // -------------------------------------------------------------------------
  // Options extraction
  // -------------------------------------------------------------------------

  it('extracts all non-help options', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const names = result.options.map((o) => o.name);
    expect(names).toContain('config');
    expect(names).toContain('out');
    expect(names).toContain('dry-run');
    expect(names).toContain('server-action');
  });

  it('skips -h/--help option', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const names = result.options.map((o) => o.name);
    expect(names).not.toContain('help');
  });

  it('skips --version / -V option', () => {
    const result = parseHelpOutput(HELP_WITH_VERSION, 'mytool');
    const names = result.options.map((o) => o.name);
    expect(names).not.toContain('version');
    expect(names).toContain('verbose');
  });

  it('extracts option descriptions', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const config = result.options.find((o) => o.name === 'config');
    expect(config?.description).toBe('Path to config file');
  });

  // -------------------------------------------------------------------------
  // Short flags
  // -------------------------------------------------------------------------

  it('detects short flag when present', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const out = result.options.find((o) => o.name === 'out');
    expect(out?.cliShort).toBe('-o');
  });

  it('does not set cliShort when not present', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const config = result.options.find((o) => o.name === 'config');
    expect(config?.cliShort).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Default values
  // -------------------------------------------------------------------------

  it('extracts default value from (default: ...) annotation', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const dryRun = result.options.find((o) => o.name === 'dry-run');
    expect(dryRun?.defaultValue).toBe('false');
  });

  it('does not include default annotation text in description', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const dryRun = result.options.find((o) => o.name === 'dry-run');
    expect(dryRun?.description).not.toContain('default:');
  });

  it('leaves defaultValue undefined when annotation is absent', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const out = result.options.find((o) => o.name === 'out');
    expect(out?.defaultValue).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Required flag
  // -------------------------------------------------------------------------

  it('marks option as required when (required) annotation present', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const config = result.options.find((o) => o.name === 'config');
    expect(config?.required).toBe(true);
  });

  it('marks option as not required when annotation absent', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const out = result.options.find((o) => o.name === 'out');
    expect(out?.required).toBe(false);
  });

  it('does not include (required) text in description', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const config = result.options.find((o) => o.name === 'config');
    expect(config?.description).not.toContain('(required)');
  });

  // -------------------------------------------------------------------------
  // Type inference
  // -------------------------------------------------------------------------

  it('infers boolean type for flags without <arg>', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const dryRun = result.options.find((o) => o.name === 'dry-run');
    expect(dryRun?.type).toBe('boolean');
  });

  it('infers string type for flags with <arg>', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const config = result.options.find((o) => o.name === 'config');
    expect(config?.type).toBe('string');
  });

  it('infers string type for flags with [arg] fallback syntax', () => {
    const result = parseHelpOutput(HELP_OPTIONAL_VALUE, 'prog');
    const config = result.options.find((o) => o.name === 'config');
    expect(config?.type).toBe('string');
  });

  // -------------------------------------------------------------------------
  // Positional arguments
  // -------------------------------------------------------------------------

  it('extracts required positional arg from <name> in usage', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const schema = result.arguments?.find((a) => a.name === 'schema');
    expect(schema).toBeDefined();
    expect(schema?.required).toBe(true);
    expect(schema?.variadic).toBe(false);
  });

  it('extracts optional positional arg from [name] in usage', () => {
    const result = parseHelpOutput(HELP_MULTI_POSITIONAL, 'build');
    const output = result.arguments?.find((a) => a.name === 'output');
    expect(output).toBeDefined();
    expect(output?.required).toBe(false);
  });

  it('extracts multiple positional args in order', () => {
    const result = parseHelpOutput(HELP_MULTI_POSITIONAL, 'build');
    const names = result.arguments?.map((a) => a.name);
    expect(names).toEqual(['input', 'output']);
  });

  it('skips [options] meta-token in usage', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    const opts = result.arguments?.find((a) => a.name === 'options');
    expect(opts).toBeUndefined();
  });

  it('detects variadic positional arg', () => {
    const result = parseHelpOutput(HELP_VARIADIC, 'bundle');
    const files = result.arguments?.find((a) => a.name === 'files');
    expect(files).toBeDefined();
    expect(files?.variadic).toBe(true);
  });

  it('fills positional argument descriptions from an Arguments: section', () => {
    const result = parseHelpOutput(HELP_WITH_ARGUMENTS_SECTION, 'deploy');
    expect(result.arguments?.find((arg) => arg.name === 'environment')?.description).toBe(
      'Target environment name'
    );
    expect(result.arguments?.find((arg) => arg.name === 'artifact')?.description).toBe(
      'Optional artifact identifier'
    );
  });

  // -------------------------------------------------------------------------
  // CLI flag format
  // -------------------------------------------------------------------------

  it('sets cliFlag with leading -- on each option', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    for (const opt of result.options) {
      expect(opt.cliFlag).toMatch(/^--/);
    }
  });

  it('correctly parses option with both short and long flags', () => {
    const result = parseHelpOutput(HELP_SHORT_ONLY, 'prog');
    const configOpt = result.options.find((o) => o.name === 'config');
    expect(configOpt?.cliFlag).toBe('--config');
    expect(configOpt?.cliShort).toBe('-c');
    expect(configOpt?.type).toBe('string');
    expect(configOpt?.required).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('returns empty surface for empty help output', () => {
    const result = parseHelpOutput('', 'empty');
    expect(result.name).toBe('empty');
    expect(result.description).toBe('');
    expect(result.options).toHaveLength(0);
    expect(result.arguments).toHaveLength(0);
  });

  it('returns empty surface for whitespace-only help output', () => {
    const result = parseHelpOutput('   \n  \n', 'empty');
    expect(result.options).toHaveLength(0);
    expect(result.arguments).toHaveLength(0);
  });

  it('handles help with no description (usage then options directly)', () => {
    const text = `Usage: prog [options]

Options:
  --verbose  Enable verbose
`;
    const result = parseHelpOutput(text, 'prog');
    expect(result.description).toBe('');
    expect(result.options).toHaveLength(1);
  });

  it('handles option with no description separator gracefully', () => {
    const text = `Usage: prog [options]

Options:
  --flag
`;
    const result = parseHelpOutput(text, 'prog');
    const flag = result.options.find((o) => o.name === 'flag');
    expect(flag).toBeDefined();
    expect(flag?.description).toBe('');
  });

  it('count of parsed options matches expected (excluding help)', () => {
    const result = parseHelpOutput(SAMPLE_HELP, 'generate');
    // config, out, dry-run, server-action (help is excluded)
    expect(result.options).toHaveLength(4);
  });
});
