import type {
  ExtractedConfigSurface,
  ExtractedConfigOption,
  ExtractedConfigArgument
} from '@to-skills/core';

/**
 * Parse standard `--help` text output into an {@link ExtractedConfigSurface}.
 *
 * This is the framework-agnostic fallback used when runtime introspection of a
 * commander/yargs program is not available.
 *
 * @param text        Raw text emitted by `program --help`
 * @param commandName Canonical name for this surface (e.g. `"generate"`)
 *
 * @category Fallback
 * @useWhen
 * - Runtime introspection is unavailable (no access to the program object)
 * - The CLI uses a framework other than Commander (yargs, oclif, custom)
 */
export function parseHelpOutput(text: string, commandName: string): ExtractedConfigSurface {
  if (!text.trim()) {
    return {
      name: commandName,
      description: '',
      sourceType: 'cli',
      options: [],
      arguments: []
    };
  }

  const lines = text.split('\n');

  let usageString: string | undefined;
  let description = '';
  let inOptionsBlock = false;
  let inArgumentsBlock = false;

  const options: ExtractedConfigOption[] = [];
  const args: ExtractedConfigArgument[] = [];
  const argumentDescriptions = new Map<string, string>();

  // Track whether we have seen the first non-usage, non-blank line for
  // the description. We stop collecting description lines once we hit an
  // options block or another section header.
  let descriptionCandidateIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();

    // -----------------------------------------------------------------------
    // Usage line
    // -----------------------------------------------------------------------
    if (trimmed.startsWith('Usage:')) {
      usageString = trimmed.slice('Usage:'.length).trim();
      args.push(...parsePositionalArgs(usageString));
      inOptionsBlock = false;
      descriptionCandidateIndex = i + 1; // description may follow
      continue;
    }

    // -----------------------------------------------------------------------
    // Options block header
    // -----------------------------------------------------------------------
    if (/^Options\s*:/i.test(trimmed) || trimmed === 'Options') {
      inOptionsBlock = true;
      inArgumentsBlock = false;
      continue;
    }

    if (/^Arguments\s*:/i.test(trimmed) || trimmed === 'Arguments') {
      inOptionsBlock = false;
      inArgumentsBlock = true;
      continue;
    }

    // -----------------------------------------------------------------------
    // Any other section header (Arguments:, Commands:, Examples:, …) ends
    // the options block and description collection.
    // -----------------------------------------------------------------------
    if (/^[A-Z][A-Za-z ]+:/.test(trimmed) && !trimmed.startsWith('-')) {
      inOptionsBlock = false;
      inArgumentsBlock = false;
      descriptionCandidateIndex = -1;
      continue;
    }

    // -----------------------------------------------------------------------
    // Description: first non-empty line after Usage that is not a section
    // -----------------------------------------------------------------------
    if (
      !inOptionsBlock &&
      description === '' &&
      descriptionCandidateIndex >= 0 &&
      i === descriptionCandidateIndex &&
      trimmed !== '' &&
      !trimmed.startsWith('-')
    ) {
      description = trimmed;
      continue;
    }

    // Advance the candidate index over blank lines between Usage and desc
    if (
      !inOptionsBlock &&
      description === '' &&
      descriptionCandidateIndex >= 0 &&
      i === descriptionCandidateIndex &&
      trimmed === ''
    ) {
      descriptionCandidateIndex++;
      continue;
    }

    // -----------------------------------------------------------------------
    // Option line inside Options block
    // -----------------------------------------------------------------------
    if (inOptionsBlock && trimmed.startsWith('-')) {
      const opt = parseOptionLine(raw);
      if (opt) {
        options.push(opt);
      }
      continue;
    }

    if (inArgumentsBlock) {
      const arg = parseArgumentLine(raw);
      if (arg) {
        argumentDescriptions.set(normalizeArgumentName(arg.name), arg.description);
        if (
          !args.some(
            (existing) => normalizeArgumentName(existing.name) === normalizeArgumentName(arg.name)
          )
        ) {
          args.push({
            name: arg.name,
            description: arg.description,
            required: arg.required,
            variadic: arg.variadic
          });
        }
      }
    }
  }

  for (const arg of args) {
    const descriptionForArg = argumentDescriptions.get(normalizeArgumentName(arg.name));
    if (descriptionForArg) {
      arg.description = descriptionForArg;
    }
  }

  return {
    name: commandName,
    description,
    sourceType: 'cli',
    ...(usageString !== undefined ? { usage: usageString } : {}),
    options,
    arguments: args
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse positional arguments from a usage string.
 *
 * Recognises:
 *   `<required-arg>`   → required, non-variadic
 *   `[optional-arg]`   → optional, non-variadic
 *   `<arg...>` / `<...arg>` / `[arg...]` → variadic variants
 *
 * Flags (`-f` / `--flag`) and meta-tokens like `[options]` / `[command]` are
 * ignored.
 */
function parsePositionalArgs(usage: string): ExtractedConfigArgument[] {
  const result: ExtractedConfigArgument[] = [];

  // Match <name> or [name] tokens, capturing the inner text
  const re = /(<([^>]+)>|\[([^\]]+)\])/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(usage)) !== null) {
    const full = match[0];
    const inner = (match[2] ?? match[3] ?? '').trim();

    // Skip meta-placeholders that aren't real positional args
    if (/^options?$/i.test(inner) || /^commands?$/i.test(inner)) {
      continue;
    }
    // Skip flag-like tokens (shouldn't appear here, but be defensive)
    if (inner.startsWith('-')) {
      continue;
    }

    const required = full.startsWith('<');
    const variadic = inner.endsWith('...') || inner.startsWith('...');
    const name = inner.replace(/\.{3}/g, '').trim();

    result.push({
      name,
      description: '',
      required,
      variadic
    });
  }

  return result;
}

