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
  /** Config surfaces from TypeDoc for JSDoc correlation */
  configSurfaces?: ExtractedConfigSurface[];
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
 * - NEVER forget to pass configSurfaces when you have typed option interfaces — JSDoc metadata won't be correlated
 */
export async function extractCliSkill(options: CliExtractionOptions): Promise<ExtractedSkill> {
  const { program, helpTexts, metadata = {}, configSurfaces = [] } = options;

  // Extract command structure (introspection or help)
  let cliSurfaces: ExtractedConfigSurface[] = [];

  if (program !== undefined) {
    cliSurfaces = introspectCommander(program);
  } else if (helpTexts !== undefined) {
    cliSurfaces = Object.entries(helpTexts).map(([commandName, text]) =>
      parseHelpOutput(text, commandName)
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
