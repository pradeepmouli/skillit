import { TypeScriptMcpRefineSource } from '../../src/refine/build/ts-mcp-source.js';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock extractMcpSkill so we don't need a live server for the unit test
vi.mock('../../src/extract.js', () => ({
  extractMcpSkill: vi.fn().mockResolvedValue({
    name: 'fixture',
    functions: [],
    packageDescription: '',
    examples: []
  })
}));

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('TypeScriptMcpRefineSource.applyFixes', () => {
  it('writes _meta.useWhen into a matching source file', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ts-mcp-src-'));
    const sourceFile = join(tmpDir, 'server.ts');
    await writeFile(
      sourceFile,
      `server.tool(\n  'list_dir',\n  { description: 'Lists a directory' },\n  schema,\n  handler\n);\n`
    );

    const source = new TypeScriptMcpRefineSource({
      transport: { type: 'stdio', command: 'node', args: ['never-runs.js'] },
      sourceGlob: join(tmpDir, '*.ts')
    });

    await source.applyFixes([
      { toolName: 'list_dir', tag: 'useWhen', value: 'When listing directory contents' }
    ]);

    const updated = await readFile(sourceFile, 'utf8');
    expect(updated).toContain("useWhen: 'When listing directory contents'");
  });

  it('applies two fixes targeting the same file correctly', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ts-mcp-src-'));
    const sourceFile = join(tmpDir, 'server.ts');
    await writeFile(
      sourceFile,
      [
        `server.tool(`,
        `  'list_dir',`,
        `  { description: 'Lists a directory' },`,
        `  schema, handler`,
        `);`,
        `server.tool(`,
        `  'read_file',`,
        `  { description: 'Reads a file' },`,
        `  schema, handler`,
        `);`
      ].join('\n') + '\n'
    );

    const source = new TypeScriptMcpRefineSource({
      transport: { type: 'stdio', command: 'node', args: ['never-runs.js'] },
      sourceGlob: join(tmpDir, '*.ts')
    });

    await source.applyFixes([
      { toolName: 'list_dir', tag: 'useWhen', value: 'Listing contents' },
      { toolName: 'read_file', tag: 'useWhen', value: 'Reading a file' }
    ]);

    const updated = await readFile(sourceFile, 'utf8');
    expect(updated).toContain("useWhen: 'Listing contents'");
    expect(updated).toContain("useWhen: 'Reading a file'");
  });

  it('skips a tool name that appears in multiple source files', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ts-mcp-src-'));
    const fileA = join(tmpDir, 'server-a.ts');
    const fileB = join(tmpDir, 'server-b.ts');
    const toolDecl = `server.tool(\n  'shared_tool',\n  { description: 'dup' },\n  schema,\n  handler\n);\n`;
    await writeFile(fileA, toolDecl);
    await writeFile(fileB, toolDecl);

    const source = new TypeScriptMcpRefineSource({
      transport: { type: 'stdio', command: 'node', args: ['never-runs.js'] },
      sourceGlob: join(tmpDir, '*.ts')
    });

    await source.applyFixes([{ toolName: 'shared_tool', tag: 'useWhen', value: 'x' }]);

    // Neither file should be modified — the tool is ambiguous
    const contentsA = await readFile(fileA, 'utf8');
    const contentsB = await readFile(fileB, 'utf8');
    expect(contentsA).toBe(toolDecl);
    expect(contentsB).toBe(toolDecl);
  });

  it('does not modify files when tool not found', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ts-mcp-src-'));
    const sourceFile = join(tmpDir, 'server.ts');
    const original = `server.tool(\n  'other_tool',\n  { description: 'other' },\n  schema,\n  handler\n);\n`;
    await writeFile(sourceFile, original);

    const source = new TypeScriptMcpRefineSource({
      transport: { type: 'stdio', command: 'node', args: ['never-runs.js'] },
      sourceGlob: join(tmpDir, '*.ts')
    });

    await source.applyFixes([{ toolName: 'missing_tool', tag: 'useWhen', value: 'x' }]);

    const unchanged = await readFile(sourceFile, 'utf8');
    expect(unchanged).toBe(original);
  });
});
