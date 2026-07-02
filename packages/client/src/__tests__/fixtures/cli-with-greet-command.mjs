import { Command } from 'commander';

const program = new Command().name('greet-cli');
program.command('greet').description('Greet someone');

export { program };
