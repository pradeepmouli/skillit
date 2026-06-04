// packages/client/src/commands/init.ts
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { extractCliSkill, loadProgram, writeCliSkill } from '@skillit/cli';
import {
  detectPackageManager,
  detectProjectNature,
  type RefineSourceKind
} from '../detect-source.js';
import { runRefineCommand, type RefineCommandOpts } from './refine.js';

type PackageManager = 'pnpm' | 'yarn' | 'npm';

/** Options passed to the (CLI-path) skill generator. */
export interface GenerateSkillOpts {
  /** Project root being initialized. */
  cwd: string;
  /** Resolved project nature. */
  nature: RefineSourceKind;
  /** Skill name (consumer package name, scope stripped). */
  name: string;
  /** Absolute output directory (`<cwd>/<out>`). */
  outDir: string;
  /** `--program <file#export>` entry, if provided. */
  program?: string;
}

/**
 * Injectable side-effecting steps for {@link buildInitCommand}. All optional;
 * real defaults run install / generate / refine. Tests inject stubs so no real
 * install, network, or model call runs.
 */
export interface InitDeps {
  /** Install `pkg` as a dev dependency in `cwd` using package manager `pm`. */
  runInstall?(pkg: string, pm: PackageManager, cwd: string): Promise<void>;
  /** Generate the initial skill (CLI path only). */
  generateSkill?(opts: GenerateSkillOpts): Promise<void>;
  /** Dispatch the refine loop for the resolved source. */
  runRefine?(opts: RefineCommandOpts): Promise<void>;
}

interface InitOpts {
  source?: string;
  program?: string;
  out: string;
  modelClient?: string;
  modelCliTimeout?: string;
}

const VALID_SOURCES: readonly RefineSourceKind[] = ['cli', 'mcp', 'typedoc'];

/** Map a project nature to the `@skillit/*` package that handles it. */
function natureToPackage(nature: RefineSourceKind): string {
  if (nature === 'cli') return '@skillit/cli';
  if (nature === 'mcp') return '@skillit/mcp';
  return 'typedoc-plugin-skillit';
}

/** Build the package manager's add-dev command line (for messaging + spawn). */
function addDevCommand(pm: PackageManager, pkg: string): string {
  if (pm === 'pnpm') return `pnpm add -D ${pkg}`;
  if (pm === 'yarn') return `yarn add -D ${pkg}`;
  return `npm install -D ${pkg}`;
}

/** Strip a leading `@scope/` from a package name for use as a skill dir name. */
function skillNameFrom(packageName: string): string {
  const slash = packageName.indexOf('/');
  if (packageName.startsWith('@') && slash !== -1) {
    return packageName.slice(slash + 1);
  }
  return packageName;
}

async function readPackageName(cwd: string): Promise<string> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg.name ?? 'skill';
  } catch {
    return 'skill';
  }
}

/** Default install: spawn the package manager's add-dev command, cwd-scoped. */
function defaultRunInstall(pkg: string, pm: PackageManager, cwd: string): Promise<void> {
  const command = addDevCommand(pm, pkg);
  const [bin, ...args] = command.split(' ');
  return new Promise((resolve, reject) => {
    const child = spawn(bin!, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exited with code ${code}`));
    });
  });
}

/** Default CLI-path skill generation: loadProgram → extractCliSkill → writeCliSkill. */
async function defaultGenerateSkill(opts: GenerateSkillOpts): Promise<void> {
  const program = await loadProgram({ program: opts.program, cwd: opts.cwd });
  const skill = await extractCliSkill({ program, metadata: { name: opts.name } });
  writeCliSkill(skill, { outDir: opts.outDir });
}

/** Default refine dispatch: reuse the shared refine command body. */
function defaultRunRefine(opts: RefineCommandOpts): Promise<void> {
  return runRefineCommand(opts);
}

export function buildInitCommand(deps: InitDeps = {}): Command {
  const runInstall = deps.runInstall ?? defaultRunInstall;
  const generateSkill = deps.generateSkill ?? defaultGenerateSkill;
  const runRefine = deps.runRefine ?? defaultRunRefine;

  return new Command('init')
    .description(
      'Detect the project, install the right @skillit package, generate + refine a skill'
    )
    .option('--source <kind>', 'cli | mcp | typedoc (auto-detected if omitted)')
    .option('--program <file#export>', 'commander program entry (cli source)')
    .option('--out <dir>', 'output directory for the generated skill', 'skills')
    .option(
      '--model-client <kind>',
      'model backend for refine: api | claude | codex | copilot',
      'api'
    )
    .option('--model-cli-timeout <ms>', 'per-call timeout for cli model backends (ms)')
    .action(async (opts: InitOpts) => {
      const cwd = process.cwd();

      // 1. Resolve nature: explicit --source wins, else detect.
      let nature: RefineSourceKind;
      if (opts.source !== undefined) {
        if (!VALID_SOURCES.includes(opts.source as RefineSourceKind)) {
          throw new Error(
            `Invalid --source value: ${opts.source}. Use --source <cli|mcp|typedoc>.`
          );
        }
        nature = opts.source as RefineSourceKind;
      } else {
        nature = await detectProjectNature(cwd);
      }

      // 2 + 3. Map nature → package, install via the detected package manager.
      const pkg = natureToPackage(nature);
      const pm = detectPackageManager(cwd);
      const command = addDevCommand(pm, pkg);
      try {
        await runInstall(pkg, pm, cwd);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        // Surface the exact command and STOP — do not generate or refine.
        throw new Error(`Install failed (${reason}). Run it manually:\n  ${command}`);
      }

      // 4 + 5. Generate + refine — CLI-first: only the cli source is fully
      // automated this pass. For mcp/typedoc, skip both and print actionable
      // next-step guidance rather than silently no-opping (refine needs
      // source-specific flags like --mcp that init can't supply yet).
      if (nature === 'cli') {
        const outDir = join(cwd, opts.out);
        const name = skillNameFrom(await readPackageName(cwd));
        const generateOpts: GenerateSkillOpts = {
          cwd,
          nature,
          name,
          outDir,
          ...(opts.program !== undefined ? { program: opts.program } : {})
        };
        try {
          await generateSkill(generateOpts);
        } catch (error) {
          // The cli source only auto-loads a commander program. A yargs/other
          // CLI (still classified as 'cli') can't be generated yet — degrade
          // gracefully: surface the reason and how to proceed, do NOT crash,
          // and do NOT run refine/regenerate on a failed generate.
          const reason = error instanceof Error ? error.message : String(error);
          console.log(
            `Installed ${pkg}, but couldn't auto-load a commander program (${reason}). ` +
              `If this is a commander CLI, run: skillit refine --source cli --program <file#export>. ` +
              `(yargs/other CLIs aren't auto-generated yet.)`
          );
          return;
        }
        await runRefine({
          source: nature,
          ...(opts.program !== undefined ? { program: opts.program } : {}),
          ...(opts.modelClient !== undefined ? { modelClient: opts.modelClient } : {}),
          ...(opts.modelCliTimeout !== undefined ? { modelCliTimeout: opts.modelCliTimeout } : {}),
          maxIterations: '5',
          items: '5'
        });
        // refine only writes JSDoc back into source files; regenerate so the
        // on-disk skill reflects the freshly-written annotations. Runs only
        // after a successful refine (a refine throw propagates above).
        await generateSkill(generateOpts);
      } else {
        const extra = nature === 'mcp' ? ' [--mcp <path>]' : '';
        console.log(
          `Installed ${pkg}. Skill generation + refine for the ${nature} source isn't automated yet — run: skillit refine --source ${nature}${extra}`
        );
      }
    });
}
