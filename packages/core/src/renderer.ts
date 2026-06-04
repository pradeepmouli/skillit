import YAML from 'yaml';
import type {
  AdapterRenderContext,
  ExtractedSkill,
  ExtractedFunction,
  ExtractedClass,
  ExtractedType,
  ExtractedEnum,
  ExtractedVariable,
  RefCategory,
  RefManifest,
  RenderedFile,
  RenderedSkill,
  SkillRenderOptions
} from './types.js';
import { estimateTokens, truncateToTokenBudget } from './tokens.js';
import { renderConfigSurfaceSection, renderConfigReference } from './config-renderer.js';
import { canonicalize } from './canonical.js';
import { renderResourcesReference, renderPromptsReference } from './references-mcp.js';

/** agentskills.io spec: max 1024 chars for description */
const DESCRIPTION_MAX = 1024;

const DEFAULT_OPTIONS: SkillRenderOptions = {
  outDir: 'skills',
  includeExamples: true,
  includeSignatures: true,
  maxTokens: 4000,
  namePrefix: '',
  license: ''
};

const REF_CATEGORY_ORDER: RefCategory[] = [
  'functions',
  'classes',
  'types',
  'variables',
  'commands',
  'config',
  'docs',
  'resources',
  'prompts',
  'examples'
];

/**
 * Render multiple extracted skills into progressive disclosure file sets.
 *
 * @category Rendering
 * @useWhen
 * - You have one or more ExtractedSkill objects and need SKILL.md + references/ output
 * - Building a custom extraction pipeline that bypasses the TypeDoc plugin
 * @never
 * - NEVER set maxTokens below 500 — reference files become truncated mid-signature, producing broken code blocks that confuse LLMs
 * - NEVER pass skills with empty `name` — the output directory becomes a bare `/` path
 */
export function renderSkills(
  skills: ExtractedSkill[],
  options?: Partial<Omit<SkillRenderOptions, 'invocation'>>
): RenderedSkill[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const rendered = skills.map((skill) => renderSkill(skill, opts));

  // Generate a router skill when multiple skills exist (monorepo)
  if (skills.length > 1) {
    const router = renderRouterSkill(skills, opts);
    if (router) rendered.push(router);
  }

  return rendered;
}

/**
 * Render a single skill into SKILL.md + references/.
 *
 * @category Rendering
 * @useWhen
 * - You need fine-grained control over rendering a single skill
 * @never
 * - NEVER set maxTokens below 500 — reference files become truncated mid-signature, producing broken code blocks
 */
