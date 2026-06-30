import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  renderSkills,
  writeSkills,
  type ExtractedSkill,
  type ExtractedConfigSurface,
  type RenderedSkill,
  type SkillRenderOptions,
  type SkillWriteOptions
} from '@skillit/core';
import { introspectCommander } from './introspect-commander.js';
import { parseHelpOutput } from './help-parser.js';
import { correlateFlags } from './correlator.js';
import { runCliAudit } from './audit.js';
import { interfaceNameCandidates, readSources, readTagsAcross } from './source-scan.js';

export interface CliExtractionOptions {
  /** Commander program object (preferred) */
  program?: any;
  /** Help text per command (fallback) */
  helpTexts?: Record<string, string>;
  /** Package metadata */
  metadata?: {
    name?: string;
    description?: string;
    keywords?: string[];
    repository?: string;
    author?: string;
  };
  /**
   * Config surfaces from TypeDoc for JSDoc correlation.
   *
   * Supply these when you have already run a TypeDoc pass and want to thread
   * the extracted config-surface metadata (e.g. `@never`, `@useWhen`,
   * `@avoidWhen`) into the skill.  Mutually exclusive with `sourceGlob` —
   * when both are provided, `configSurfaces` takes precedence and
   * `sourceGlob` is ignored.
   */
  configSurfaces?: ExtractedConfigSurface[];
  /**
   * Glob pattern for the TypeScript source files that declare typed option
   * interfaces (e.g. `"src/**\/*.ts"`).
   *
   * When provided and `configSurfaces` is not supplied, `extractCliSkill`
   * automatically scans the matching files for JSDoc block tags
   * (`@useWhen`, `@avoidWhen`, `@never`/`@pitfalls`, `@remarks`, `@example`)
   * on `<Command>Options` / `<Command>Opts` / `<Command>CommandOpts`
   * interfaces and correlates them into the generated skill — without
   * requiring a separate TypeDoc pass.
   *
   * @example "src/**\/*.ts"
   */
  sourceGlob?: string;
}

export interface CliWriteOptions
  extends
    SkillWriteOptions,
    Partial<
      Pick<
        SkillRenderOptions,
        'includeExamples' | 'includeSignatures' | 'maxTokens' | 'namePrefix' | 'license'
      >
    > {}

/**
 * Extract a structured skill from a CLI program.
 *
 * Runs the three-phase pipeline: introspect (or parse help) → correlate with typed interfaces → produce ExtractedSkill.
 *
 * @category Extraction
 * @useWhen
 * - You have a Commander program and want to generate a skill from its command structure
 * - You have raw --help output and no runtime access to the program object
 * @avoidWhen
 * - Your CLI is built with a framework other than Commander — use parseHelpOutput directly instead
 * @never
 * - NEVER pass both `program` and `helpTexts` — program takes precedence and helpTexts is silently ignored
 * - NEVER omit both `configSurfaces` and `sourceGlob` when your commands have typed option interfaces — JSDoc metadata (@never/@useWhen/@avoidWhen) will not be correlated and the generated skill will be missing its guidance sections
 */
