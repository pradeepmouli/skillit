import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application, Converter, type Context, ParameterType } from 'typedoc';
import type { ExtractedSkill } from '@skillit/core';
import {
  renderSkills,
  writeSkills,
  renderLlmsTxt,
  auditSkill,
  formatAuditText,
  formatAuditJson,
  parseReadme,
  scanDocs,
  docsToExtractedDocuments,
  estimateSkillJudgeScore,
  formatScoreEstimate
} from '@skillit/core';
import type { AuditContext } from '@skillit/core';
import { extractSkills } from './extractor.js';

/**
 * Configuration options for typedoc-plugin-skillit.
 *
 * @config
 *
 * @example
 * ```json
 * // typedoc.json
 * {
 *   "plugin": ["typedoc-plugin-skillit"],
 *   "skillsOutDir": "skills",
 *   "skillsPerPackage": true,
 *   "skillsAudit": true,
 *   "skillsMaxTokens": 4000,
 *   "llmsTxt": true
 * }
 * ```
 */
export interface SkillsPluginOptions {
  /** Output directory for generated skill files
   * @defaultValue "skills"
   */
  skillsOutDir?: string;

  /** Agent discovery directories to install generated skills into
   * @defaultValue []
   */
  skillsInstallTargets?: string[];

  /** Emit one skill per package in a monorepo
   * @defaultValue true
   * @useWhen
   * - Your project is a monorepo with multiple packages
   * @avoidWhen
   * - Single-package project — leave as default
   */
  skillsPerPackage?: boolean;

  /** Include usage examples from @example tags
   * @defaultValue true
   */
  skillsIncludeExamples?: boolean;

  /** Include type signatures in skill output
   * @defaultValue true
   */
  skillsIncludeSignatures?: boolean;

  /** Maximum approximate token budget per skill file
   * @defaultValue 4000
   * @never
   * - NEVER set below 500 — reference files become truncated mid-signature, producing broken code blocks
   */
  skillsMaxTokens?: number;

  /** Custom prefix for skill names
   * @defaultValue ""
   */
  skillsNamePrefix?: string;

  /** License for generated skills (reads from package.json if empty)
   * @defaultValue ""
   */
  skillsLicense?: string;

  /** Generate llms.txt and llms-full.txt alongside skills
   * @defaultValue false
   * @useWhen
   * - You want LLM-friendly API documentation following the llmstxt.org spec
   */
  llmsTxt?: boolean;

  /** Output directory for llms.txt files
   * @defaultValue "."
   */
  llmsTxtOutDir?: string;

  /** Run documentation audit during skill generation
   * @defaultValue true
   * @useWhen
   * - You want feedback on JSDoc quality during typedoc build
   * @avoidWhen
   * - You find audit output noisy during rapid iteration — disable temporarily
   */
  skillsAudit?: boolean;

  /** Fail build on fatal or error severity audit issues
   * @defaultValue false
   * @useWhen
   * - CI enforcement — block PRs with undocumented exports
   * @avoidWhen
   * - Rapid local iteration where you still want SKILL.md output even if the audit is incomplete
   */
  skillsAuditFailOnError?: boolean;

  /** Path to write JSON audit report (empty = don't write)
   * @defaultValue ""
   */
  skillsAuditJson?: string;

  /** Include prose docs from docs/ directory alongside API skills
   * @defaultValue false
   * @useWhen
   * - You have hand-written docs in a docs/ directory (tutorials, guides, architecture)
   */
  skillsIncludeDocs?: boolean;

  /** Directory containing prose documentation
   * @defaultValue "docs"
   */
  skillsDocsDir?: string;
}

