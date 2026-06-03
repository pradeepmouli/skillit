import { Command } from 'commander';

export function buildProgram() {
  const program = new Command().name('fixture-tool');
  program.command('gen').description('Generate things');
  return program;
}
