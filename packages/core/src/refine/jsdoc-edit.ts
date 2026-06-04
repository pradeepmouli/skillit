// packages/core/src/refine/jsdoc-edit.ts
import type { RefineTag } from './types.js';
import { upsertJsDocTag } from './ast-edit.js';

/** @deprecated internal alias — use upsertJsDocTag. Kept for callers/tests. */
export function insertJsDocTag(
  source: string,
  exportName: string,
  tag: RefineTag,
  content: string
): string {
  return upsertJsDocTag(source, exportName, tag, content);
}
