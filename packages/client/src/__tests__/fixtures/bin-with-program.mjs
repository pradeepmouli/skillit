import { Command } from 'commander';

const program = new Command().name('bin-tool');
program.command('build').description('Build the project');

export { program };
