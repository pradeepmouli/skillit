import { describe, it, expect } from 'vitest';
import { readOptionsTags } from '../src/options-jsdoc.js';

describe('readOptionsTags', () => {
  it('reads routing tags from a *Options interface JSDoc', () => {
    const source = `/**\n * @useWhen When generating\n */\nexport interface GenOptions {}`;

    expect(readOptionsTags('GenOptions', source)).toEqual({ useWhen: 'When generating' });
  });

  it('returns {} when the interface is missing', () => {
    const source = `export interface OtherOptions {}`;

    expect(readOptionsTags('GenOptions', source)).toEqual({});
  });
});