export function renderSkill(
  skill: ExtractedSkill,
  options?: Partial<SkillRenderOptions>
): RenderedSkill;
export function renderSkill(
  skill: ExtractedSkill,
  options: Partial<SkillRenderOptions> & {
    invocation: NonNullable<SkillRenderOptions['invocation']>;
  }
): Promise<RenderedSkill>;
export function renderSkill(
  skill: ExtractedSkill,
  options?: Partial<SkillRenderOptions>
): RenderedSkill | Promise<RenderedSkill> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // --- Invocation adapter path: delegate dialect-specific rendering. ---
  // The host still canonicalizes the adapter's output so re-runs are content-identical.
  if (opts.invocation) {
    // Determine `mode` deterministically from SkillRenderOptions. Exactly one
    // of invocationPackageName | invocationHttpEndpoint | invocationLaunchCommand
    // must be set — the DU encodes this as a compile-time invariant on
    // `AdapterRenderContext` and we surface a runtime error here for any
    // non-literal callers (programmatic API consumers).
    const hasPackage = opts.invocationPackageName !== undefined;
    const hasHttp = opts.invocationHttpEndpoint !== undefined;
    const hasStdio = opts.invocationLaunchCommand !== undefined;
    const setCount = (hasPackage ? 1 : 0) + (hasHttp ? 1 : 0) + (hasStdio ? 1 : 0);

    if (setCount > 1) {
      // NOTE: McpError lives in @skillit/mcp and core has no dependency on
      // mcp. Plain Error is fine — the mcp wrapper that invokes renderSkill
      // (bundle.ts → recordFailure) maps non-McpError throws onto
      // TRANSPORT_FAILED so the CLI exit-code mapper still sees a stable code.
      throw new Error(
        'AdapterRenderContext: more than one of invocationPackageName, invocationHttpEndpoint, invocationLaunchCommand was set; the renderer requires exactly one to determine the launch shape (FR-H002).'
      );
    }
    if (setCount === 0) {
      throw new Error(
        'AdapterRenderContext: missing launch info — set one of invocationPackageName, invocationHttpEndpoint, invocationLaunchCommand on SkillRenderOptions when invoking renderSkill with an invocation adapter (FR-H002).'
      );
    }

    const skillName = toSkillName(opts.namePrefix || skill.name);
    let ctx: AdapterRenderContext;
    if (hasPackage) {
      ctx = {
        mode: 'bundle',
        skillName,
        maxTokens: opts.maxTokens,
        canonicalize: true,
        packageName: opts.invocationPackageName!,
        ...(opts.invocationBinName !== undefined ? { binName: opts.invocationBinName } : {})
      };
    } else if (hasHttp) {
      ctx = {
        mode: 'http',
        skillName,
        maxTokens: opts.maxTokens,
        canonicalize: true,
        httpEndpoint: opts.invocationHttpEndpoint!
      };
    } else {
      // hasStdio
      ctx = {
        mode: 'stdio',
        skillName,
        maxTokens: opts.maxTokens,
        canonicalize: true,
        launchCommand: opts.invocationLaunchCommand!
      };
    }
    return Promise.resolve(opts.invocation.render(skill, ctx)).then((rendered) =>
      canonicalize(rendered)
    );
  }

  // --- Default path: preserve today's synchronous output shape exactly. ---
  const skillName = toSkillName(opts.namePrefix || skill.name);
  const basePath = skillName;

  // --- references/*.md: detailed API loaded on demand ---
  const references: RenderedFile[] = [];

  if (skill.functions.length > 0 && !opts.skipDefaultFunctionsRef) {
    addGroupedReferences(
      skill.functions,
      basePath,
      'functions',
      opts,
      (items) => renderFunctionsRef(items, opts),
      'Function',
      references
    );
  }

  if (skill.classes.length > 0) {
    addGroupedReferences(
      skill.classes,
      basePath,
      'classes',
      opts,
      (items) => renderClassesRef(items, opts),
      'Class',
      references
    );
  }

  if (skill.types.length > 0 || skill.enums.length > 0) {
    const content = renderTypesRef(skill.types, skill.enums);
    references.push({
      filename: `${basePath}/references/types.md`,
      content: truncateToTokenBudget(content, opts.maxTokens),
      tokens: estimateTokens(content)
    });
  }

  if (skill.variables && skill.variables.length > 0) {
    const content = renderVariablesRef(skill.variables);
    references.push({
      filename: `${basePath}/references/variables.md`,
      content: truncateToTokenBudget(content, opts.maxTokens),
      tokens: estimateTokens(content)
    });
  }

  // Only create examples.md for examples beyond the first (which is used as Quick Start in SKILL.md)
  if (opts.includeExamples && skill.examples.length > 1) {
    const content = '# Examples\n\n' + skill.examples.slice(1).join('\n\n---\n\n');
    references.push({
      filename: `${basePath}/references/examples.md`,
      content: truncateToTokenBudget(content, opts.maxTokens),
      tokens: estimateTokens(content)
    });
  }

  if (skill.documents && skill.documents.length > 0) {
    // Group docs by category for index files
    const byCategory = new Map<string, typeof skill.documents>();
    for (const doc of skill.documents) {
      const cat = doc.category ?? '_uncategorized';
      const list = byCategory.get(cat) ?? [];
      list.push(doc);
      byCategory.set(cat, list);
    }

    // Generate per-category index files
    for (const [cat, docs] of byCategory) {
      if (cat === '_uncategorized' && docs.length < 3) continue; // skip tiny uncategorized groups
      const subdir = cat === '_uncategorized' ? 'docs' : `docs/${cat}`;
      const indexLines = [`# ${cat === '_uncategorized' ? 'Documentation' : cat}\n`];
      for (const doc of docs) {
        const desc = doc.description ? ` — ${doc.description}` : '';
        indexLines.push(`- [${doc.title}](${toFilename(doc.title)}.md)${desc}`);
      }
      references.push({
        filename: `${basePath}/references/${subdir}/index.md`,
        content: indexLines.join('\n'),
        tokens: estimateTokens(indexLines.join('\n'))
      });
    }

    // Generate individual doc files
    for (const doc of skill.documents) {
      let footer = '';
      if (doc.apiRefs && doc.apiRefs.length > 0) {
        footer = '\n\n---\n\n**See also:** ' + doc.apiRefs.map((r) => `\`${r}\``).join(', ');
      }
      const hasHeading = /^#\s/.test(doc.content);
      const content = hasHeading
        ? `${doc.content}${footer}`
        : `# ${doc.title}\n\n${doc.content}${footer}`;
      const subdir = doc.category ? `docs/${doc.category}` : 'docs';
      references.push({
        filename: `${basePath}/references/${subdir}/${toFilename(doc.title)}.md`,
        content: truncateToTokenBudget(content, opts.maxTokens),
        tokens: estimateTokens(content)
      });
    }
  }

  if (skill.configSurfaces && skill.configSurfaces.length > 0) {
    const cliSurfaces = skill.configSurfaces.filter((s) => s.sourceType === 'cli');
    const configSurfaces = skill.configSurfaces.filter((s) => s.sourceType !== 'cli');

    if (cliSurfaces.length > 0) {
      const content = renderConfigReference(cliSurfaces);
      references.push({
        filename: `${basePath}/references/commands.md`,
        content: truncateToTokenBudget(content, opts.maxTokens),
        tokens: estimateTokens(content)
      });
    }

    if (configSurfaces.length > 0) {
      const content = renderConfigReference(configSurfaces);
      references.push({
        filename: `${basePath}/references/config.md`,
        content: truncateToTokenBudget(content, opts.maxTokens),
        tokens: estimateTokens(content)
      });
    }
  }

  // MCP resources and prompts — emitted via shared helpers so every code path
  // (default + invocation adapters that delegate here) gets consistent output.
  const resourcesRef = renderResourcesReference(skill.resources ?? [], {
    skillName: basePath,
    maxTokens: opts.maxTokens
  });
  if (resourcesRef) references.push(resourcesRef);

  const promptsRef = renderPromptsReference(skill.prompts ?? [], {
    skillName: basePath,
    maxTokens: opts.maxTokens
  });
  if (promptsRef) references.push(promptsRef);

  const refManifest = buildRefManifest(basePath, references);
  const skillContent = renderSkillMd(skill, skillName, opts, refManifest);

  const result: RenderedSkill = {
    skill: {
      filename: `${basePath}/SKILL.md`,
      content: skillContent,
      tokens: estimateTokens(skillContent)
    },
    references
  };
  // Default canonicalize unless the caller explicitly opts out — adapters that
  // mutate references after the inner renderSkill returns (e.g. target-mcpc
  // appending its own tools.md) pass `canonicalize: false` so canonicalization
  // runs exactly once at the host's outer wrapper.
  return opts.canonicalize === false ? result : canonicalize(result);
}

// ===========================================================================
// Router skill — generated for monorepos with 2+ packages
// ===========================================================================

