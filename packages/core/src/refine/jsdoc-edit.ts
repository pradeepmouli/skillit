// packages/core/src/refine/jsdoc-edit.ts
import type { RefineTag } from './types.js';
import { upsertJsDocTag } from './ast-edit.js';

/**
 * @deprecated internal alias — use {@link upsertJsDocTag}. Kept for callers/tests.
 *
 * @remarks
 * A thin pass-through to {@link upsertJsDocTag} with identical parameters and
 * behaviour; retained only so existing callers and tests that import the old
 * name keep compiling. New code should call {@link upsertJsDocTag} directly.
 */
export function insertJsDocTag(
  source: string,
  exportName: string,
  tag: RefineTag,
  content: string
): string {
  return upsertJsDocTag(source, exportName, tag, content);
}
