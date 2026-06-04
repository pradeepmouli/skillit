import type {
  ExtractedConfigSurface,
  ExtractedConfigOption,
  ExtractedConfigArgument
} from '@skillit/core';

/**
 * Converts a kebab-case string to camelCase.
 * e.g. "output-dir" → "outputDir"
 */
function kebabToCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

/**
 * Infers the type of a CLI option from its flags string.
 * If the flags contain `<` or `[`, it accepts a value → 'string'.
 * Otherwise it is a boolean toggle.
 */
function inferType(flags: string): string {
  return flags.includes('<') || flags.includes('[') ? 'string' : 'boolean';
}

/**
 * Extracts a single commander Command into an ExtractedConfigSurface.
 */
function extractCommand(cmd: any, parentName: string): ExtractedConfigSurface {
  const name = cmd.name?.() ?? '';
  const fullName = parentName ? `${parentName} ${name}` : name;

  const options: ExtractedConfigOption[] = (cmd.options ?? []).map((opt: any) => {
    const longFlag: string = opt.long ?? '';
    const canonicalName = kebabToCamelCase(longFlag.replace(/^--/, ''));

    const result: ExtractedConfigOption = {
      name: canonicalName,
      cliFlag: longFlag || undefined,
      cliShort: opt.short ?? undefined,
      type: inferType(opt.flags ?? ''),
      description: opt.description ?? '',
      // commander's `opt.required` only describes the VALUE syntax: it is true for
      // `--flag <x>` (value required when the flag is present) and false for
      // `--flag [x]` (value optional). It says nothing about whether the option
      // itself must be supplied — that is `opt.mandatory`, set only by
      // `.requiredOption()`. Use mandatory so optional `--flag <value>` opts are
      // not mismarked as required.
      required: !!opt.mandatory
    };

    if (opt.defaultValue !== undefined) {
      result.defaultValue = String(opt.defaultValue);
    }

    if (opt.envVar) {
      result.envVar = opt.envVar;
    }

    return result;
  });

  const args: ExtractedConfigArgument[] = (cmd.registeredArguments ?? []).map((arg: any) => {
    const result: ExtractedConfigArgument = {
      name: arg.name?.() ?? '',
      description: arg.description ?? '',
      required: !!arg.required,
      variadic: !!arg.variadic
    };

    if (arg.defaultValue !== undefined) {
      result.defaultValue = String(arg.defaultValue);
    }

    return result;
  });

  const subcommands: ExtractedConfigSurface[] = (cmd.commands ?? []).map((sub: any) =>
    extractCommand(sub, fullName)
  );

  const surface: ExtractedConfigSurface = {
    name,
    description: cmd.description?.() ?? '',
    sourceType: 'cli',
    usage: cmd.usage?.() ?? undefined,
    options
  };

  if (args.length > 0) {
    surface.arguments = args;
  }

  if (subcommands.length > 0) {
    surface.subcommands = subcommands;
  }

  return surface;
}

/**
 * Introspects a commander Program object and extracts all top-level command
 * definitions as ExtractedConfigSurface[].
 *
 * @param program - A commander `Command` instance (typed as `any` to avoid
 *   a hard dependency on the commander package at the call site).
 * @returns An array of extracted config surfaces, one per top-level command.
 *   Returns an empty array if the program has no subcommands.
 *
 * @category Commander
 * @useWhen
 * - You have a Commander program and want structured option/argument extraction with full fidelity
 * @avoidWhen
 * - Your CLI uses yargs, oclif, or another framework — use parseHelpOutput as a fallback instead
 */
export function introspectCommander(program: any): ExtractedConfigSurface[] {
  const commands: any[] = program.commands ?? [];
  if (commands.length === 0) return [];
  return commands.map((cmd) => extractCommand(cmd, program.name?.() ?? ''));
}
