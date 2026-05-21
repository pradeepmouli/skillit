import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emptyOverlay, readOverlay, writeOverlay, applyFixToOverlay } from '../overlay.js';

let tmp = '';
afterEach(() => {
  if (tmp) {
    rmSync(tmp, { recursive: true });
    tmp = '';
  }
});

describe('emptyOverlay', () => {
  it('returns version 1 with empty tools', () => {
    const o = emptyOverlay();
    expect(o.version).toBe(1);
    expect(o.tools).toEqual({});
  });
});

describe('readOverlay / writeOverlay', () => {
  it('round-trips an overlay', () => {
    tmp = mkdtempSync(join(tmpdir(), 'overlay-'));
    const path = join(tmp, 'overlay.json');
    const o = emptyOverlay();
    writeOverlay(path, o);
    expect(readOverlay(path)).toEqual(o);
  });

  it('returns empty overlay for missing file', () => {
    expect(readOverlay('/nonexistent/path/overlay.json')).toEqual(emptyOverlay());
  });
});

describe('applyFixToOverlay', () => {
  it('sets a useWhen value on a tool', () => {
    const o = emptyOverlay();
    const result = applyFixToOverlay(o, {
      toolName: 'list_files',
      tag: 'useWhen',
      value: 'When listing directory contents'
    });
    expect(result.tools['list_files']?.useWhen).toBe('When listing directory contents');
    expect(o.tools['list_files']).toBeUndefined();
  });

  it('does not duplicate identical value', () => {
    let o = emptyOverlay();
    o = applyFixToOverlay(o, { toolName: 'list_files', tag: 'useWhen', value: 'A' });
    o = applyFixToOverlay(o, { toolName: 'list_files', tag: 'useWhen', value: 'A' });
    expect(o.tools['list_files']?.useWhen).toBe('A');
  });

  it('appends avoidWhen to existing value with newline', () => {
    let o = emptyOverlay();
    o = applyFixToOverlay(o, { toolName: 't', tag: 'avoidWhen', value: 'First' });
    o = applyFixToOverlay(o, { toolName: 't', tag: 'avoidWhen', value: 'Second' });
    expect(o.tools['t']?.avoidWhen).toBe('First\nSecond');
  });
});
