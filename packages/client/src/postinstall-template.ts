export function generatePostinstallScript(): string {
  return `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
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

function rewrite(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewrite(full);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = fs.readFileSync(full, 'utf8');
      const updated = content.replaceAll(npxPrefix, binName);
      if (updated !== content) fs.writeFileSync(full, updated, 'utf8');
    }
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

rewrite(skillsDir);

const installTargets = [
  path.join(os.homedir(), '.claude', 'skills'),
  path.join(os.homedir(), '.copilot', 'skills'),
  path.join(os.homedir(), '.agents', 'skills')
];

for (const userSkillsDir of installTargets) {
  try {
    fs.mkdirSync(userSkillsDir, { recursive: true });
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDir(path.join(skillsDir, entry.name), path.join(userSkillsDir, entry.name));
    }
    console.log('[skillit] Skills installed to ' + userSkillsDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[skillit] Could not install skills to ' + userSkillsDir + ': ' + message);
  }
}
`;
}