export function load(app: Application): void {
  // --- Options ---

  app.options.addDeclaration({
    name: 'skillsOutDir',
    help: '[Skills] Output directory for generated skill files',
    type: ParameterType.String,
    defaultValue: 'skills'
  });

  app.options.addDeclaration({
    name: 'skillsInstallTargets',
    help: '[Skills] Agent discovery directories to install generated skills into',
    type: ParameterType.Array,
    defaultValue: []
  });

  app.options.addDeclaration({
    name: 'skillsPerPackage',
    help: '[Skills] Emit one skill per package in a monorepo',
    type: ParameterType.Boolean,
    defaultValue: true
  });

  app.options.addDeclaration({
    name: 'skillsIncludeExamples',
    help: '[Skills] Include usage examples from @example tags',
    type: ParameterType.Boolean,
    defaultValue: true
  });

  app.options.addDeclaration({
    name: 'skillsIncludeSignatures',
    help: '[Skills] Include type signatures in skill output',
    type: ParameterType.Boolean,
    defaultValue: true
  });

  app.options.addDeclaration({
    name: 'skillsMaxTokens',
    help: '[Skills] Maximum approximate token budget per skill file',
    type: ParameterType.Number,
    defaultValue: 4000
  });

  app.options.addDeclaration({
    name: 'skillsNamePrefix',
    help: '[Skills] Custom skill name prefix (default: package name)',
    type: ParameterType.String,
    defaultValue: ''
  });

  app.options.addDeclaration({
    name: 'skillsLicense',
    help: '[Skills] License for generated skills (default: read from package.json)',
    type: ParameterType.String,
    defaultValue: ''
  });

  app.options.addDeclaration({
    name: 'llmsTxt',
    help: '[Skills] Generate llms.txt and llms-full.txt alongside skills',
    type: ParameterType.Boolean,
    defaultValue: false
  });

  app.options.addDeclaration({
    name: 'llmsTxtOutDir',
    help: '[Skills] Output directory for llms.txt files (default: repo root)',
    type: ParameterType.String,
    defaultValue: '.'
  });

  app.options.addDeclaration({
    name: 'skillsAudit',
    help: '[Skills] Run documentation audit during skill generation',
    type: ParameterType.Boolean,
    defaultValue: true
  });

  app.options.addDeclaration({
    name: 'skillsAuditFailOnError',
    help: '[Skills] Fail build on fatal or error severity audit issues',
    type: ParameterType.Boolean,
    defaultValue: false
  });

  app.options.addDeclaration({
    name: 'skillsAuditJson',
    help: "[Skills] Path to write JSON audit report (empty = don't write)",
    type: ParameterType.String,
    defaultValue: ''
  });

  app.options.addDeclaration({
    name: 'skillsIncludeDocs',
    help: '[Skills] Include prose docs from docs/ directory alongside API skills',
    type: ParameterType.Boolean,
    defaultValue: false
  });

  app.options.addDeclaration({
    name: 'skillsDocsDir',
    help: '[Skills] Directory containing prose documentation (default: docs)',
    type: ParameterType.String,
    defaultValue: 'docs'
  });

  // --- Auto-register custom tags ---
  // Ensure @useWhen, @avoidWhen, @never, @config are in blockTags (not modifierTags).
  // Runs at EVENT_BEGIN — after user's typedoc.json is read, before parsing starts.
  const CUSTOM_BLOCK_TAGS = ['@useWhen', '@avoidWhen', '@never', '@config'];
  app.converter.on(Converter.EVENT_BEGIN, () => {
    const blockTags = app.options.getValue('blockTags') as string[];
    const modifierTags = app.options.getValue('modifierTags') as string[];

    // Add to blockTags if missing
    const missing = CUSTOM_BLOCK_TAGS.filter((t) => !blockTags.includes(t));
    if (missing.length > 0) {
      app.options.setValue('blockTags', [...blockTags, ...missing]);
    }

    // Remove from modifierTags — being in modifierTags silently strips content
    const misplaced = CUSTOM_BLOCK_TAGS.filter((t) => modifierTags.includes(t));
    if (misplaced.length > 0) {
      app.logger.warn(
        `[skills] Moved ${misplaced.join(', ')} from modifierTags to blockTags — ` +
          `modifierTags strips tag content, which prevents skill generation from reading it`
      );
      app.options.setValue(
        'modifierTags',
        modifierTags.filter((t) => !CUSTOM_BLOCK_TAGS.includes(t))
      );
    }
  });

  // --- State ---
  // Accumulate skills across converter runs for llms.txt (project-wide).
  // Skills files are written immediately per converter run (per-package scope).
  const allSkills: ExtractedSkill[] = [];
  const pkg = readPackageJson();
  const workspacePackages = getWorkspacePackageNames(pkg.name);
  let bundledGuidanceWritten = false;

  // --- Per-package: extract + write skills immediately ---
  app.converter.on(Converter.EVENT_RESOLVE_END, (context: Context) => {
    const project = context.project;
    const perPackage = app.options.getValue('skillsPerPackage') as boolean;
    const outDir = app.options.getValue('skillsOutDir') as string;
    const license = (app.options.getValue('skillsLicense') as string) || pkg.license || '';

    // Resolve per-package metadata: try package-specific package.json first,
    // fall back to root. This matters for entryPointStrategy: "packages" where
    // each converter run is a different workspace package.
    const perPkgJson = readPackageJsonForProject(project.name) ?? pkg;
    const skills = extractSkills(project, perPackage, {
      name: perPkgJson.name || pkg.name,
      description: perPkgJson.description || pkg.description,
      keywords: perPkgJson.keywords || pkg.keywords,
      repository: normalizeRepoUrl(perPkgJson.repository) || normalizeRepoUrl(pkg.repository),
      author:
        typeof perPkgJson.author === 'string'
          ? perPkgJson.author
          : perPkgJson.author?.name ||
            (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name)
    });

    // --- Docs scanning (opt-in) ---
    const includeDocs = app.options.getValue('skillsIncludeDocs') as boolean;
    if (includeDocs) {
      const docsDir = app.options.getValue('skillsDocsDir') as string;
      const fullDocsDir = join(process.cwd(), docsDir);
      if (existsSync(fullDocsDir)) {
        const parsedDocs = scanDocs({
          docsDir: fullDocsDir,
          include: undefined,
          exclude: ['**/api/**', '**/node_modules/**'],
          maxDocs: undefined
        });
        const extractedDocs = docsToExtractedDocuments(parsedDocs);
        for (const skill of skills) {
          skill.documents = [...(skill.documents ?? []), ...extractedDocs];
        }
        app.logger.info(`[skills] Included ${extractedDocs.length} docs from ${docsDir}/`);
      }
    }

    // --- README parsing — per-skill resolution for "resolve" strategy ---
    // With entryPointStrategy: "resolve", all packages share one converter run,
    // so we resolve the README per-skill by matching skill.name to a package directory.
    // Falls back to the project-level README for single-package projects.
    const resolveReadmeForSkill = (skillName: string) => {
      const content = readReadmeForProject(skillName) ?? readReadmeFile();
      return content ? parseReadme(content) : undefined;
    };

    for (const skill of skills) {
      // Per-skill package.json — override root metadata with per-package values
      const skillPkg = readPackageJsonForProject(skill.name);
      if (skillPkg) {
        if (skillPkg.description) skill.packageDescription = skillPkg.description;
        if (skillPkg.keywords) skill.keywords = skillPkg.keywords;
      }

      const readme = resolveReadmeForSkill(skill.name);
      if (readme?.quickStart && skill.examples.length === 0) {
        skill.examples.push(readme.quickStart);
      }
      if (readme?.features) skill.readmeFeatures ??= readme.features;
      if (readme?.troubleshooting) skill.readmeTroubleshooting ??= readme.troubleshooting;
    }

    // Accumulate for llms.txt
    allSkills.push(...skills);

    // Render and write this package's skills immediately
    // Each skill writes to skills/<package-name>/ — doesn't touch other packages
    const rendered = renderSkills(skills, {
      outDir,
      includeExamples: app.options.getValue('skillsIncludeExamples') as boolean,
      includeSignatures: app.options.getValue('skillsIncludeSignatures') as boolean,
      maxTokens: app.options.getValue('skillsMaxTokens') as number,
      namePrefix: app.options.getValue('skillsNamePrefix') as string,
      license
    });
    const installTargets = app.options.getValue('skillsInstallTargets') as string[];
    writeSkills(rendered, { outDir, installTargets });
    if (installTargets.length > 0 && !bundledGuidanceWritten) {
      writeSkills([loadBundledTypeDocGuidanceSkill()], {
        outDir,
        installTargets,
        includeOutDir: false
      });
      bundledGuidanceWritten = true;
    }

    for (const skill of rendered) {
      const st = skill.skill.tokens ? ` (~${skill.skill.tokens} tokens)` : '';
      app.logger.info(`[skills] ${skill.skill.filename}${st}`);
      for (const ref of skill.references) {
        const rt = ref.tokens ? ` (~${ref.tokens} tokens)` : '';
        app.logger.info(`[skills]   └─ ${ref.filename}${rt}`);
      }
    }

    // --- Audit ---
    const auditEnabled = app.options.getValue('skillsAudit') as boolean;
    if (auditEnabled) {
      for (const skill of skills) {
        // Only audit first-party workspace packages — skip third-party deps
        // that TypeDoc happens to process (e.g. vscode-jsonrpc in lspeasy)
        if (workspacePackages.size > 0 && !workspacePackages.has(skill.name)) {
          continue;
        }

        // Resolve README per-skill for audit context (same as enrichment above)
        const auditReadme = resolveReadmeForSkill(skill.name);
        const auditContext: AuditContext = {
          packageDescription: pkg.description,
          keywords: pkg.keywords,
          repository: normalizeRepoUrl(pkg.repository),
          readme: auditReadme
        };

        const auditResult = auditSkill(skill, auditContext);
        const text = formatAuditText(auditResult);

        // Log each line with appropriate severity
        for (const line of text.split('\n')) {
          if (line.includes('FATAL') || line.includes('ERROR')) {
            app.logger.warn(line);
          } else if (line.trim()) {
            app.logger.info(line);
          }
        }

        // Log skill-judge score estimate
        const estimate = estimateSkillJudgeScore(auditResult, skill);
        const scoreText = formatScoreEstimate(estimate);
        for (const line of scoreText.split('\n')) {
          if (line.trim()) app.logger.info(line);
        }

        // Write JSON report if configured
        const jsonPath = app.options.getValue('skillsAuditJson') as string;
        if (jsonPath) {
          writeFileSync(jsonPath, formatAuditJson(auditResult), 'utf-8');
          app.logger.info(`[audit] JSON report written to ${jsonPath}`);
        }

        // Fail build if configured and there are fatal/error issues
        const failOnError = app.options.getValue('skillsAuditFailOnError') as boolean;
        if (failOnError && (auditResult.summary.fatal > 0 || auditResult.summary.error > 0)) {
          app.logger.error(
            `[audit] Build failed: ${auditResult.summary.fatal} fatal, ${auditResult.summary.error} error issues found`
          );
        }
      }
    }
  });

  // --- Project-wide: write llms.txt once after all packages ---
  app.renderer.postRenderAsyncJobs.push(async () => {
    const llmsEnabled = app.options.getValue('llmsTxt') as boolean;
    if (!llmsEnabled || allSkills.length === 0) return;

    const llmsOutDir = app.options.getValue('llmsTxtOutDir') as string;
    const result = renderLlmsTxt(allSkills, {
      projectName: pkg.name || 'project',
      projectDescription: pkg.description || ''
    });

    mkdirSync(llmsOutDir, { recursive: true });

    const summaryPath = join(llmsOutDir, 'llms.txt');
    writeFileSync(summaryPath, result.summary, 'utf-8');
    app.logger.info(`[llms-txt] ${summaryPath} (~${result.summaryTokens} tokens)`);

    const fullPath = join(llmsOutDir, 'llms-full.txt');
    writeFileSync(fullPath, result.full, 'utf-8');
    app.logger.info(`[llms-txt] ${fullPath} (~${result.fullTokens} tokens)`);
  });
}

