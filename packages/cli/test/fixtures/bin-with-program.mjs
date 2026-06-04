import { Command } from 'commander';

const program = new Command().name('auto-tool');
program.command('build').description('Build the project');

export { program };
