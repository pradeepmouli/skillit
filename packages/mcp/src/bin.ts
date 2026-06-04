#!/usr/bin/env node
/**
 * Executable entry point for `skillit-mcp`.
 *
 * Constructs the commander program and parses `process.argv`. Any thrown
 * error surfaces here — `McpError` instances map to deterministic exit codes
 * per the table below, generic `Error`s map to exit code 1, and unknown
 * throws map to exit code 1.
 *
 * Exit-code mapping (intentionally explicit — do not auto-derive from
 * {@link McpErrorCode} to keep the mapping decoupled from codepoints):
 *
 * | Code | Error codes |
 * | ---- | ----------- |
 * | 2    | LOCAL_IO_FAILED, TRANSPORT_FAILED, INITIALIZE_FAILED, PROTOCOL_VERSION_UNSUPPORTED |
 * | 3    | SCHEMA_REF_CYCLE, SERVER_EXITED_EARLY, AUDIT_FAILED |
 * | 4    | DUPLICATE_SKILL_NAME |
 * | 5    | ADAPTER_NOT_FOUND, UNKNOWN_TARGET, MISSING_LAUNCH_COMMAND |
 * | 130  | SIGINT / SIGTERM |
 *
 * @module bin
 */

import { buildProgram } from './cli.js';
import { reportMcpErrorAndExit } from './error-exit.js';

const program = buildProgram();

// SIGINT / SIGTERM handler. Exit 130 on Ctrl-C.
//
// We don't attempt graceful cleanup of the spawned child here because
// `finally` blocks do not run across `process.exit()`. Node's default
// behavior when the parent exits is to send SIGHUP to the child stdio
// transport, which is sufficient for the MVP. If finer control is needed
// later, refactor the extractor to use an `AbortController`.
let interrupted = false;
const onInterrupt = (): void => {
  if (interrupted) return; // ignore subsequent signals
  interrupted = true;
  process.stderr.write('\n[skillit-mcp] Interrupted. Cleaning up...\n');
  process.exit(130);
};
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onInterrupt);

program.parseAsync(process.argv).catch(reportMcpErrorAndExit);