export async function extractCliSkill(options: CliExtractionOptions): Promise<ExtractedSkill> {
  const { program, helpTexts, metadata = {}, sourceGlob } = options;
  let configSurfaces = options.configSurfaces ?? [];

  // Extract command structure (introspection or help)
  let cliSurfaces: ExtractedConfigSurface[] = [];

  if (program !== undefined) {
    cliSurfaces = introspectCommander(program);
  } else if (helpTexts !== undefined) {
    cliSurfaces = Object.entries(helpTexts).map(([commandName, text]) =>
      parseHelpOutput(text, commandName)
    );
  }

  // Auto-scan source files for JSDoc tags when sourceGlob is provided but
  // explicit configSurfaces were not. Reads @useWhen/@avoidWhen/@never/@remarks
  // from <Command>Options / <Command>Opts / <Command>CommandOpts interfaces
  // without requiring a TypeDoc pass.
  if (sourceGlob !== undefined && options.configSurfaces === undefined && cliSurfaces.length > 0) {
    const sources = await readSources(sourceGlob);
    const autoSurfaces: ExtractedConfigSurface[] = [];
    for (const cliSurface of cliSurfaces) {
      const candidates = interfaceNameCandidates(cliSurface.name);
      const tags = readTagsAcross(candidates, sources);
      if (Object.keys(tags).length === 0) continue;

      const autoSurface: ExtractedConfigSurface = {
        name: cliSurface.name,
        description: '',
        sourceType: 'cli',
        options: []
      };
      if (tags['useWhen'] !== undefined) autoSurface.useWhen = [tags['useWhen']];
      if (tags['avoidWhen'] !== undefined) autoSurface.avoidWhen = [tags['avoidWhen']];
      if (tags['pitfalls'] !== undefined) autoSurface.pitfalls = [tags['pitfalls']];
      if (tags['remarks'] !== undefined) autoSurface.remarks = tags['remarks'];
      if (tags['example'] !== undefined) autoSurface.usage = tags['example'];
      autoSurfaces.push(autoSurface);
    }
    configSurfaces = autoSurfaces;
  }

  // Warn when CLI surfaces were extracted but no JSDoc correlation source was
  // provided. The generated skill will be missing its NEVER/useWhen sections
  // if typed option interfaces carry those tags.
  if (
    cliSurfaces.length > 0 &&
    options.configSurfaces === undefined &&
    options.sourceGlob === undefined
  ) {
    process.stderr.write(
      '[skillit] extractCliSkill: no JSDoc correlation source provided — ' +
        '@never/@useWhen/@avoidWhen from typed option interfaces will not appear in the generated skill. ' +
        'Pass `sourceGlob` (e.g. "src/**/*.ts") to auto-detect, or supply `configSurfaces` manually.\n'
    );
  }

  // Correlate with typed interfaces
  // Build lookup from config surfaces by their name (case-insensitive)
  const configSurfaceLookup = new Map<string, ExtractedConfigSurface>();
  for (const surface of configSurfaces) {
    configSurfaceLookup.set(surface.name.toLowerCase(), surface);
  }

  // For each CLI surface, find a matching config surface by convention:
  // command "generate" → look for "GenerateOptions" or "generateoptions" (case-insensitive)
  const correlatedCliSurfaces: ExtractedConfigSurface[] = cliSurfaces.map((cliSurface) => {
    const commandNameLower = cliSurface.name.toLowerCase();

    // Try exact name match first
    let matchingConfig = configSurfaceLookup.get(commandNameLower);

    // If not found, try "<commandName>options" convention
    if (!matchingConfig) {
      matchingConfig = configSurfaceLookup.get(`${commandNameLower}options`);
    }

    // Call correlateFlags to merge JSDoc
    return correlateFlags(cliSurface, matchingConfig);
  });

  // Collect non-CLI config surfaces (sourceType === 'config') from configSurfaces
  const nonCliConfigSurfaces = configSurfaces.filter((s) => s.sourceType !== 'cli');

  // Build the final configSurfaces array: correlated CLI surfaces + non-CLI config surfaces
  const allConfigSurfaces: ExtractedConfigSurface[] = [
    ...correlatedCliSurfaces,
    ...nonCliConfigSurfaces
  ];

  // Build ExtractedSkill with empty functions/classes/types/enums/variables
  // but populated configSurfaces
  const skillWithoutAudit: ExtractedSkill = {
    name: metadata.name ?? '',
    description: metadata.description ?? '',
    keywords: metadata.keywords,
    repository: metadata.repository,
    author: metadata.author,
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    ...(allConfigSurfaces.length > 0 ? { configSurfaces: allConfigSurfaces } : {})
  };
  const auditIssues = runCliAudit(skillWithoutAudit);

  return {
    ...skillWithoutAudit,
    audit: { status: 'completed', issues: auditIssues },
    auditIssues
  };
}

export function writeCliSkill(skill: ExtractedSkill, options: CliWriteOptions) {
  const renderedSkills = renderSkills([skill], {
    outDir: options.outDir,
    ...(options.includeExamples !== undefined ? { includeExamples: options.includeExamples } : {}),
    ...(options.includeSignatures !== undefined
      ? { includeSignatures: options.includeSignatures }
      : {}),
    ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    ...(options.namePrefix !== undefined ? { namePrefix: options.namePrefix } : {}),
    ...(options.license !== undefined ? { license: options.license } : {})
  });
  const installTargets = options.installTargets ?? [];
  const results = writeSkills(renderedSkills, {
    outDir: options.outDir,
    installTargets,
    ...(options.includeOutDir !== undefined ? { includeOutDir: options.includeOutDir } : {})
  });

  if (installTargets.length === 0) {
    return results;
  }

  return [
    ...results,
    ...writeSkills([loadBundledCliGuidanceSkill()], {
      outDir: options.outDir,
      installTargets,
      includeOutDir: false
    })
  ];
}

function loadBundledCliGuidanceSkill(): RenderedSkill {
  const skillPath = fileURLToPath(new URL('../skills/skillit-cli-docs/SKILL.md', import.meta.url));
  let content: string;
  try {
    content = readFileSync(skillPath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read bundled CLI guidance from ${skillPath}: ${messageOf(error)}`, {
      cause: error
    });
  }
  return {
    skill: {
      filename: 'skillit-cli-docs/SKILL.md',
      content
    },
    references: []
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