/**
 * Parse a single option line from a `--help` block.
 *
 * Handles formats:
 *   `-c, --config <path>   Description text (required)`
 *   `--dry-run              Preview mode (default: false)`
 *   `    --verbose          Verbose output`
 *
 * Returns `null` if the line should be skipped (e.g. `-h, --help` or
 * `--version`).
 */
function parseOptionLine(raw: string): ExtractedConfigOption | null {
  const trimmed = raw.trim();

  // -------------------------------------------------------------------------
  // Extract flags portion vs description portion.
  //
  // Flags appear at the start; description follows after ≥2 spaces (or a tab).
  // We split on the first run of 2+ spaces after the flags/arg portion.
  // -------------------------------------------------------------------------

  // 1. Strip leading whitespace
  // 2. Match the flags+arg group: everything up to 2+ spaces or tab
  const flagsAndRest = trimmed.match(/^(-[^\s].*?)(?:\s{2,}|\t)(.*)$/) ?? null;

  let flagsPart: string;
  let descPart: string;

  if (flagsAndRest) {
    flagsPart = (flagsAndRest[1] ?? '').trim();
    descPart = (flagsAndRest[2] ?? '').trim();
  } else {
    // No description separator found — the whole trimmed line is the flags
    flagsPart = trimmed;
    descPart = '';
  }

  // -------------------------------------------------------------------------
  // Parse flags: optional short flag, long flag, optional argument
  //   -c, --config <path>
  //   --dry-run
  //   -o, --out <dir>
  // -------------------------------------------------------------------------
  let cliShort: string | undefined;
  let cliFlag: string | undefined;
  let argName: string | undefined; // <arg> after the flag

  // Match short flag
  const shortMatch = flagsPart.match(/^(-[a-zA-Z]),?\s*/);
  if (shortMatch) {
    cliShort = shortMatch[1];
    flagsPart = flagsPart.slice(shortMatch[0].length);
  }

  // Match long flag with optional required/optional value:
  //   --config <path>
  //   --config [path]
  const longMatch = flagsPart.match(/^(--[a-zA-Z][\w-]*)(?:\s+(?:<([^>]+)>|\[([^\]]+)\]))?/);
  if (!longMatch) {
    // No long flag found — not a valid option line
    return null;
  }
  cliFlag = longMatch[1];
  argName = longMatch[2] ?? longMatch[3]; // undefined when flag is boolean

  // -------------------------------------------------------------------------
  // Skip internal / noise flags
  // -------------------------------------------------------------------------
  if (cliFlag === '--help' || cliFlag === '--version') {
    return null;
  }
  if (cliShort === '-h' || cliShort === '-V') {
    return null;
  }

  // -------------------------------------------------------------------------
  // Extract default value from description: (default: value)
  // -------------------------------------------------------------------------
  let defaultValue: string | undefined;
  const defaultMatch = descPart.match(/\(default:\s*([^)]+)\)/i);
  if (defaultMatch) {
    defaultValue = defaultMatch[1]?.trim();
    descPart = descPart.replace(defaultMatch[0], '').trim();
  }

  // -------------------------------------------------------------------------
  // Detect required flag from description: (required)
  // -------------------------------------------------------------------------
  let required = false;
  const requiredMatch = descPart.match(/\(required\)/i);
  if (requiredMatch) {
    required = true;
    descPart = descPart.replace(requiredMatch[0], '').trim();
  }

  // Clean up any trailing punctuation left after stripping annotations
  descPart = descPart.replace(/\s+$/, '');

  // -------------------------------------------------------------------------
  // Infer type: boolean when no <arg>, string otherwise
  // -------------------------------------------------------------------------
  const type = argName ? 'string' : 'boolean';

  // -------------------------------------------------------------------------
  // Derive canonical name from long flag (strip leading --)
  // -------------------------------------------------------------------------
  const name = cliFlag ? cliFlag.replace(/^--/, '') : '';

  const option: ExtractedConfigOption = {
    name,
    cliFlag,
    type,
    description: descPart,
    required
  };

  if (cliShort !== undefined) {
    option.cliShort = cliShort;
  }
  if (defaultValue !== undefined) {
    option.defaultValue = defaultValue;
  }

  return option;
}

function parseArgumentLine(raw: string): ExtractedConfigArgument | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.startsWith('-')) {
    return null;
  }

  const match = trimmed.match(/^([<[.\]>\w-]+)\s{2,}(.*)$/);
  if (!match) {
    return null;
  }

  const token = (match[1] ?? '').trim();
  const name = normalizeArgumentName(token);
  const description = (match[2] ?? '').trim();
  if (name.length === 0) {
    return null;
  }

  return {
    name,
    description,
    required: token.startsWith('<'),
    variadic: token.includes('...')
  };
}

function normalizeArgumentName(name: string): string {
  return name
    .replace(/[<>[\]]/g, '')
    .replace(/\.{3}/g, '')
    .trim();
}
