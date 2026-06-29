// packages/client/src/commands/init.ts
import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  detectPackageManager,
  detectProjectNature,
  type RefineSourceKind
} from '../detect-source.js';
import { generatePostinstallScript } from '../postinstall-template.js';
import { skillitConfigCandidates } from '../config.js';

type PackageManager = 'pnpm' | 'yarn' | 'npm';

/**
 * Injectable side-effecting steps for {@link buildInitCommand}. Phase 0 init is
 * install/wire ONLY — it no longer generates or refines (those are `skillit
 * gen` and `skillit refine`), so the only injectable step is the install.
 */
export interface InitDeps {
  /** Install `pkg` as a dev dependency in `cwd` using package manager `pm`. */
  runInstall?(pkg: string, pm: PackageManager, cwd: string): Promise<void>;
  /**
   * Write `skillit-postinstall.cjs` and wire `scripts.postinstall` in
   * `package.json`. Skips (with a warning) if `postinstall` is already set.
   */
  wirePostinstall?(cwd: string): Promise<void>;
  /** Write a default `skillit.config.ts` if no skillit config exists yet. */
  ensureSkillitConfig?(cwd: string): Promise<void>;
}

interface InitOpts {
  source?: string;
  configType?: string;
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

async function defaultWirePostinstall(cwd: string): Promise<void> {
  const pkgPath = join(cwd, 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string>; [key: string]: unknown };

  if (pkg.scripts?.['postinstall']) {
    console.warn(
      `Skipping postinstall wiring: scripts.postinstall is already set to "${pkg.scripts['postinstall']}". Add "node ./skillit-postinstall.cjs" to it manually if needed.`
    );
    return;
  }

  await writeFile(join(cwd, 'skillit-postinstall.cjs'), generatePostinstallScript(), 'utf8');

  if (!pkg.scripts) pkg.scripts = {};
  pkg.scripts['postinstall'] = 'node ./skillit-postinstall.cjs';
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

async function defaultEnsureSkillitConfig(cwd: string): Promise<void> {
  const candidates = skillitConfigCandidates().map((name) => join(cwd, name));
  for (const candidate of candidates) {
    if (await exists(candidate)) return;
  }
  const configPath = join(cwd, 'skillit.config.ts');
  await writeFile(configPath, defaultSkillitConfigTemplate(), 'utf8');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultSkillitConfigTemplate(): string {
  return `import { defineSkillitConfig } from '@skillit/client';

export default defineSkillitConfig({
  // skillDir: 'skills',
  // plugins: {
  //   cli: {
  //     // skillDir: 'skills',
  //     // maxTokens: 4000,
  //     // contentTypes: {
  //     //   commands: { maxTokens: 5000 }
  //     // }
  //   }
  // }
});
`;
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

export function buildInitCommand(deps: InitDeps = {}): Command {
  const runInstall = deps.runInstall ?? defaultRunInstall;
  const wirePostinstall = deps.wirePostinstall ?? defaultWirePostinstall;
  const ensureSkillitConfig = deps.ensureSkillitConfig ?? defaultEnsureSkillitConfig;

  return new Command('init')
    .description(
      'Detect the project and install the right @skillit package (then run `skillit gen`)'
    )
    .option('--source <kind>', 'cli | mcp | typedoc | config (auto-detected if omitted)')
    .option('--config-type <file#export>', 'config type entry (config source)')
    .action(async (opts: InitOpts) => {
      const cwd = process.cwd();

      // Config source is built into the client — nothing to install. Just point
      // the user at `skillit gen`.
      if (opts.source === 'config') {
        if (opts.configType === undefined) {
          throw new Error(
            'The config source requires --config-type <file#export> (e.g. ./src/config.ts#MyConfig).'
          );
        }
        console.log(
          `Config source needs no install. Generate the skill with:\n  skillit gen --source config --config-type ${opts.configType}`
        );
        await ensureSkillitConfig(cwd);
        return;
      }

      // Resolve nature: explicit --source wins, else detect.
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

      // Map nature → package, install via the detected package manager.
      const pkg = natureToPackage(nature);
      const pm = detectPackageManager(cwd);
      const command = addDevCommand(pm, pkg);
      try {
        await runInstall(pkg, pm, cwd);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Install failed (${reason}). Run it manually:\n  ${command}`);
      }

      // Source-aware next step: `skillit gen` generates the cli source today;
      // mcp uses `skillit mcp extract` and typedoc the TypeDoc plugin (gen
      // support for those lands in a later phase). Don't point users at a
      // command that would immediately error for their source.
      if (nature === 'cli') {
        await wirePostinstall(cwd);
        await ensureSkillitConfig(cwd);
        console.log(`Installed ${pkg}. Generate the skill with:\n  skillit gen --source cli`);
      } else if (nature === 'mcp') {
        await ensureSkillitConfig(cwd);
        console.log(
          `Installed ${pkg}. Generate the skill with:\n  skillit mcp extract\n(skillit gen support for the mcp source lands in a later phase.)`
        );
      } else {
        await ensureSkillitConfig(cwd);
        console.log(
          `Installed ${pkg}. Generate the skill by running TypeDoc with the plugin enabled.\n(skillit gen support for the typedoc source lands in a later phase.)`
        );
      }
    });
}
