import { join } from 'node:path';

export function createInstallTargets(workDir: string) {
  return {
    installA: join(workDir, '.claude', 'skills'),
    installB: join(workDir, '.agents', 'skills')
  };
}
