import { join } from 'node:path';
import { scanDocs, docsToExtractedDocuments } from '@skillit/core';
import type { ExtractedDocument } from '@skillit/core';
import { readCategoryLabels } from './category-reader.js';

export { readCategoryLabels } from './category-reader.js';
export type { CategoryMeta } from './category-reader.js';

export interface DocusaurusDocsOptions {
  /** Absolute path to the project root. Defaults to `process.cwd()`. */
  projectRoot?: string;
  /** Relative path (from projectRoot) to the docs directory. Defaults to `"docs"`. */
  docsDir?: string;
  /** When `true` (default), excludes the `api/` sub-directory from results. */
  excludeApi?: boolean;
  /** Maximum number of documents to return. Defaults to 20. */
  maxDocs?: number;
}

export function extractDocusaurusDocs(options: DocusaurusDocsOptions = {}): ExtractedDocument[] {
  const {
    projectRoot = process.cwd(),
    docsDir: docsDirOption = 'docs',
    excludeApi = true,
    maxDocs = 20
  } = options;

  // 1. Resolve absolute path to the docs directory
  const resolvedDocsDir = join(projectRoot, docsDirOption);

  // 2. Build exclude list
  const exclude: string[] = ['**/node_modules/**', '**/blog/**'];
  if (excludeApi) {
    exclude.push('**/api/**');
  }

  // 3. Read category labels (available for future enrichment)
  readCategoryLabels(resolvedDocsDir);

  // 4. Scan docs directory
  const docs = scanDocs({
    docsDir: resolvedDocsDir,
    include: undefined,
    exclude,
    maxDocs
  });

  // 5. Convert to ExtractedDocument[]
  return docsToExtractedDocuments(docs);
}
