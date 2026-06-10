export function generatePostinstallScript(): string {
  return `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const pkgName = pkg.name;
const binMap = pkg.bin;
if (!pkgName || !binMap || typeof binMap !== 'object' || Object.keys(binMap).length === 0) {
  process.exit(0);
}
const binName = Object.keys(binMap)[0];
const npxPrefix = 'npx ' + pkgName;

const skillsDir = path.join(__dirname, 'skills');
if (!fs.existsSync(skillsDir)) process.exit(0);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = fs.readFileSync(full, 'utf8');
      const updated = content.replaceAll(npxPrefix, binName);
      if (updated !== content) fs.writeFileSync(full, updated, 'utf8');
    }
  }
}

walk(skillsDir);
`;
}
