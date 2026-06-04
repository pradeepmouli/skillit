// packages/mcp/src/error-exit.ts
import { McpError } from './errors.js';

// Exit-code mapping (intentionally explicit — see contracts/package-json-config.md).
const ERROR_EXIT_CODES: Record<string, number> = {
  LOCAL_IO_FAILED: 2,
  TRANSPORT_FAILED: 2,
  INITIALIZE_FAILED: 2,
  PROTOCOL_VERSION_UNSUPPORTED: 2,
  SCHEMA_REF_CYCLE: 3,
  SERVER_EXITED_EARLY: 3,
  AUDIT_FAILED: 3,
  DUPLICATE_SKILL_NAME: 4,
  MISSING_LAUNCH_COMMAND: 5,
  ADAPTER_NOT_FOUND: 5,
  UNKNOWN_TARGET: 5
};

/** Map a thrown value to the deterministic process exit code (1 for non-McpError). */
export function mcpErrorExitCode(err: unknown): number {
  if (err instanceof McpError) return ERROR_EXIT_CODES[err.code] ?? 1;
  return 1;
}

/** Write the standard stderr report for a thrown value and exit with its mapped code. */
export function reportMcpErrorAndExit(err: unknown): never {
  if (err instanceof McpError) {
    process.stderr.write(`Error [${err.code}]: ${err.message}\n`);
    if (err.cause instanceof Error) {
      process.stderr.write(`  Caused by: ${err.cause.message}\n`);
    }
    process.exit(mcpErrorExitCode(err));
  }
  if (err instanceof Error) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`Unknown error: ${String(err)}\n`);
  process.exit(1);
}
