#!/usr/bin/env node
// packages/client/src/bin.ts
import { reportMcpErrorAndExit } from '@skillit/mcp';
import { buildProgram } from './program.js';

buildProgram()
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    // Preserve the mcp exit-code contract for the `skillit mcp …` path; other
    // errors keep the prior generic behavior (stderr message + exit 1).
    reportMcpErrorAndExit(err);
  });
