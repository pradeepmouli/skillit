import { describe, expect, it } from 'vitest';
import { ConfigRefineSource } from '../config-source.js';

describe('ConfigRefineSource.resolveTargetLocation', () => {
  const source = new ConfigRefineSource({
    configFile: '/repo/src/config.ts',
    typeName: 'MyConfig'
  });

  it('resolves a config-option target to {file, declName=typeName, propertyPath=key}', () => {
    const loc = source.resolveTargetLocation({ name: 'components.prefix', kind: 'config-option' });
    expect(loc).toEqual({
      file: '/repo/src/config.ts',
      declName: 'MyConfig',
      propertyPath: 'components.prefix'
    });
  });

  it('resolves a config-example target to the config file with no propertyPath', () => {
    const loc = source.resolveTargetLocation({ name: 'MyConfig', kind: 'config-example' });
    expect(loc).toEqual({ file: '/repo/src/config.ts', declName: 'MyConfig' });
  });
});
