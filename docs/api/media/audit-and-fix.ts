/**
 * Audit and Fix
 * Run the documentation audit on an ExtractedSkill and print actionable results.
 */

import { auditSkill, formatAuditText, parseReadme } from '@skillit/core';
import type { ExtractedSkill, AuditContext } from '@skillit/core';
import { readFileSync } from 'node:fs';

// Build audit context from your project's package.json and README
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const readme = parseReadme(readFileSync('README.md', 'utf-8'));

const context: AuditContext = {
  packageDescription: pkg.description,
  keywords: pkg.keywords,
  repository: pkg.repository?.url,
  readme
};

// Run audit against an extracted skill
const skill: ExtractedSkill = {
  name: pkg.name,
  description: '',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

const result = auditSkill(skill, context);
console.log(formatAuditText(result));

// Check if CI should fail
if (result.summary.fatal > 0 || result.summary.error > 0) {
  process.exit(1);
}
