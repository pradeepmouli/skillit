import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';

export interface LoadProgramOptions {
  /** Explicit `file#export` reference to a Command or zero-arg factory. */
  program?: string;
  /** Directory to resolve relative paths and `package.json` against. */
  cwd: string;
}

const LOAD_ERROR = 'Could not load a commander program; pass --program <file#export>';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolves a candidate export into a commander {@link Command}.
 *
 * Accepts either a `Command` instance directly or a zero-argument factory
 * function that returns one. Returns `undefined` for anything else.
 */
async function resolveCommand(candidate: unknown): Promise<Command | undefined> {
  if (candidate instanceof Command) {
    return candidate;
  }
  if (
    typeof candidate === 'function' &&
    (candidate as (...args: unknown[]) => unknown).length === 0
  ) {
    const result = await (candidate as () => unknown)();
    if (result instanceof Command) {
      return result;
    }
  }
  return undefined;
}

async function importModule(absPath: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(absPath).href)) as Record<string, unknown>;
}

/**
 * Loads a commander program for refinement.
 *
 * When `opts.program` is provided as `file#export`, the file is resolved
 * against `cwd`, imported, and the named export is used (a `Command` or a
 * zero-arg factory). Otherwise the program is auto-discovered from the
 * consumer's `package.json` `bin` entry, probing the exports `buildProgram`,
 * `createProgram`, `program`, then `default`.
 *
 * @throws Error advising `--program <file#export>` when no program can be loaded.
 */
export async function loadProgram(opts: LoadProgramOptions): Promise<Command> {
  if (opts.program !== undefined) {
    const [file, exportName] = opts.program.split('#');
    if (!file || !exportName) {
      throw new Error(LOAD_ERROR);
    }
    const absPath = path.resolve(opts.cwd, file);
    let mod: Record<string, unknown>;
    try {
      mod = await importModule(absPath);
    } catch (cause) {
      throw new Error(
        `Could not import '${absPath}'; pass --program <file#export>: ${messageOf(cause)}`,
        { cause }
      );
    }
    const command = await resolveCommand(mod[exportName]);
    if (!command) {
      throw new Error(
        `Export '${exportName}' from '${absPath}' is not a commander Command or factory; pass --program <file#export>`
      );
    }
    return command;
  }

  const pkgPath = path.join(opts.cwd, 'package.json');
  let bin: string | undefined;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      bin?: string | Record<string, string>;
    };
    bin = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin ?? {})[0];
  } catch {
    throw new Error(LOAD_ERROR);
  }
  if (!bin) {
    throw new Error(LOAD_ERROR);
  }

  const absBin = path.resolve(opts.cwd, bin);
  let mod: Record<string, unknown>;
  try {
    mod = await importModule(absBin);
  } catch {
    throw new Error(LOAD_ERROR);
  }

  for (const exportName of ['buildProgram', 'createProgram', 'program', 'default']) {
    const command = await resolveCommand(mod[exportName]);
    if (command) {
      return command;
    }
  }

  throw new Error(LOAD_ERROR);
}