function renderRouterSkill(
  skills: ExtractedSkill[],
  opts: SkillRenderOptions
): RenderedSkill | null {
  const names = skills.map((s) => s.name);
  const scope = names[0]?.match(/^@([^/]+)\//)?.[1];
  const routerName = scope ?? names.reduce((a, b) => (a.length < b.length ? a : b));
  const skillName = toSkillName(routerName);

  if (skills.some((s) => toSkillName(s.name) === skillName)) return null;

  // --- Description: WHEN triggers + domain keywords ---
  const pkgNames = skills.map((s) => s.name.replace(/^@[^/]+\//, '')).join(', ');
  const allKeywords = [
    ...new Set(
      skills
        .flatMap((s) => s.keywords ?? [])
        .filter(
          (k) =>
            !['typescript', 'javascript', 'node', 'nodejs', 'npm', 'library', 'package'].includes(
              k.toLowerCase()
            )
        )
    )
  ];
  const keywordSuffix =
    allKeywords.length > 0 ? ` Covers: ${allKeywords.slice(0, 10).join(', ')}.` : '';
  const description = `Use when working with ${routerName} (${pkgNames}).${keywordSuffix}`;

  // --- Helpers: extract routing-relevant data from each package skill ---
  type SkillInfo = {
    short: string;
    peerName: string;
    desc: string;
    remarks: string;
    useWhens: string[];
    avoidWhens: string[];
    nevers: string[];
    keyExports: string[];
  };
  const infos: SkillInfo[] = skills.map((s) => {
    // Key exports: top 3 classes + top 3 functions by name
    const topClasses = s.classes.slice(0, 3).map((c) => `\`${c.name}\``);
    const topFunctions = s.functions.slice(0, 3).map((f) => `\`${f.name}\``);
    return {
      short: s.name.replace(/^@[^/]+\//, ''),
      peerName: toSkillName(s.name),
      desc: s.packageDescription || s.description || '',
      remarks: s.remarks || '',
      useWhens: s.useWhen ?? [],
      avoidWhens: s.avoidWhen ?? [],
      nevers: s.pitfalls ?? [],
      keyExports: [...topClasses, ...topFunctions].slice(0, 5)
    };
  });

  const lines: string[] = [];
  lines.push(renderFrontmatter(skillName, description, opts.license));

  // --- Assertive opening ---
  lines.push(`# ${routerName}`);
  lines.push('');
  lines.push(
    `**Use this skill for ANY work with ${routerName}.** It routes to the correct package.`
  );
  lines.push('');

  // --- When to Use: broad triggers ---
  lines.push('## When to Use');
  lines.push('');
  lines.push('Use this router when:');
  for (const info of infos) {
    lines.push(`- ${info.desc}`);
  }
  lines.push('');

  // --- Decision Tree: numbered quick routing ---
  lines.push('## Decision Tree');
  lines.push('');
  for (let i = 0; i < infos.length; i++) {
    const info = infos[i]!;
    lines.push(`${i + 1}. ${info.desc}? → \`${info.peerName}\``);
  }
  lines.push('');

  // --- Routing Logic: per-package detail with expert context ---
  lines.push('## Routing Logic');
  lines.push('');
  for (const info of infos) {
    lines.push(`### ${info.short} → \`${info.peerName}\``);
    lines.push('');
    // Expert intro from @remarks (thinking framework)
    if (info.remarks) {
      const firstPara = info.remarks.split(/\n\s*\n/)[0]?.trim();
      if (firstPara && firstPara.length > 20) {
        lines.push(firstPara);
        lines.push('');
      }
    }
    // @useWhen detail (only place these appear)
    if (info.useWhens.length > 0) {
      for (const t of info.useWhens.slice(0, 3)) {
        lines.push(`- ${t}`);
      }
      lines.push('');
    }
    // Key exports
    if (info.keyExports.length > 0) {
      lines.push(`Key APIs: ${info.keyExports.join(', ')}`);
      lines.push('');
    }
  }

  // --- Critical Patterns: top NEVER per package (cross-cutting expert knowledge) ---
  const crossCuttingNevers: string[] = [];
  for (const info of infos) {
    if (info.nevers.length > 0) {
      crossCuttingNevers.push(`- ${info.nevers[0]} (${info.short})`);
    }
  }
  if (crossCuttingNevers.length > 0) {
    lines.push('## Critical Patterns');
    lines.push('');
    lines.push('Top pitfall per package:');
    lines.push(...crossCuttingNevers);
    lines.push('');
  }

  // --- Anti-Rationalization (from @avoidWhen) ---
  const rationalizations: string[] = [];
  for (const info of infos) {
    if (info.avoidWhens.length > 0) {
      const thought = info.avoidWhens[0]!;
      rationalizations.push(
        `| "I'll just use ${info.short} for everything" | ${info.short} is for ${info.desc.toLowerCase()}. ${thought} |`
      );
    }
  }
  if (rationalizations.length > 0) {
    lines.push('## Anti-Rationalization');
    lines.push('');
    lines.push('| Thought | Reality |');
    lines.push('|---------|---------|');
    lines.push(...rationalizations);
    lines.push('');
  }

  // --- Example Invocations ---
  lines.push('## Example Invocations');
  lines.push('');
  for (const info of infos) {
    lines.push(`User: "I need to ${info.desc.toLowerCase()}"  `);
    lines.push(`→ Load \`${info.peerName}\``);
    lines.push('');
  }

  // --- NEVER ---
  lines.push('## NEVER');
  lines.push('');
  lines.push('- NEVER load all package skills simultaneously — pick the one matching your task');
  if (skills.length > 2) {
    lines.push(
      '- If your task spans multiple packages, load the foundational one first (typically core/shared), then the specific one'
    );
  }
  lines.push('');

  const content = lines.join('\n');
  return {
    skill: { filename: `${skillName}/SKILL.md`, content, tokens: estimateTokens(content) },
    references: []
  };
}

// ===========================================================================
// SKILL.md — lean discovery document
// ===========================================================================

function renderSkillMd(
  skill: ExtractedSkill,
  skillName: string,
  opts: SkillRenderOptions,
  refManifest?: RefManifest
): string {
  const sections: string[] = [];

  const description = buildDescription(skill);
  sections.push(
    renderFrontmatter(
      skillName,
      description,
      opts.license || skill.license || '',
      opts.additionalFrontmatter
    )
  );

  // Body prefix injection — CLI-as-proxy adapters thread Setup instructions
  // through here so the host install/connect commands appear before the
  // standard skill body. Empty string is a no-op (sections.join skips it
  // because it's still added but produces no visible effect when blank).
  if (opts.bodyPrefix && opts.bodyPrefix.length > 0) {
    sections.push(opts.bodyPrefix);
  }

  sections.push(`# ${skill.name}`);

  // Package description as body intro
  if (skill.packageDescription) {
    sections.push(skill.packageDescription);
  } else if (skill.description) {
    sections.push(skill.description);
  }

  // @remarks from @packageDocumentation — architectural context, trade-offs, mental models
  if (skill.remarks) {
    sections.push(skill.remarks);
  }

  // Features section from README — inline in SKILL.md
  if (skill.readmeFeatures) {
    sections.push('## Features\n\n' + skill.readmeFeatures);
  }

  // Quick Start example — when too long, extract just the first code block
  if (opts.includeExamples && skill.examples.length > 0) {
    const qs = skill.examples[0]!;
    const qsLines = qs.split('\n');
    if (qsLines.length > 30) {
      // Extract first complete code block (``` ... ```)
      const codeBlockMatch = qs.match(/```[\s\S]*?```/);
      if (codeBlockMatch) {
        sections.push('## Quick Start\n\n' + codeBlockMatch[0]);
      } else {
        sections.push('## Quick Start\n\n' + qsLines.slice(0, 30).join('\n') + '\n...');
      }
    } else {
      sections.push('## Quick Start\n\n' + qs);
    }
  }

  // Additional examples beyond Quick Start
  if (opts.includeExamples && skill.examples.length > 1) {
    const lines = ['## Examples\n'];
    for (const ex of skill.examples.slice(1)) {
      lines.push(ex);
      lines.push('\n---\n');
    }
    sections.push(lines.join('\n'));
  }

  const whenToUse = renderWhenToUse(skill);
  if (whenToUse) sections.push(whenToUse);

  const neverRules = renderNeverRules(skill);
  if (neverRules) sections.push(neverRules);

  // Troubleshooting section from README — inline in SKILL.md
  if (skill.readmeTroubleshooting) {
    sections.push('## Troubleshooting\n\n' + skill.readmeTroubleshooting);
  }

  const configSection = renderConfigSurfaceSection(skill.configSurfaces);
  if (configSection) sections.push(configSection);

  const quickRef = renderQuickReference(skill);
  if (quickRef) sections.push(quickRef);

  const docs = renderDocumentation(skill);
  if (docs) sections.push(docs);

  if (refManifest && Object.keys(refManifest).length > 0) {
    sections.push(renderLoadingTriggers(refManifest));
  }

  const links = renderLinks(skill);
  if (links) sections.push(links);

  return sections.join('\n\n');
}

// ===========================================================================
// Reference files — full detail loaded on demand
// ===========================================================================

/** Format description suffix — returns " — desc" or empty string, never trailing " — " */
function descSuffix(description: string | undefined): string {
  return description ? ` — ${description}` : '';
}

function getGroupKey<T extends { category?: string; sourceModule?: string }>(item: T): string {
  return item.category || item.sourceModule || '';
}

function groupByCategory<T extends { category?: string; sourceModule?: string }>(
  items: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getGroupKey(item);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function hasGroupInfo<T extends { category?: string; sourceModule?: string }>(items: T[]): boolean {
  return items.some((item) => !!item.category || !!item.sourceModule);
}

// Keep old names as aliases for backward compatibility within this file
const groupByModule = groupByCategory;
const hasModuleInfo = hasGroupInfo;

function renderFunctionBody(
  fn: ExtractedFunction,
  opts: SkillRenderOptions,
  lines: string[]
): void {
  if (fn.description) lines.push(fn.description);

  if (fn.remarks) {
    lines.push('');
    lines.push(fn.remarks);
  }

  if (opts.includeSignatures && fn.signature) {
    lines.push('```ts', fn.signature, '```');
  }

  if (fn.parameters.length > 0) {
    lines.push('**Parameters:**');
    for (const p of fn.parameters) {
      const opt = p.optional ? ' (optional)' : '';
      const def = p.defaultValue ? ` — default: \`${p.defaultValue}\`` : '';
      lines.push(`- \`${p.name}: ${p.type}\`${opt}${def}${descSuffix(p.description)}`);
    }
  }

  if (fn.returnType && fn.returnType !== 'void') {
    const desc = fn.returnsDescription ? ` — ${fn.returnsDescription}` : '';
    lines.push(`**Returns:** \`${fn.returnType}\`${desc}`);
  }

  // Render important tags
  if (fn.tags['deprecated']) {
    lines.push(`> **Deprecated:** ${fn.tags['deprecated']}`);
  }
  if (fn.tags['since']) {
    lines.push(`**Since:** \`${fn.tags['since']}\``);
  }
  if (fn.tags['throws']) {
    lines.push(`**Throws:** ${fn.tags['throws']}`);
  }
  if (fn.tags['see']) {
    lines.push(`**See:** ${fn.tags['see']}`);
  }

  if (opts.includeSignatures && fn.overloads && fn.overloads.length > 0) {
    lines.push('**Overloads:**');
    for (const overload of fn.overloads) {
      lines.push('```ts', overload, '```');
    }
  }

  if (opts.includeExamples && fn.examples.length > 0) {
    for (const ex of fn.examples) {
      lines.push(ex);
    }
  }

  lines.push('');
}

function renderFunctionsRef(fns: ExtractedFunction[], opts: SkillRenderOptions): string {
  const lines = ['# Functions\n'];

  if (hasModuleInfo(fns)) {
    const groups = groupByModule(fns);
    for (const [mod, modFns] of groups) {
      if (mod) lines.push(`## ${mod}\n`);
      for (const fn of modFns) {
        lines.push(mod ? `### \`${fn.name}\`` : `## \`${fn.name}\``);
        renderFunctionBody(fn, opts, lines);
      }
    }
  } else {
    for (const fn of fns) {
      lines.push(`## \`${fn.name}\``);
      renderFunctionBody(fn, opts, lines);
    }
  }

  return lines.join('\n');
}

function renderClassBody(
  cls: ExtractedClass,
  opts: SkillRenderOptions,
  lines: string[],
  parentPropNames?: Set<string>
): void {
  if (cls.description) lines.push(cls.description);

  if (cls.extends) {
    lines.push(`*extends \`${cls.extends}\`*`);
  }
  if (cls.implements && cls.implements.length > 0) {
    lines.push(`*implements ${cls.implements.map((i) => `\`${i}\``).join(', ')}*`);
  }

  if (opts.includeSignatures && cls.constructorSignature) {
    lines.push('```ts', cls.constructorSignature, '```');
  }

  if (cls.properties.length > 0) {
    const ownProps = parentPropNames
      ? cls.properties.filter((p) => !parentPropNames.has(p.name))
      : cls.properties;
    const inheritedCount = cls.properties.length - ownProps.length;

    if (ownProps.length > 0) {
      lines.push('**Properties:**');
      for (const p of ownProps) {
        const opt = p.optional ? ' (optional)' : '';
        lines.push(`- \`${p.name}: ${p.type}\`${opt}${descSuffix(p.description)}`);
      }
    }

    if (inheritedCount > 0 && cls.extends) {
      const parentSlug = cls.extends
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      lines.push(
        `*Inherits ${inheritedCount} properties from \`${cls.extends}\` — see [\`${cls.extends}\`](../${parentSlug}.md)*`
      );
    }
  }

  if (cls.methods.length > 0) {
    lines.push('**Methods:**');
    for (const m of cls.methods) {
      if (opts.includeSignatures) {
        lines.push(`- \`${m.signature}\`${descSuffix(m.description)}`);
      } else {
        lines.push(`- \`${m.name}\`${descSuffix(m.description)}`);
      }
    }
  }

  if (opts.includeExamples && cls.examples.length > 0) {
    for (const ex of cls.examples) {
      lines.push(ex);
    }
  }

  lines.push('');
}

function renderClassesRef(classes: ExtractedClass[], opts: SkillRenderOptions): string {
  const lines = ['# Classes\n'];

  // Build a map of class name → property name set for deduplication
  const classPropMap = new Map<string, Set<string>>();
  for (const cls of classes) {
    classPropMap.set(cls.name, new Set(cls.properties.map((p) => p.name)));
  }

  function getParentProps(cls: ExtractedClass): Set<string> | undefined {
    if (!cls.extends) return undefined;
    return classPropMap.get(cls.extends);
  }

  if (hasModuleInfo(classes)) {
    const groups = groupByModule(classes);
    for (const [mod, modClasses] of groups) {
      if (mod) lines.push(`## ${mod}\n`);
      for (const cls of modClasses) {
        lines.push(mod ? `### \`${cls.name}\`` : `## \`${cls.name}\``);
        renderClassBody(cls, opts, lines, getParentProps(cls));
      }
    }
  } else {
    for (const cls of classes) {
      lines.push(`## \`${cls.name}\``);
      renderClassBody(cls, opts, lines, getParentProps(cls));
    }
  }

  return lines.join('\n');
}

function renderTypesRef(types: ExtractedType[], enums: ExtractedEnum[]): string {
  const lines = ['# Types & Enums\n'];

  const allTypeLike = [...types, ...enums];

  if (hasModuleInfo(allTypeLike)) {
    // Group types and enums together by module
    const typeGroups = groupByModule(types);
    const enumGroups = groupByModule(enums);
    const allMods = new Set([...typeGroups.keys(), ...enumGroups.keys()]);

    for (const mod of allMods) {
      if (mod) lines.push(`## ${mod}\n`);
      const heading = (name: string) => (mod ? `### \`${name}\`` : `## \`${name}\``);

      const modTypes = typeGroups.get(mod) ?? [];
      for (const t of modTypes) {
        lines.push(heading(t.name));
        if (t.description) lines.push(t.description);
        if (t.properties && t.properties.length > 0) {
          lines.push('**Properties:**');
          for (const p of t.properties) {
            const opt = p.optional ? ' (optional)' : '';
            lines.push(`- \`${p.name}: ${p.type}\`${opt}${descSuffix(p.description)}`);
          }
        }
        if (t.definition) {
          lines.push('```ts', t.definition, '```');
        }
        lines.push('');
      }

      const modEnums = enumGroups.get(mod) ?? [];
      for (const e of modEnums) {
        lines.push(heading(e.name));
        if (e.description) lines.push(e.description);
        for (const m of e.members) {
          lines.push(`- \`${m.name}\` = \`${m.value}\`${descSuffix(m.description)}`);
        }
        lines.push('');
      }
    }
  } else {
    if (types.length > 0) {
      lines.push('## Types\n');
      for (const t of types) {
        lines.push(`### \`${t.name}\``);
        if (t.description) lines.push(t.description);
        if (t.properties && t.properties.length > 0) {
          lines.push('**Properties:**');
          for (const p of t.properties) {
            const opt = p.optional ? ' (optional)' : '';
            lines.push(`- \`${p.name}: ${p.type}\`${opt}${descSuffix(p.description)}`);
          }
        }
        if (t.definition) {
          lines.push('```ts', t.definition, '```');
        }
        lines.push('');
      }
    }

    if (enums.length > 0) {
      lines.push('## Enums\n');
      for (const e of enums) {
        lines.push(`### \`${e.name}\``);
        if (e.description) lines.push(e.description);
        for (const m of e.members) {
          lines.push(`- \`${m.name}\` = \`${m.value}\`${descSuffix(m.description)}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function renderVariablesRef(variables: ExtractedVariable[]): string {
  const lines = ['# Variables & Constants\n'];

  if (hasModuleInfo(variables)) {
    const groups = groupByModule(variables);
    for (const [mod, modVars] of groups) {
      if (mod) lines.push(`## ${mod}\n`);
      for (const v of modVars) {
        lines.push(mod ? `### \`${v.name}\`` : `## \`${v.name}\``);
        if (v.description) lines.push(v.description);
        const keyword = v.isConst ? 'const' : 'let';
        lines.push('```ts', `${keyword} ${v.name}: ${v.type}`, '```');
        lines.push('');
      }
    }
  } else {
    for (const v of variables) {
      lines.push(`## \`${v.name}\``);
      if (v.description) lines.push(v.description);
      const keyword = v.isConst ? 'const' : 'let';
      lines.push('```ts', `${keyword} ${v.name}: ${v.type}`, '```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ===========================================================================
// Shared helpers
// ===========================================================================

/**
 * When rendered content exceeds the token budget, split into per-group reference files
 * using @category or sourceModule. Falls back to a single truncated file if no groups.
 */
function addGroupedReferences<
  T extends {
    name: string;
    description: string;
    category?: string;
    sourceModule?: string;
  }
>(
  items: T[],
  basePath: string,
  kind: string,
  opts: SkillRenderOptions,
  renderFn: (subset: T[]) => string,
  itemLabel: string,
  references: RenderedFile[]
): void {
  const fullContent = renderFn(items);
  const fullTokens = estimateTokens(fullContent);

  // If it fits in the budget, emit as one file
  if (fullTokens <= opts.maxTokens) {
    references.push({
      filename: `${basePath}/references/${kind}.md`,
      content: fullContent,
      tokens: fullTokens
    });
    return;
  }

  // Try splitting by group (category or sourceModule)
  const grouped = groupByCategory(items);
  if (grouped.size <= 1) {
    // No groups — truncate as before
    references.push({
      filename: `${basePath}/references/${kind}.md`,
      content: truncateToTokenBudget(fullContent, opts.maxTokens),
      tokens: fullTokens
    });
    return;
  }

  // Emit one file per group in a subdirectory: references/<kind>/<group>.md
  // If a group still exceeds the budget, split into one file per item
  for (const [groupName, groupItems] of grouped) {
    const slug = groupName
      ? groupName
          .toLowerCase()
          .replace(/[^a-z0-9/]+/g, '-')
          .replace(/^-|-$/g, '')
      : 'other';
    const content = renderFn(groupItems);
    const tokens = estimateTokens(content);

    if (tokens <= opts.maxTokens || groupItems.length <= 1) {
      references.push({
        filename: `${basePath}/references/${kind}/${slug}.md`,
        content: truncateToTokenBudget(content, opts.maxTokens),
        tokens
      });
    } else {
      // Group still too large — split into one file per item
      const indexRows: string[] = [];
      for (const item of groupItems) {
        const itemSlug = toSkillName(item.name);
        const itemContent = renderFn([item]);
        // Use 2× budget for individual item files — they're already scoped to one item
        references.push({
          filename: `${basePath}/references/${kind}/${slug}/${itemSlug}.md`,
          content: truncateToTokenBudget(itemContent, opts.maxTokens * 2),
          tokens: estimateTokens(itemContent)
        });
        indexRows.push(`| [${item.name}](${itemSlug}.md) | ${item.description} |`);
      }

      // Emit an index.md for this subdirectory
      const indexContent = [
        `# ${groupName || slug}`,
        '',
        `| ${itemLabel} | Description |`,
        `|${'-'.repeat(itemLabel.length + 2)}|-------------|`,
        ...indexRows
      ].join('\n');
      references.push({
        filename: `${basePath}/references/${kind}/${slug}/index.md`,
        content: indexContent,
        tokens: estimateTokens(indexContent)
      });
    }
  }
}

function buildRefManifest(basePath: string, references: RenderedFile[]): RefManifest {
  const manifest: RefManifest = {};
  const prefix = `${basePath}/references/`;

  for (const ref of references) {
    if (!ref.filename.startsWith(prefix)) continue;
    const relative = ref.filename.slice(prefix.length);
    if (relative.length === 0) continue;

    const segment = relative.split('/')[0] ?? '';
    const category = segment.replace(/\.md$/, '') as RefCategory;
    if (!REF_CATEGORY_ORDER.includes(category)) continue;

    const isFile = relative === `${category}.md`;
    const entry = {
      path: (isFile
        ? `references/${category}.md`
        : `references/${category}/`) as `references/${string}`,
      mode: isFile ? 'file' : 'directory'
    } as const;

    const existing = manifest[category];
    if (!existing || entry.mode === 'directory') {
      manifest[category] = entry;
    }
  }

  return manifest;
}

function buildDescription(skill: ExtractedSkill): string {
  // Description = package.json tagline + short WHEN clause + domain keywords.
  const desc = skill.packageDescription || skill.description || `API reference for ${skill.name}`;
  const parts: string[] = [desc];

  // Add a short scenario-based WHEN from @useWhen (first item only, truncated to 80 chars)
  if (skill.useWhen && skill.useWhen.length > 0) {
    const first = skill.useWhen[0]!;
    const short = first.length > 80 ? first.slice(0, first.lastIndexOf(' ', 77)) + '...' : first;
    parts.push(`Use when: ${short}.`);
  }

  // Append domain keywords for activation matching
  if (skill.keywords && skill.keywords.length > 0) {
    const useful = skill.keywords.filter(
      (k) =>
        !['typescript', 'javascript', 'node', 'nodejs', 'npm', 'library', 'package'].includes(
          k.toLowerCase()
        )
    );
    if (useful.length > 0) {
      parts.push(`Also: ${useful.join(', ')}.`);
    }
  }

  return truncateDescription(parts.join(' '), DESCRIPTION_MAX);
}

function truncateDescription(desc: string, max: number): string {
  if (desc.length <= max) return desc;
  // Match first sentence — but skip .!? inside backticks (e.g. `?z2f`)
  // Also handle em-dash: treat "—" as transparent (not a sentence boundary)
  const firstSentence = desc.match(/^(?:[^.!?`]|`[^`]*`)+[.!?]/)?.[0];
  if (firstSentence && firstSentence.length <= max) return firstSentence;
  // Fallback: cut at last space before max to avoid mid-word truncation
  const cutpoint = desc.lastIndexOf(' ', max - 4);
  return desc.slice(0, cutpoint > 0 ? cutpoint : max - 3) + '...';
}

function renderFrontmatter(
  name: string,
  description: string,
  license: string,
  additional?: Readonly<Record<string, unknown>>
): string {
  const lines = ['---', `name: ${name}`];
  lines.push(`description: ${quoteYaml(description)}`);
  if (license) lines.push(`license: ${license}`);

  if (additional) {
    // Track existing keys so additional values cannot overwrite them — collisions
    // silently keep the existing key (e.g. user passing `name` in additional is a no-op).
    const existing = new Set<string>(['name', 'description']);
    if (license) existing.add('license');

    for (const [key, value] of Object.entries(additional)) {
      if (existing.has(key)) continue;
      // Serialize via yaml so nested objects/arrays produce proper block output.
      // We trim the trailing newline that yaml.stringify appends so our caller
      // can join with '\n' cleanly. Indented child lines retain their indent.
      const serialized = YAML.stringify({ [key]: value }).replace(/\n$/, '');
      lines.push(serialized);
      existing.add(key);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

function quoteYaml(value: string): string {
  if (/[:#{}[\],&*?|>!%@`"']/.test(value) || value.includes('\n')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function extractFirstSentence(text: string): string {
  const match = text.match(/^[^.!?]*[.!?]/);
  return match ? match[0].trim() : '';
}

function renderDocumentation(skill: ExtractedSkill): string {
  if (!skill.documents || skill.documents.length === 0) return '';
  const lines = ['## Documentation\n'];

  // Group by category
  const categorized = new Map<string, typeof skill.documents>();
  const uncategorized: typeof skill.documents = [];
  for (const doc of skill.documents) {
    if (doc.category) {
      const list = categorized.get(doc.category) ?? [];
      list.push(doc);
      categorized.set(doc.category, list);
    } else {
      uncategorized.push(doc);
    }
  }

  if (categorized.size > 1) {
    // Progressive disclosure: category summary → index files → individual docs
    // Use parent doc's description for category summary, fall back to doc title list
    for (const [category, docs] of categorized) {
      const parentDoc = docs.find((d) => d.isParent);
      const desc = parentDoc?.description ?? docs.map((d) => d.title).join(', ');
      lines.push(`- **${category}** (${docs.length}) — ${desc}`);
    }
    if (uncategorized.length > 0) {
      for (const doc of uncategorized) {
        const desc = doc.description ?? extractFirstSentence(doc.content);
        lines.push(`- **${doc.title}**${desc ? ` — ${desc}` : ''}`);
      }
    }
  } else {
    // Few docs — flat list with descriptions
    for (const doc of skill.documents) {
      const desc = doc.description ?? extractFirstSentence(doc.content);
      lines.push(`- **${doc.title}**${desc ? ` — ${desc}` : ''}`);
    }
  }

  lines.push('');
  lines.push(`See \`references/docs/\` for full guides (${skill.documents.length} total).`);
  return lines.join('\n');
}

/** Scenario-based loading triggers for reference files */
function renderLoadingTriggers(manifest: RefManifest): string {
  const triggerMap: Record<
    RefCategory,
    { file: (path: string) => string; directory: (path: string) => string }
  > = {
    functions: {
      file: (path) =>
        `When calling any function → read \`${path}\` for full signatures, parameters, and return types`,
      directory: (path) =>
        `When calling any function → browse \`${path}\` for grouped indexes, full signatures, parameters, and return types`
    },
    classes: {
      file: (path) =>
        `When using a class → read \`${path}\` for properties, methods, and inheritance`,
      directory: (path) =>
        `When using a class → browse \`${path}\` for grouped indexes, properties, methods, and inheritance`
    },
    types: {
      file: (path) => `When defining typed variables or function parameters → read \`${path}\``,
      directory: (path) =>
        `When defining typed variables or function parameters → browse \`${path}\``
    },
    variables: {
      file: (path) => `When using exported constants → read \`${path}\``,
      directory: (path) => `When using exported constants → browse \`${path}\``
    },
    commands: {
      file: (path) =>
        `When using CLI commands → read \`${path}\` for flags, arguments, and defaults`,
      directory: (path) =>
        `When using CLI commands → browse \`${path}\` for grouped command references`
    },
    config: {
      file: (path) => `When configuring options → read \`${path}\` for all settings and defaults`,
      directory: (path) => `When configuring options → browse \`${path}\` for grouped settings`
    },
    docs: {
      file: (path) => `When learning concepts or workflows → read \`${path}\``,
      directory: (path) => `When learning concepts or workflows → browse \`${path}\` by category`
    },
    resources: {
      file: (path) =>
        `When you need to read MCP-exposed resources → read \`${path}\` for URI templates and MIME types`,
      directory: (path) =>
        `When you need to read MCP-exposed resources → browse \`${path}\` for URI templates and MIME types`
    },
    prompts: {
      file: (path) =>
        `When invoking MCP-exposed prompts → read \`${path}\` for arguments and prompt names`,
      directory: (path) =>
        `When invoking MCP-exposed prompts → browse \`${path}\` for arguments and prompt names`
    },
    examples: {
      file: (path) => `For additional usage patterns → read \`${path}\``,
      directory: (path) => `For additional usage patterns → browse \`${path}\``
    }
  };

  const lines = ['## References\n'];
  lines.push('Load these on demand — do NOT read all at once:\n');
  for (const category of REF_CATEGORY_ORDER) {
    const entry = manifest[category];
    if (!entry) continue;

    const trigger =
      entry.mode === 'directory'
        ? triggerMap[category].directory(entry.path)
        : triggerMap[category].file(entry.path);
    lines.push(`- ${trigger}`);
  }
  return lines.join('\n');
}

function renderLinks(skill: ExtractedSkill): string {
  const links: string[] = [];
  if (skill.repository) links.push(`- [Repository](${skill.repository})`);
  if (skill.author) links.push(`- Author: ${skill.author}`);
  if (links.length === 0) return '';
  return '## Links\n\n' + links.join('\n');
}

function renderWhenToUse(skill: ExtractedSkill): string {
  const useLines: string[] = [];
  const avoidLines: string[] = [];

  // @useWhen — bullet list with source attribution when multiple sources exist
  if (skill.useWhenSources && skill.useWhenSources.length > 0) {
    const sources = skill.useWhenSources;
    const distinctSources = new Set(sources.map((s) => s.sourceName));
    for (const src of sources) {
      const attribution = distinctSources.size > 1 ? ` → use \`${src.sourceName}\`` : '';
      const dashIdx = src.text.indexOf(' — ');
      if (dashIdx !== -1) {
        useLines.push(
          `- ${src.text.slice(0, dashIdx).trim()}${attribution} — ${src.text.slice(dashIdx + 3).trim()}`
        );
      } else {
        useLines.push(`- ${src.text}${attribution}`);
      }
    }
  } else if (skill.useWhen && skill.useWhen.length > 0) {
    for (const item of skill.useWhen) {
      useLines.push(`- ${item}`);
    }
  }

  // @avoidWhen — bullet list
  if (skill.avoidWhenSources && skill.avoidWhenSources.length > 0) {
    const sources = skill.avoidWhenSources;
    const distinctSources = new Set(sources.map((s) => s.sourceName));
    for (const src of sources) {
      const attribution = distinctSources.size > 1 ? ` (\`${src.sourceName}\`)` : '';
      avoidLines.push(`- ${src.text}${attribution}`);
    }
  } else if (skill.avoidWhen && skill.avoidWhen.length > 0) {
    for (const item of skill.avoidWhen) {
      avoidLines.push(`- ${item}`);
    }
  }

  if (useLines.length === 0 && avoidLines.length === 0) return '';

  const sections: string[] = [];
  if (useLines.length > 0) {
    sections.push('**Use this skill when:**\n' + useLines.join('\n'));
  }
  if (avoidLines.length > 0) {
    sections.push('**Do NOT use when:**\n' + avoidLines.join('\n'));
  }

  // API surface summary
  const apiCategories: string[] = [];
  if (skill.functions.length > 0) apiCategories.push(`${skill.functions.length} functions`);
  if (skill.classes.length > 0) apiCategories.push(`${skill.classes.length} classes`);
  if (skill.types.length > 0) apiCategories.push(`${skill.types.length} types`);
  if (skill.enums.length > 0) apiCategories.push(`${skill.enums.length} enums`);
  if (skill.variables && skill.variables.length > 0)
    apiCategories.push(`${skill.variables.length} constants`);
  if (apiCategories.length > 0) {
    sections.push(`API surface: ${apiCategories.join(', ')}`);
  }

  return '## When to Use\n\n' + sections.join('\n\n');
}

function renderNeverRules(skill: ExtractedSkill): string {
  if (!skill.pitfalls || skill.pitfalls.length === 0) return '';
  const lines: string[] = [];
  for (const item of skill.pitfalls) {
    lines.push(`- ${item}`);
  }
  return '## NEVER\n\n' + lines.join('\n');
}

/** Extract the first sentence (or first meaningful phrase) from a description */
function firstSentence(desc: string): string {
  if (!desc) return '';
  const match = desc.match(/^[^.!?]*[.!?]/);
  if (match) return match[0].trim().replace(/[.!?]$/, '');
  // No sentence terminator — use up to first comma or 60 chars
  const commaIdx = desc.indexOf(',');
  if (commaIdx > 0 && commaIdx <= 60) return desc.slice(0, commaIdx).trim();
  if (desc.length <= 60) return desc.trim();
  return desc.slice(0, 57).trim() + '...';
}

/** Format an item as "`Name` (desc)" — omit desc when empty */
function compactItem(name: string, description: string): string {
  const label = firstSentence(description);
  return label ? `\`${name}\` (${label})` : `\`${name}\``;
}

/** Max lines of Quick Reference content (after heading) before truncation */
const QUICK_REF_MAX_LINES = 30;
const QUICK_REF_KEEP_LINES = 25;

function renderQuickReference(skill: ExtractedSkill): string {
  const allItems = [
    ...skill.functions,
    ...skill.classes,
    ...skill.types,
    ...skill.enums,
    ...(skill.variables ?? [])
  ];

  if (allItems.length === 0) return '';

  const totalCount = allItems.length;

  // For large packages (30+ exports): only show "important" items — those with
  // @useWhen, @category, or @remarks tags (author marked them as key decision points).
  // Dump the rest with just a count pointing to references/.
  const isLargePackage = totalCount > 30;

  type AnyItem = {
    name: string;
    description?: string;
    category?: string;
    tags?: Record<string, string>;
    remarks?: string;
  };
  const isImportant = (item: AnyItem): boolean => {
    if (item.category) return true;
    if (item.remarks) return true;
    if (item.tags?.['useWhen'] || item.tags?.['avoidWhen'] || item.tags?.['never']) return true;
    return false;
  };

  let contentLines: string[];

  if (isLargePackage) {
    // Filter to important items only
    const importantItems = (allItems as AnyItem[]).filter(isImportant);
    const importantFunctions = skill.functions.filter(isImportant);
    const importantClasses = skill.classes.filter(isImportant);

    if (importantItems.length > 0) {
      contentLines = [];
      if (importantFunctions.length > 0) {
        const entries = importantFunctions.map((f) => compactItem(f.name, f.description));
        contentLines.push(`**Key functions:** ${entries.join(', ')}`);
      }
      if (importantClasses.length > 0) {
        const entries = importantClasses.map((c) => compactItem(c.name, c.description));
        contentLines.push(`**Key classes:** ${entries.join(', ')}`);
      }
      contentLines.push('');
      contentLines.push(`*${totalCount} exports total — see references/ for full API.*`);
    } else {
      // No items marked as important — show a count-only summary
      const apiCategories: string[] = [];
      if (skill.functions.length > 0) apiCategories.push(`${skill.functions.length} functions`);
      if (skill.classes.length > 0) apiCategories.push(`${skill.classes.length} classes`);
      if (skill.types.length > 0) apiCategories.push(`${skill.types.length} types`);
      if (skill.enums.length > 0) apiCategories.push(`${skill.enums.length} enums`);
      if (skill.variables && skill.variables.length > 0)
        apiCategories.push(`${skill.variables.length} constants`);
      contentLines = [
        `${totalCount} exports (${apiCategories.join(', ')}) — see references/ for full API.`
      ];
    }
  } else if (hasModuleInfo(allItems)) {
    // Medium packages with module grouping — show all, grouped
    const groups = groupByModule(allItems);
    contentLines = [];
    for (const [mod, modItems] of groups) {
      const entries = modItems.map((item) => {
        const name = 'name' in item ? (item as { name: string }).name : '';
        const desc = 'description' in item ? (item as { description: string }).description : '';
        return compactItem(name, desc);
      });
      if (mod) {
        contentLines.push(`**${mod}:** ${entries.join(', ')}`);
      } else {
        contentLines.push(entries.join(', '));
      }
    }
  } else {
    // Small packages — show all, flat by kind
    contentLines = [];
    if (skill.functions.length > 0) {
      const entries = skill.functions.map((f) => compactItem(f.name, f.description));
      contentLines.push(`**Functions:** ${entries.join(', ')}`);
    }
    if (skill.classes.length > 0) {
      const entries = skill.classes.map((c) => compactItem(c.name, c.description));
      contentLines.push(`**Classes:** ${entries.join(', ')}`);
    }
    if (skill.types.length > 0) {
      const entries = skill.types.map((t) => compactItem(t.name, t.description));
      contentLines.push(`**Types:** ${entries.join(', ')}`);
    }
    if (skill.enums.length > 0) {
      const entries = skill.enums.map((e) => compactItem(e.name, e.description));
      contentLines.push(`**Enums:** ${entries.join(', ')}`);
    }
    if (skill.variables && skill.variables.length > 0) {
      const entries = skill.variables.map((v) => compactItem(v.name, v.description));
      contentLines.push(`**Constants:** ${entries.join(', ')}`);
    }
  }

  // Final cap as safety net
  let body = contentLines.join('\n');
  const renderedLines = body.split('\n');
  if (renderedLines.length > QUICK_REF_MAX_LINES) {
    body = renderedLines.slice(0, QUICK_REF_KEEP_LINES).join('\n');
    body += `\n\n*${totalCount} exports total — see references/ for full API.*`;
  }

  return '## Quick Reference\n\n' + body;
}

function toSkillName(name: string): string {
  return name
    .replace(/^@/, '') // strip npm scope @
    .replace(/\//g, '-') // scope separator → hyphen
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase → kebab-case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2') // XMLParser → xml-parser
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // strip invalid chars
    .replace(/-+/g, '-') // collapse hyphens
    .replace(/^-|-$/g, ''); // trim leading/trailing
}

function toFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
