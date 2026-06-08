// packages/client/src/typedoc-entry.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Resolve TypeDoc entry points + tsconfig for a package dir (shared by gen + audit). */
export function resolveTypeDocEntry(cwd: string): { entryPoints: string[]; tsconfig: string } {
  const tsconfig = existsSync(join(cwd, 'tsconfig.json'))
    ? join(cwd, 'tsconfig.json')
    : existsSync(join(cwd, 'tsconfig.build.json'))
      ? join(cwd, 'tsconfig.build.json')
      : join(cwd, 'tsconfig.json'); // default even if absent — TypeDoc will error clearly
  const entryPoints = [join(cwd, 'src', 'index.ts')];
  return { entryPoints, tsconfig };
}
