import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { introspectCommander } from '../src/introspect-commander.js';

describe('introspectCommander', () => {
  it('returns empty array for a program with no subcommands', () => {
    const program = new Command('mytool');
    expect(introspectCommander(program)).toEqual([]);
  });

  it('extracts command name and description', () => {
    const program = new Command('mytool');
    program.command('build').description('Compile the project');

    const surfaces = introspectCommander(program);

    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].name).toBe('build');
    expect(surfaces[0].description).toBe('Compile the project');
    expect(surfaces[0].sourceType).toBe('cli');
  });

  it('extracts boolean flags (no arg) typed as boolean', () => {
    const program = new Command('mytool');
    program
      .command('serve')
      .description('Start server')
      .option('--watch', 'Enable watch mode')
      .option('--verbose', 'Verbose output');

    const surfaces = introspectCommander(program);
    const opts = surfaces[0].options;

    expect(opts).toHaveLength(2);
    expect(opts[0].name).toBe('watch');
    expect(opts[0].type).toBe('boolean');
    expect(opts[0].cliFlag).toBe('--watch');
    expect(opts[1].name).toBe('verbose');
    expect(opts[1].type).toBe('boolean');
  });

  it('extracts string options with <arg> typed as string', () => {
    const program = new Command('mytool');
    program.command('build').description('Build').option('--output-dir <dir>', 'Output directory');

    const surfaces = introspectCommander(program);
    const opt = surfaces[0].options[0];

    expect(opt.name).toBe('outputDir');
    expect(opt.type).toBe('string');
    expect(opt.cliFlag).toBe('--output-dir');
    expect(opt.description).toBe('Output directory');
  });

  it('extracts string options with [optional-arg] typed as string', () => {
    const program = new Command('mytool');
    program
      .command('init')
      .description('Init project')
      .option('--template [name]', 'Template to use');

    const surfaces = introspectCommander(program);
    const opt = surfaces[0].options[0];

    expect(opt.name).toBe('template');
    expect(opt.type).toBe('string');
  });

  it('detects short flags (-o)', () => {
    const program = new Command('mytool');
    program.command('build').description('Build').option('-o, --output <dir>', 'Output directory');

    const surfaces = introspectCommander(program);
    const opt = surfaces[0].options[0];

    expect(opt.cliShort).toBe('-o');
    expect(opt.cliFlag).toBe('--output');
    expect(opt.name).toBe('output');
  });

  it('extracts required options', () => {
    const program = new Command('mytool');
    program
      .command('deploy')
      .description('Deploy')
      .requiredOption('--env <environment>', 'Target environment');

    const surfaces = introspectCommander(program);
    const opt = surfaces[0].options[0];

    expect(opt.required).toBe(true);
    expect(opt.name).toBe('env');
  });

  it('extracts optional options as not required', () => {
    const program = new Command('mytool');
    program.command('build').description('Build').option('--minify', 'Minify output');

    const surfaces = introspectCommander(program);
    expect(surfaces[0].options[0].required).toBe(false);
  });

  it('does not mark an optional value-taking option as required', () => {
    // Regression: commander sets opt.required=true for any `<value>` flag, even
    // when the flag itself is optional. Only `.requiredOption()` (opt.mandatory)
    // should map to required.
    const program = new Command('mytool');
    program.command('serve').description('Serve').option('--host <name>', 'Bind host');

    const surfaces = introspectCommander(program);
    const opt = surfaces[0].options[0];
    expect(opt.name).toBe('host');
    expect(opt.required).toBe(false);
  });

  it('extracts default values stringified', () => {
    const program = new Command('mytool');
    program
      .command('serve')
      .description('Serve')
      .option('--port <number>', 'Port to listen on', '3000')
      .option('--workers <n>', 'Number of workers', '4');

    const surfaces = introspectCommander(program);
    const opts = surfaces[0].options;

    expect(opts[0].defaultValue).toBe('3000');
    expect(opts[1].defaultValue).toBe('4');
  });

  it('does not set defaultValue when option has no default', () => {
    const program = new Command('mytool');
    program.command('build').description('Build').option('--watch', 'Watch mode');

    const surfaces = introspectCommander(program);
    expect(surfaces[0].options[0].defaultValue).toBeUndefined();
  });

  it('extracts required positional arguments', () => {
    const program = new Command('mytool');
    program.command('compile <input>').description('Compile a file');

    const surfaces = introspectCommander(program);

    expect(surfaces[0].arguments).toHaveLength(1);
    expect(surfaces[0].arguments![0].name).toBe('input');
    expect(surfaces[0].arguments![0].required).toBe(true);
    expect(surfaces[0].arguments![0].variadic).toBe(false);
  });

  it('extracts optional positional arguments', () => {
    const program = new Command('mytool');
    program.command('run [script]').description('Run a script');

    const surfaces = introspectCommander(program);

    expect(surfaces[0].arguments).toHaveLength(1);
    expect(surfaces[0].arguments![0].name).toBe('script');
    expect(surfaces[0].arguments![0].required).toBe(false);
    expect(surfaces[0].arguments![0].variadic).toBe(false);
  });

  it('extracts variadic positional arguments', () => {
    const program = new Command('mytool');
    program.command('copy <src...>').description('Copy files');

    const surfaces = introspectCommander(program);

    expect(surfaces[0].arguments).toHaveLength(1);
    expect(surfaces[0].arguments![0].variadic).toBe(true);
  });

  it('omits arguments array when command has no positional args', () => {
    const program = new Command('mytool');
    program.command('clean').description('Clean output');

    const surfaces = introspectCommander(program);
    expect(surfaces[0].arguments).toBeUndefined();
  });

  it('generates usage string', () => {
    const program = new Command('mytool');
    program.command('build <input>').description('Build a file');

    const surfaces = introspectCommander(program);

    // Commander generates usage automatically; just confirm it's a non-empty string
    expect(typeof surfaces[0].usage).toBe('string');
    expect(surfaces[0].usage!.length).toBeGreaterThan(0);
  });

  it('handles nested subcommands recursively', () => {
    const program = new Command('mytool');
    const remote = program.command('remote').description('Manage remotes');
    remote.command('add <name> <url>').description('Add a remote');
    remote.command('remove <name>').description('Remove a remote');

    const surfaces = introspectCommander(program);

    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].name).toBe('remote');
    expect(surfaces[0].subcommands).toHaveLength(2);
    expect(surfaces[0].subcommands![0].name).toBe('add');
    expect(surfaces[0].subcommands![1].name).toBe('remove');
    expect(surfaces[0].subcommands![0].arguments).toHaveLength(2);
  });

  it('omits subcommands property when command has no subcommands', () => {
    const program = new Command('mytool');
    program.command('lint').description('Lint source');

    const surfaces = introspectCommander(program);
    expect(surfaces[0].subcommands).toBeUndefined();
  });

  it('extracts multiple top-level commands', () => {
    const program = new Command('mytool');
    program.command('build').description('Build');
    program.command('test').description('Test');
    program.command('deploy').description('Deploy');

    const surfaces = introspectCommander(program);

    expect(surfaces).toHaveLength(3);
    expect(surfaces.map((s) => s.name)).toEqual(['build', 'test', 'deploy']);
  });

  it('kebab-case long flag names are converted to camelCase', () => {
    const program = new Command('mytool');
    program
      .command('generate')
      .description('Generate code')
      .option('--output-file <path>', 'Output file path')
      .option('--max-line-length <n>', 'Max line length');

    const surfaces = introspectCommander(program);
    const names = surfaces[0].options.map((o) => o.name);

    expect(names).toContain('outputFile');
    expect(names).toContain('maxLineLength');
  });

  it('extracts envVar when option has one', () => {
    const program = new Command('mytool');
    const cmd = program.command('serve').description('Serve');
    cmd.addOption(new (require('commander').Option)('--port <number>', 'Port').env('PORT'));

    const surfaces = introspectCommander(program);
    const opt = surfaces[0].options[0];

    expect(opt.envVar).toBe('PORT');
  });
});
