import { describe, it, expect } from 'vitest';
import { resolveInvocationMode, applyNpxMode } from '../src/npx-mode.js';
import type { ExtractedSkill, PackageMetadata } from '@skillit/core';

function makeSkill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: 'my-tool',
    description: '',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    configSurfaces: [],
    examples: [],
    ...overrides
  };
}

describe('resolveInvocationMode', () => {
  it('returns npx for a public package with a bin field', () => {
    const meta: PackageMetadata = { bin: { 'my-tool': './dist/cli.js' }, isPrivate: false };
    expect(resolveInvocationMode(meta)).toBe('npx');
  });

  it('returns global for a private package with a bin field', () => {
    const meta: PackageMetadata = { bin: { 'my-tool': './dist/cli.js' }, isPrivate: true };
    expect(resolveInvocationMode(meta)).toBe('global');
  });

  it('returns global when bin is absent', () => {
    const meta: PackageMetadata = {};
    expect(resolveInvocationMode(meta)).toBe('global');
  });

  it('returns global when bin object is empty', () => {
    const meta: PackageMetadata = { bin: {} };
    expect(resolveInvocationMode(meta)).toBe('global');
  });

  it('respects explicit npx override even for private packages', () => {
    const meta: PackageMetadata = { bin: { 'my-tool': './cli.js' }, isPrivate: true };
    expect(resolveInvocationMode(meta, 'npx')).toBe('npx');
  });

  it('respects explicit global override for public packages', () => {
    const meta: PackageMetadata = { bin: { 'my-tool': './cli.js' }, isPrivate: false };
    expect(resolveInvocationMode(meta, 'global')).toBe('global');
  });
});

describe('applyNpxMode', () => {
  it('sets cliInvocationPrefix for a public package in npx mode', () => {
    const skill = makeSkill();
    const meta: PackageMetadata = {
      fullPackageName: '@my-scope/my-tool',
      bin: { 'my-tool': './cli.js' },
      isPrivate: false
    };
    applyNpxMode(skill, meta);
    expect(skill.cliInvocationPrefix).toBe('npx @my-scope/my-tool');
  });

  it('does not set cliInvocationPrefix for global mode', () => {
    const skill = makeSkill();
    const meta: PackageMetadata = { fullPackageName: 'my-tool', bin: { 'my-tool': './cli.js' } };
    applyNpxMode(skill, meta, 'global');
    expect(skill.cliInvocationPrefix).toBeUndefined();
  });

  it('does not set cliInvocationPrefix when package has no bin', () => {
    const skill = makeSkill();
    const meta: PackageMetadata = { fullPackageName: 'my-tool' };
    applyNpxMode(skill, meta);
    expect(skill.cliInvocationPrefix).toBeUndefined();
  });

  it('substitutes binary name with npx prefix in readme features', () => {
    const skill = makeSkill();
    const meta: PackageMetadata = {
      fullPackageName: 'my-tool',
      bin: { 'my-tool': './cli.js' },
      readme: { features: 'Run my-tool build to compile.' }
    };
    applyNpxMode(skill, meta);
    expect(skill.readmeFeatures).toBe('Run npx my-tool build to compile.');
  });

  it('substitutes binary name with npx prefix in readme troubleshooting', () => {
    const skill = makeSkill();
    const meta: PackageMetadata = {
      fullPackageName: 'my-tool',
      bin: { 'my-tool': './cli.js' },
      readme: { troubleshooting: 'Try my-tool --version first.' }
    };
    applyNpxMode(skill, meta);
    expect(skill.readmeTroubleshooting).toBe('Try npx my-tool --version first.');
  });

  it('prepends substituted quickStart to examples', () => {
    const skill = makeSkill({ examples: ['existing example'] });
    const meta: PackageMetadata = {
      fullPackageName: 'my-tool',
      bin: { 'my-tool': './cli.js' },
      readme: { quickStart: 'my-tool init && my-tool gen' }
    };
    applyNpxMode(skill, meta);
    expect(skill.examples).toEqual(['npx my-tool init && npx my-tool gen', 'existing example']);
  });

  it('copies readme fields without substitution in global mode', () => {
    const skill = makeSkill();
    const meta: PackageMetadata = {
      fullPackageName: 'my-tool',
      bin: { 'my-tool': './cli.js' },
      isPrivate: true,
      readme: { features: 'Run my-tool build.' }
    };
    applyNpxMode(skill, meta);
    // global mode: content copied as-is, no npx substitution
    expect(skill.readmeFeatures).toBe('Run my-tool build.');
    expect(skill.cliInvocationPrefix).toBeUndefined();
  });

  it('leaves readme fields unset when no readme is present', () => {
    const skill = makeSkill();
    const meta: PackageMetadata = {
      fullPackageName: 'my-tool',
      bin: { 'my-tool': './cli.js' }
    };
    applyNpxMode(skill, meta);
    expect(skill.readmeFeatures).toBeUndefined();
    expect(skill.readmeTroubleshooting).toBeUndefined();
    expect(skill.examples).toEqual([]);
  });

  it('replaces all occurrences of binary name in a multi-occurrence string', () => {
    const skill = makeSkill();
    const meta: PackageMetadata = {
      fullPackageName: 'my-tool',
      bin: { 'my-tool': './cli.js' },
      readme: { features: 'my-tool build; my-tool test' }
    };
    applyNpxMode(skill, meta);
    expect(skill.readmeFeatures).toBe('npx my-tool build; npx my-tool test');
  });
});
