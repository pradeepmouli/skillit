export type McpErrorCode =
  | 'UNKNOWN_TARGET'
  | 'ADAPTER_NOT_FOUND'
  | 'LOCAL_IO_FAILED'
  | 'TRANSPORT_FAILED'
  | 'INITIALIZE_FAILED'
  | 'PROTOCOL_VERSION_UNSUPPORTED'
  | 'SCHEMA_REF_CYCLE'
  | 'SERVER_EXITED_EARLY'
  | 'MISSING_LAUNCH_COMMAND'
  | 'DUPLICATE_SKILL_NAME'
  /**
   * Audit produced ≥1 fatal/error severity issue and `--skip-audit` was not
   * set. The bundle still wrote successful skills; this code triggers the
   * non-zero exit alongside any sibling failures so CI catches the bad
   * output. Lives between SCHEMA_REF_CYCLE and DUPLICATE_SKILL_NAME in the
   * worst-code hierarchy — see `pickWorstCode` and `bin.ts`.
   */
  | 'AUDIT_FAILED';

/**
 * Base error for all @to-skills/mcp failures.
 * The `code` field distinguishes recoverable (user-correctable) from environmental errors.
 */
export class McpError extends Error {
  readonly code: McpErrorCode;

  constructor(message: string, code: McpErrorCode, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'McpError';
    this.code = code;
    // Preserve stack trace where supported.
    if ('captureStackTrace' in Error && typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, McpError);
    }
  }
}
