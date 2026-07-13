import { readJsDocTags, type RefineTag } from '@skillit/core';

/**
 * Reads routing tags (`@useWhen`/`@avoidWhen`/`@never`/`@remarks`/`@example`)
 * from the JSDoc attached to a `<Command>Options` interface.
 *
 * Thin wrapper over core's {@link readJsDocTags} that keeps the CLI package's
 * call-site intent explicit and provides a seam for CLI-specific behavior.
 */
export function readOptionsTags(
  interfaceName: string,
  source: string
): Partial<Record<RefineTag, string>> {
  return readJsDocTags(source, interfaceName);
}
