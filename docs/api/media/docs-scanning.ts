/**
 * Docs Scanning
 * Include prose documentation from a docs/ directory alongside API skills.
 */

import {
  scanDocs,
  scanRootDocs,
  docsToExtractedDocuments,
  renderSkill,
  writeSkills
} from '@skillit/core';
import type { ExtractedSkill } from '@skillit/core';

// Scan a docs/ directory — orders by sidebar_position frontmatter or filename prefix
const parsedDocs = scanDocs({
  docsDir: 'docs',
  exclude: ['**/api/**'], // skip auto-generated API docs
  maxDocs: 20
});

// Also scan well-known root files (ARCHITECTURE.md, MIGRATION.md, etc.)
const rootDocs = scanRootDocs('.');

// Convert to ExtractedDocument[] for the skill
const allDocs = docsToExtractedDocuments([...parsedDocs, ...rootDocs]);

// Attach to a skill
const skill: ExtractedSkill = {
  name: 'my-project',
  description: 'Project documentation',
  documents: allDocs,
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

const rendered = renderSkill(skill);
writeSkills([rendered], { outDir: 'skills' });

console.log(`Included ${allDocs.length} docs as reference files`);
