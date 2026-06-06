#!/usr/bin/env node
// packages/client/src/bin.ts
import { pathToFileURL } from 'node:url';
import { reportMcpErrorAndExit } from '@skillit/mcp';
import { buildProgram } from './program.js';

// Re-export the factory so `@skillit/cli`'s program loader can auto-discover
// the skillit program from this package's `bin` entry (it probes `buildProgram`
// / `createProgram` / `program` / `default`) when `skillit init/refine --source
// cli` is run without an explicit `--program`.
export { buildProgram };

// Only parse argv when this file is the executed entry — NOT when it is
// imported for introspection (auto-discovery does `import(bin)`). Parsing on
// import would consume `process.argv` and could exit the host process.
const argv1 = process.argv[1];
if (argv1 !== undefined && import.meta.url === pathToFileURL(argv1).href) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((err: unknown) => {
      // Preserve the mcp exit-code contract for the `skillit mcp …` path; other
      // errors keep the prior generic behavior (stderr message + exit 1).
      reportMcpErrorAndExit(err);
    });
}
