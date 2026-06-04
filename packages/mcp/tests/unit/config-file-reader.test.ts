/**
 * Unit tests for `readMcpConfigFile` (T091, US8 refactor).
 *
 * Covers:
 *  - happy path: valid 3-server config round-trips through the validator and
 *    surfaces `ConfigEntry[]` with discriminated `McpTransport`
 *  - ENOENT → TRANSPORT_FAILED with clear message
 *  - malformed JSON → TRANSPORT_FAILED with cause preserved
 *  - missing `mcpServers` key → TRANSPORT_FAILED
 *  - `mcpServers` is array (not object) → TRANSPORT_FAILED
 *  - entry missing both `command` and `url` → TRANSPORT_FAILED with entry name
 *  - `disabled: true` is preserved (skipping happens at extract time)
 *  - per-field type validation (`command: 5` → TRANSPORT_FAILED)
 *
 * The reader's return type is `readonly ConfigEntry[]` — each entry carries
 * a fully-discriminated `McpTransport`, so consumers no longer need to
 * re-narrow `command`-vs-`url` at runtime.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readMcpConfigFile } from '../../src/config/file-reader.js';
import { McpError } from '../../src/errors.js';

describe('readMcpConfigFile', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-cfg-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function writeConfig(content: string): string {
    const p = join(workDir, 'mcp.json');
    writeFileSync(p, content);
    return p;
  }

  it('parses a valid 3-server config into a discriminated ConfigEntry[]', async () => {
    const p = writeConfig(
      JSON.stringify({
        mcpServers: {
          fs: { command: 'npx', args: ['-y', '@x/server-fs', '/tmp'] },
          everything: { command: 'npx', args: ['-y', '@x/server-everything'] },
          remote: { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer x' } }
        }
      })
    );
    const entries = await readMcpConfigFile(p);
    expect(entries.map((e) => e.name)).toEqual(['fs', 'everything', 'remote']);

    const fs = entries.find((e) => e.name === 'fs');
    expect(fs?.transport).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@x/server-fs', '/tmp']
    });

    const remote = entries.find((e) => e.name === 'remote');
    expect(remote?.transport).toEqual({
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer x' }
    });
  });

  it('throws TRANSPORT_FAILED when the file does not exist', async () => {
    const p = join(workDir, 'does-not-exist.json');
    await expect(readMcpConfigFile(p)).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'TRANSPORT_FAILED' &&
        /Config file not found/.test(err.message)
    );
  });

  it('throws TRANSPORT_FAILED with cause preserved on malformed JSON', async () => {
    const p = writeConfig('{ this is not json }');
    let thrown: unknown;
    try {
      await readMcpConfigFile(p);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(McpError);
    const err = thrown as McpError;
    expect(err.code).toBe('TRANSPORT_FAILED');
    expect(err.message).toMatch(/Failed to parse/);
    expect(err.cause).toBeInstanceOf(SyntaxError);
  });

  it('throws when the top-level "mcpServers" key is missing', async () => {
    const p = writeConfig(JSON.stringify({ servers: {} }));
    await expect(readMcpConfigFile(p)).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'TRANSPORT_FAILED' &&
        /missing required key "mcpServers"/.test(err.message)
    );
  });

  it('throws when "mcpServers" is an array rather than an object', async () => {
    const p = writeConfig(JSON.stringify({ mcpServers: [] }));
    await expect(readMcpConfigFile(p)).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'TRANSPORT_FAILED' &&
        /"mcpServers" must be an object/.test(err.message)
    );
  });

  it('throws with the entry name when an entry has neither command nor url', async () => {
    const p = writeConfig(
      JSON.stringify({
        mcpServers: { broken: { args: ['no-command'] } }
      })
    );
    await expect(readMcpConfigFile(p)).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'TRANSPORT_FAILED' &&
        /entry "broken".*either "command".*or "url"/.test(err.message)
    );
  });

  it('throws with the entry name on a wholly-empty entry (neither command nor url, no other fields)', async () => {
    // US8 refactor — covers the case the cli.ts "Defensive" branch used to
    // guard. The reader now rejects this at the boundary so cli.ts never
    // sees an entry with neither command nor url.
    const p = writeConfig(
      JSON.stringify({
        mcpServers: { empty: {} }
      })
    );
    await expect(readMcpConfigFile(p)).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'TRANSPORT_FAILED' &&
        /entry "empty".*must specify either/.test(err.message)
    );
  });

  it('preserves disabled: true (skipping happens at extract time)', async () => {
    const p = writeConfig(
      JSON.stringify({
        mcpServers: {
          off: { command: 'node', args: ['./server.js'], disabled: true }
        }
      })
    );
    const entries = await readMcpConfigFile(p);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.name).toBe('off');
    expect(entry.disabled).toBe(true);
    expect(entry.transport).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['./server.js']
    });
  });

  it('throws when a per-field type is wrong (command as number)', async () => {
    const p = writeConfig(
      JSON.stringify({
        mcpServers: { bad: { command: 5 } }
      })
    );
    await expect(readMcpConfigFile(p)).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'TRANSPORT_FAILED' &&
        /entry "bad".command must be a string/.test(err.message)
    );
  });
});