interface PackageJson {
  name?: string;
  description?: string;
  license?: string;
  keywords?: string[];
  repository?: string | { type?: string; url?: string };
  author?: string | { name?: string };
}

function readPackageJson(): PackageJson {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf-8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return {};
  }
}

function loadBundledTypeDocGuidanceSkill() {
  const skillPath = fileURLToPath(new URL('../skills/to-skills-docs/SKILL.md', import.meta.url));
  let content: string;
  try {
    content = readFileSync(skillPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read bundled TypeDoc guidance from ${skillPath}: ${messageOf(error)}`,
      {
        cause: error
      }
    );
  }
  return {
    skill: {
      filename: 'to-skills-docs/SKILL.md',
      content
    },
    references: []
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Try to find a workspace package's package.json by matching project name. */
function readPackageJsonForProject(projectName: string): PackageJson | null {
  const packagesDir = join(process.cwd(), 'packages');
  if (!existsSync(packagesDir)) return null;

  try {
    const dirs = readdirSync(packagesDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const pkgPath = join(packagesDir, dir.name, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const p = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson;
          if (p.name === projectName) return p;
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }

  return null;
}

function normalizeRepoUrl(repo: PackageJson['repository']): string | undefined {
  if (!repo) return undefined;
  if (typeof repo === 'string') return repo;
  const url = repo.url;
  if (!url) return undefined;
  return url.replace(/^git\+/, '').replace(/\.git$/, '');
}

/**
 * Scan packages/* /package.json to build the set of first-party workspace package names.
 * Used to scope audits to first-party code only — avoids auditing third-party deps
 * that TypeDoc processes in monorepo entryPointStrategy: "packages" setups.
 * Returns empty set for single-package projects (audit everything).
 */
function getWorkspacePackageNames(rootName?: string): Set<string> {
  const names = new Set<string>();

  // Add root package name
  if (rootName) names.add(rootName);

  // Scan packages/*/package.json
  const packagesDir = join(process.cwd(), 'packages');
  if (!existsSync(packagesDir)) return names;

  try {
    const dirs = readdirSync(packagesDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const pkgPath = join(packagesDir, dir.name, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const p = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string };
          if (p.name) names.add(p.name);
        } catch {
          // skip parse errors
        }
      }
    }
  } catch {
    // skip read errors
  }

  return names;
}

/** Read the root README.md */
function readReadmeFile(): string | undefined {
  return readReadmeAt(process.cwd());
}

/** Try to find a README in the workspace package directory matching projectName */
function readReadmeForProject(projectName: string): string | undefined {
  const packagesDir = join(process.cwd(), 'packages');
  if (!existsSync(packagesDir)) return undefined;

  try {
    const dirs = readdirSync(packagesDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const pkgPath = join(packagesDir, dir.name, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const p = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson;
          if (p.name === projectName) {
            return readReadmeAt(join(packagesDir, dir.name));
          }
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }

  return undefined;
}

function readReadmeAt(dir: string): string | undefined {
  const names = ['README.md', 'readme.md', 'Readme.md'];
  for (const name of names) {
    const readmePath = join(dir, name);
    if (existsSync(readmePath)) {
      try {
        return readFileSync(readmePath, 'utf-8');
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
