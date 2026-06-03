// packages/core/src/refine/jsdoc-edit.ts
import type { RefineTag } from './types.js';
import { upsertJsDocTag } from './ast-edit.js';

export function insertJsDocTag(
  source: string,
  exportName: string,
  tag: RefineTag,
  content: string
): string {
  return upsertJsDocTag(source, exportName, tag, content);
}
