/**
 * Audit and Fix
 * Run the documentation audit on an ExtractedSkill and print actionable results.
 */

import { auditSkill, formatAuditText, parseReadme } from '@skillit/core';
import type { ExtractedSkill } from '@skillit/core';
import { readFileSync } from 'node:fs';

// Project metadata lives on the skill IR — the audit reads it directly.
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const readme = parseReadme(readFileSync('README.md', 'utf-8'));

// Run audit against an extracted skill carrying its project metadata
const skill: ExtractedSkill = {
  name: pkg.name,
  description: '',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: [],
  packageDescription: pkg.description,
  keywords: pkg.keywords,
  repository: pkg.repository?.url,
  readme
};

const result = auditSkill(skill);
console.log(formatAuditText(result));

// Check if CI should fail
if (result.summary.fatal > 0 || result.summary.error > 0) {
  process.exit(1);
}
