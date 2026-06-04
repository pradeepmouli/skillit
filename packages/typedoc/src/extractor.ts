import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type ProjectReflection,
  DeclarationReflection,
  ReflectionKind,
  type SignatureReflection,
  type ParameterReflection,
  type Comment
} from 'typedoc';
import type {
  ExtractedSkill,
  ExtractedFunction,
  ExtractedClass,
  ExtractedType,
  ExtractedEnum,
  ExtractedVariable,
  ExtractedParameter,
  ExtractedProperty,
  ExtractedDocument,
  ExtractedConfigSurface,
  ExtractedConfigOption
} from '@skillit/core';

/** Package metadata to enrich extracted skills */
export interface PackageMetadata {
  /** Package name from package.json (preferred over TypeDoc project name) */
  name?: string;
  description?: string;
  keywords?: string[];
  repository?: string;
  author?: string;
}

/** Recursively collect all exportable children, flattening nested modules */
function collectChildren(mod: DeclarationReflection): DeclarationReflection[] {
  const result: DeclarationReflection[] = [];
  for (const child of mod.children ?? []) {
    if (child.kind === ReflectionKind.Module || child.kind === ReflectionKind.Namespace) {
      result.push(...collectChildren(child));
    } else {
      result.push(child);
    }
  }
  return result;
}

/**
 * Extract structured API info from the TypeDoc reflection tree.
 *
 * Walks the TypeDoc project reflection, collecting functions, classes, types,
 * enums, variables, config surfaces, and documents into ExtractedSkill objects.
 *
 * @category Extraction
 * @useWhen
 * - You are building a custom TypeDoc plugin that needs ExtractedSkill data without the full plugin pipeline
 * - You want to post-process or filter extracted skills before rendering
 * @never
 * - NEVER call with an empty project reflection — produces a skill with no exports, which the audit flags as fatal
 * - NEVER assume module names match package.json names — TypeDoc may use directory names as module identifiers
 */
export function extractSkills(
  project: ProjectReflection,
  perPackage: boolean,
  metadata?: PackageMetadata
): ExtractedSkill[] {
  const children = project.children ?? [];
  const documents = extractDocuments(project);

  const modules = children.filter(
    (c) => c.kind === ReflectionKind.Module || c.kind === ReflectionKind.Namespace
  );

  if (modules.length > 0 && perPackage) {
    // Group modules by their resolved package name, then merge into one skill per package.
    // Modules that can't resolve a package name are merged into the fallback group
    // (metadata name or project name) — prevents internal submodules like "array"
    // or "string" from becoming separate skills.
    const fallbackName = metadata?.name || project.name || '(root)';
    const grouped = groupModulesByPackage(modules, fallbackName);
    return Array.from(grouped.entries()).map(([pkgName, mods]) => {
      const perPkgMeta = metadata
        ? { ...metadata, name: pkgName || undefined }
        : { name: pkgName || undefined };
      return mergeModules(mods, perPkgMeta, documents);
    });
  }

  // Single package: root package.json name takes priority
  return [extractModule(project as unknown as DeclarationReflection, metadata, documents)];
}

/** Group modules by their resolved npm package name */
function groupModulesByPackage(
  modules: DeclarationReflection[],
  fallbackName: string
): Map<string, DeclarationReflection[]> {
  const groups = new Map<string, DeclarationReflection[]>();
  for (const mod of modules) {
    // Use the resolved package name, or fall back to the parent package name.
    // Never use mod.name as a group key — it's an internal module name like
    // "array" or "string" that shouldn't become its own skill.
    const pkgName = resolvePackageName(mod) || fallbackName;
    const existing = groups.get(pkgName);
    if (existing) {
      existing.push(mod);
    } else {
      groups.set(pkgName, [mod]);
    }
  }
  return groups;
}

/** Merge multiple modules (submodules of one package) into a single skill */
function mergeModules(
  mods: DeclarationReflection[],
  metadata?: PackageMetadata,
  documents?: ExtractedDocument[]
): ExtractedSkill {
  const allFunctions: ExtractedFunction[] = [];
  const allClasses: ExtractedClass[] = [];
  const allTypes: ExtractedType[] = [];
  const allEnums: ExtractedEnum[] = [];
  const allVariables: ExtractedVariable[] = [];
  const allExamples: string[] = [];
  const allConfigSurfaces: ExtractedConfigSurface[] = [];
  let description = '';
  let remarks: string | undefined;

  for (const mod of mods) {
    // The module name from TypeDoc's reflection tree is the authoritative
    // grouping. Use it as sourceModule for all children of this module,
    // falling back to the file-path heuristic only when the module name
    // is empty or a root-level barrel export.
    const modName = mod.name || undefined;

    const children = collectChildren(mod);
    const fns = children
      .filter((c) => c.kind === ReflectionKind.Function)
      .map((c) => extractFunction(c));
    const classes = children.filter((c) => c.kind === ReflectionKind.Class).map(extractClass);

    const interfaceAndAliasChildren = children.filter(
      (c) => c.kind === ReflectionKind.Interface || c.kind === ReflectionKind.TypeAlias
    );
    const configInterfaceChildren = interfaceAndAliasChildren.filter((c) => isConfigInterface(c));
    const regularTypeChildren = interfaceAndAliasChildren.filter((c) => !isConfigInterface(c));

    const types = regularTypeChildren.map(extractType);
    const configSurfaces = configInterfaceChildren.map(extractConfigSurface);
    const enums = children.filter((c) => c.kind === ReflectionKind.Enum).map(extractEnum);
    const variables = children
      .filter((c) => c.kind === ReflectionKind.Variable)
      .map(extractVariable);

    // Stamp TypeDoc module name as sourceModule on items that don't already
    // have one from the file-path heuristic or @category. The module name
    // from the reflection tree respects the user's TypeDoc router config.
    if (modName) {
      for (const f of fns) {
        f.sourceModule ??= modName;
      }
      for (const c of classes) {
        c.sourceModule ??= modName;
      }
      for (const t of types) {
        t.sourceModule ??= modName;
      }
      for (const e of enums) {
        e.sourceModule ??= modName;
      }
      for (const v of variables) {
        v.sourceModule ??= modName;
      }
    }

    allFunctions.push(...fns);
    allClasses.push(...classes);
    allTypes.push(...types);
    allConfigSurfaces.push(...configSurfaces);
    allEnums.push(...enums);
    allVariables.push(...variables);
    allExamples.push(...getExamples(mod.comment));

    if (!description) {
      description = getCommentText(mod.comment);
    }
    if (!remarks) {
      remarks = getRemarks(mod.comment);
    }
  }

  const resolvedName = metadata?.name || mods[0]?.name || '';

  const skill: ExtractedSkill = {
    name: resolvedName,
    description,
    keywords: metadata?.keywords,
    repository: metadata?.repository,
    author: metadata?.author,
    packageDescription: metadata?.description,
    remarks,
    documents,
    functions: allFunctions,
    classes: allClasses,
    types: allTypes,
    enums: allEnums,
    variables: allVariables,
    examples: allExamples,
    ...(allConfigSurfaces.length > 0 ? { configSurfaces: allConfigSurfaces } : {})
  };
  aggregateSkillTags(skill);
  return skill;
}

function extractModule(
  mod: DeclarationReflection | ProjectReflection,
  metadata?: PackageMetadata,
  documents?: ExtractedDocument[]
): ExtractedSkill {
  const children = collectChildren(mod as DeclarationReflection);

  // Resolve the best name: metadata > source package.json > reflection name
  const resolvedName = metadata?.name || resolvePackageName(mod) || mod.name;

  // Separate config interfaces from regular types
  const interfaceAndAliasChildren = children.filter(
    (c) => c.kind === ReflectionKind.Interface || c.kind === ReflectionKind.TypeAlias
  );
  const configInterfaceChildren = interfaceAndAliasChildren.filter((c) => isConfigInterface(c));
  const regularTypeChildren = interfaceAndAliasChildren.filter((c) => !isConfigInterface(c));
  const configSurfaces = configInterfaceChildren.map(extractConfigSurface);

  const skill: ExtractedSkill = {
    name: resolvedName,
    description: getCommentText(mod.comment),
    keywords: metadata?.keywords,
    repository: metadata?.repository,
    author: metadata?.author,
    packageDescription: metadata?.description,
    remarks: getRemarks(mod.comment),
    documents,
    functions: children
      .filter((c) => c.kind === ReflectionKind.Function)
      .map((c) => extractFunction(c)),
    classes: children.filter((c) => c.kind === ReflectionKind.Class).map(extractClass),
    types: regularTypeChildren.map(extractType),
    enums: children.filter((c) => c.kind === ReflectionKind.Enum).map(extractEnum),
    variables: children.filter((c) => c.kind === ReflectionKind.Variable).map(extractVariable),
    examples: getExamples(mod.comment),
    ...(configSurfaces.length > 0 ? { configSurfaces } : {})
  };
  aggregateSkillTags(skill);
  return skill;
}

/**
 * Fallback: extract module path from a declaration's source file.
 * Used when TypeDoc doesn't provide module context (single-package projects,
 * CLI extractor, etc.).
 */
function getSourceModuleFromPath(decl: DeclarationReflection): string | undefined {
  const source = decl.sources?.[0];
  if (!source) return undefined;
  const fullPath = source.fullFileName ?? source.fileName;
  if (!fullPath) return undefined;

  // Split into segments
  const segments = fullPath.replace(/\\/g, '/').split('/');

  // Find the src/ root (or packages/*/src/) to get the relative path
  let srcIndex = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i] === 'src') {
      srcIndex = i;
      break;
    }
  }

  if (srcIndex >= 0 && srcIndex < segments.length - 1) {
    // Get path segments between src/ and the file
    const relSegments = segments.slice(srcIndex + 1, -1); // exclude src/ and filename

    if (relSegments.length === 0) {
      // File directly in src/ — use filename
      const name = (segments[segments.length - 1] ?? '').replace(/\.[^.]+$/, '');
      return name === 'index' ? undefined : name || undefined;
    }

    // Use the first 2 directory levels for grouping
    // src/scene/sprite/Sprite.ts → "scene/sprite"
    // src/rendering/renderers/shared/system/X.ts → "rendering/renderers"
    const modulePath = relSegments.slice(0, 2).join('/');
    return modulePath || undefined;
  }

  // Fallback: use filename without extension
  const base = segments[segments.length - 1] ?? '';
  const name = base.replace(/\.[^.]+$/, '');
  if (name === 'index') return undefined;
  return name || undefined;
}

function extractFunction(
  decl: DeclarationReflection,
  parentDecl?: DeclarationReflection
): ExtractedFunction {
  const sig = decl.signatures?.[0];
  const overloads = (decl.signatures ?? []).slice(1).map((s) => formatSignature(decl.name, s));

  return {
    name: decl.name,
    description: getCommentText(sig?.comment ?? decl.comment),
    signature: formatSignature(decl.name, sig),
    parameters: (sig?.parameters ?? []).map(extractParameter),
    returnType: sig?.type?.toString() ?? 'void',
    returnsDescription: getReturnsDescription(sig?.comment ?? decl.comment),
    remarks: getRemarks(sig?.comment ?? decl.comment),
    examples: getExamples(sig?.comment ?? decl.comment),
    tags: getTagMap(sig?.comment ?? decl.comment),
    overloads: overloads.length > 0 ? overloads : undefined,
    sourceModule: getSourceModuleFromPath(parentDecl ?? decl),
    category: getCategory(sig?.comment ?? decl.comment)
  };
}

function extractClass(decl: DeclarationReflection): ExtractedClass {
  const children = decl.children ?? [];
  const ctor = children.find((c) => c.kind === ReflectionKind.Constructor);
  const methods = children
    .filter((c) => c.kind === ReflectionKind.Method && !c.flags.isPrivate)
    .map((m) => extractFunction(m, decl));
  const properties = children
    .filter((c) => c.kind === ReflectionKind.Property && !c.flags.isPrivate)
    .map(extractProperty);

  // Filter out self-references from extendedTypes (PixiJS uses mixins that
  // produce [ClassName, ActualParent] — the first entry is a self-reference)
  const extendedTypes = decl.extendedTypes
    ?.map((t) => t.toString())
    .filter((t) => {
      const baseName = t.replace(/<.*>$/, '');
      return baseName !== decl.name;
    });
  const implementedTypes = decl.implementedTypes?.map((t) => t.toString());

  return {
    name: decl.name,
    description: getCommentText(decl.comment),
    constructorSignature: ctor?.signatures?.[0]
      ? formatSignature('constructor', ctor.signatures[0])
      : '',
    methods,
    properties,
    examples: getExamples(decl.comment),
    tags: getTagMap(decl.comment),
    extends: extendedTypes?.[0],
    implements: implementedTypes && implementedTypes.length > 0 ? implementedTypes : undefined,
    sourceModule: getSourceModuleFromPath(decl),
    category: getCategory(decl.comment)
  };
}

function extractType(decl: DeclarationReflection): ExtractedType {
  // For interfaces, extract properties from children
  const properties: ExtractedProperty[] = [];
  if (decl.kind === ReflectionKind.Interface && decl.children) {
    for (const child of decl.children) {
      if (child.kind === ReflectionKind.Property || child.kind === ReflectionKind.Accessor) {
        properties.push(extractProperty(child));
      }
    }
  }

  return {
    name: decl.name,
    description: getCommentText(decl.comment),
    definition: decl.type?.toString() ?? '',
    properties: properties.length > 0 ? properties : undefined,
    sourceModule: getSourceModuleFromPath(decl),
    category: getCategory(decl.comment)
  };
}

function extractEnum(decl: DeclarationReflection): ExtractedEnum {
  return {
    name: decl.name,
    description: getCommentText(decl.comment),
    members: (decl.children ?? []).map((m) => ({
      name: m.name,
      value: m.type?.toString() ?? '',
      description: getCommentText(m.comment)
    })),
    sourceModule: getSourceModuleFromPath(decl),
    category: getCategory(decl.comment)
  };
}

function extractVariable(decl: DeclarationReflection): ExtractedVariable {
  return {
    name: decl.name,
    type: decl.type?.toString() ?? 'unknown',
    description: getCommentText(decl.comment),
    isConst: decl.flags.isConst,
    sourceModule: getSourceModuleFromPath(decl),
    category: getCategory(decl.comment)
  };
}

function extractParameter(param: ParameterReflection): ExtractedParameter {
  return {
    name: param.name,
    type: param.type?.toString() ?? 'unknown',
    description: getCommentText(param.comment),
    optional: param.flags.isOptional,
    defaultValue: param.defaultValue
  };
}

function extractProperty(decl: DeclarationReflection): ExtractedProperty {
  return {
    name: decl.name,
    type: decl.type?.toString() ?? 'unknown',
    description: getCommentText(decl.comment),
    optional: decl.flags.isOptional
  };
}

function formatSignature(name: string, sig: SignatureReflection | undefined): string {
  if (!sig) return `${name}()`;
  const params = (sig.parameters ?? [])
    .map((p) => {
      const opt = p.flags.isOptional ? '?' : '';
      return `${p.name}${opt}: ${p.type?.toString() ?? 'unknown'}`;
    })
    .join(', ');
  const typeParams = sig.typeParameters?.length
    ? `<${sig.typeParameters.map((t) => t.name).join(', ')}>`
    : '';
  const ret = sig.type?.toString() ?? 'void';
  return `${name}${typeParams}(${params}): ${ret}`;
}

function getCommentText(comment: Comment | undefined): string {
  if (!comment) return '';
  return comment.summary
    .map((part) => part.text)
    .join('')
    .trim();
}

function getReturnsDescription(comment: Comment | undefined): string | undefined {
  if (!comment) return undefined;
  const returnsTag = comment.getTag('@returns');
  if (!returnsTag) return undefined;
  const text = returnsTag.content
    .map((part) => part.text)
    .join('')
    .trim();
  return text || undefined;
}

function getExamples(comment: Comment | undefined): string[] {
  if (!comment) return [];
  return comment
    .getTags('@example')
    .map((tag) =>
      tag.content
        .map((part) => part.text)
        .join('')
        .trim()
    )
    .filter(Boolean);
}

/** A document reflection from TypeDoc's tree (typed loosely to avoid version coupling) */
interface DocReflection {
  name: string;
  content?: Array<{ kind?: string; text: string; target?: { name?: string } }>;
  children?: DocReflection[];
  frontmatter?: Record<string, unknown>;
}

/** Extract projectDocuments from the TypeDoc reflection tree, recursing into children */
function extractDocuments(project: ProjectReflection): ExtractedDocument[] {
  const docs: ExtractedDocument[] = [];
  const projectDocs = (project as unknown as { documents?: DocReflection[] }).documents;
  if (projectDocs) {
    collectDocuments(projectDocs, docs);
  }

  // Deduplicate titles — append category when names collide (e.g. multiple "Overview" docs)
  const titleCounts = new Map<string, number>();
  for (const doc of docs) {
    titleCounts.set(doc.title, (titleCounts.get(doc.title) ?? 0) + 1);
  }
  for (const doc of docs) {
    if ((titleCounts.get(doc.title) ?? 0) > 1 && doc.category) {
      doc.title = `${doc.category} — ${doc.title}`;
    }
  }

  return docs;
}

function collectDocuments(reflections: DocReflection[], out: ExtractedDocument[]): void {
  for (const doc of reflections) {
    const content = renderDocContent(doc.content);
    if (content) {
      const category =
        typeof doc.frontmatter?.['category'] === 'string' ? doc.frontmatter['category'] : undefined;
      const description =
        typeof doc.frontmatter?.['description'] === 'string'
          ? doc.frontmatter['description']
          : undefined;
      const isParent = (doc.children?.length ?? 0) > 0;

      // Extract API references from "## API reference" section ({@link Foo} items)
      const apiRefs = extractApiReferences(doc.content);

      out.push({
        title: doc.name,
        content,
        category,
        description,
        isParent: isParent || undefined,
        apiRefs: apiRefs.length > 0 ? apiRefs : undefined
      });
    }
    // Recurse into children (TypeDoc's @document children frontmatter)
    if (doc.children?.length) {
      collectDocuments(doc.children, out);
    }
  }
}

/** Render document content parts, converting {@link} tags to backtick-wrapped names */
function renderDocContent(
  parts?: Array<{ kind?: string; text: string; target?: { name?: string } }>
): string {
  if (!parts) return '';
  return parts
    .map((part) => {
      if (part.kind === 'inline-tag') {
        // Use target.name if available (resolved link), otherwise extract from text
        const name = part.target?.name ?? part.text?.trim();
        return name ? `\`${name}\`` : part.text;
      }
      return part.text;
    })
    .join('')
    .trim();
}

/** Extract class/type names from {@link} tags in the "## API reference" section */
function extractApiReferences(
  parts?: Array<{ kind?: string; text: string; target?: { name?: string } }>
): string[] {
  if (!parts) return [];
  const refs: string[] = [];
  let inApiSection = false;
  for (const part of parts) {
    if (part.text?.includes('## API reference')) {
      inApiSection = true;
    }
    if (inApiSection && part.kind === 'inline-tag') {
      const name = part.target?.name ?? part.text?.trim();
      if (name) refs.push(name);
    }
  }
  return refs;
}

/**
 * Resolve the npm package name from a module's source files.
 * Walks up from the first source file to find the nearest package.json.
 * This handles entryPointStrategy: "packages" where TypeDoc uses internal
 * module names instead of npm package names.
 */
function resolvePackageName(mod: DeclarationReflection | ProjectReflection): string | undefined {
  // Get source file path from the module or its first child
  const sources = (mod as DeclarationReflection).sources;
  const firstSource = sources?.[0]?.fullFileName ?? sources?.[0]?.fileName;

  if (!firstSource) {
    // Try children's sources
    const children = (mod as DeclarationReflection).children ?? [];
    for (const child of children) {
      const childSource = child.sources?.[0]?.fullFileName ?? child.sources?.[0]?.fileName;
      if (childSource) {
        return findPackageName(childSource);
      }
    }
    return undefined;
  }

  return findPackageName(firstSource);
}

/** Walk up from a file path to find the nearest package.json name */
function findPackageName(filePath: string): string | undefined {
  let dir = dirname(filePath);

  for (let i = 0; i < 10; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
          name?: string;
          private?: boolean;
        };
        // Skip private workspace roots — keep looking for the actual package
        if (pkg.name && !pkg.private) {
          return pkg.name;
        }
        // If it's private but has a name and we're not at the workspace root, use it
        if (pkg.name && dir.includes('packages')) {
          return pkg.name;
        }
      } catch {
        // ignore parse errors
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return undefined;
}

function getTagMap(comment: Comment | undefined): Record<string, string> {
  if (!comment) return {};
  const tags: Record<string, string> = {};
  for (const tag of comment.blockTags) {
    const key = tag.tag.replace(/^@/, '');
    if (key !== 'example' && key !== 'param' && key !== 'returns') {
      tags[key] = tag.content
        .map((part) => part.text)
        .join('')
        .trim();
    }
  }
  return tags;
}

function getRemarks(comment: Comment | undefined): string | undefined {
  if (!comment) return undefined;
  const remarksTag = comment.getTag('@remarks');
  if (!remarksTag) return undefined;
  const text = remarksTag.content
    .map((part) => part.text)
    .join('')
    .trim();
  return text || undefined;
}

function getCategory(comment: Comment | undefined): string | undefined {
  if (!comment) return undefined;
  const tag = comment.getTag('@category');
  if (!tag) return undefined;
  const text = tag.content
    .map((part) => part.text)
    .join('')
    .trim();
  return text || undefined;
}

// ── Config interface detection & extraction ─────────────────────────────────

const CONFIG_SUFFIXES = ['Options', 'Config', 'Configuration', 'Settings'];

function isConfigInterface(decl: DeclarationReflection): boolean {
  // Explicit @config tag
  if (decl.comment?.getTag('@config')) return true;
  // Name suffix at PascalCase word boundary
  const name = decl.name;
  for (const suffix of CONFIG_SUFFIXES) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      const charBefore = name[name.length - suffix.length - 1];
      if (charBefore && charBefore === charBefore.toLowerCase()) return true;
    }
  }
  return false;
}

function extractConfigOption(decl: DeclarationReflection): ExtractedConfigOption {
  const comment = decl.comment;
  const useWhenTag = comment?.getTag('@useWhen');
  const avoidWhenTag = comment?.getTag('@avoidWhen');
  const pitfallsTag = comment?.getTag('@never');
  const remarksTag = comment?.getTag('@remarks');

  const useWhenText = useWhenTag?.content.map((p) => p.text).join('') ?? '';
  const avoidWhenText = avoidWhenTag?.content.map((p) => p.text).join('') ?? '';
  const pitfallsText = pitfallsTag?.content.map((p) => p.text).join('') ?? '';
  const remarksText =
    remarksTag?.content
      .map((p) => p.text)
      .join('')
      .trim() ?? '';

  const useWhen = useWhenText ? parseBulletList(useWhenText) : undefined;
  const avoidWhen = avoidWhenText ? parseBulletList(avoidWhenText) : undefined;
  const pitfalls = pitfallsText ? parseBulletList(pitfallsText) : undefined;

  return {
    name: decl.name,
    type: decl.type?.toString() ?? 'unknown',
    description: getCommentText(comment),
    required: !decl.flags.isOptional,
    ...(useWhen && useWhen.length > 0 ? { useWhen } : {}),
    ...(avoidWhen && avoidWhen.length > 0 ? { avoidWhen } : {}),
    ...(pitfalls && pitfalls.length > 0 ? { pitfalls } : {}),
    ...(remarksText ? { remarks: remarksText } : {}),
    category: getCategory(comment)
  };
}

function extractConfigSurface(decl: DeclarationReflection): ExtractedConfigSurface {
  const options: ExtractedConfigOption[] = [];
  // Interfaces and type aliases with object structure both have children
  if (decl.children) {
    for (const child of decl.children) {
      if (child.kind === ReflectionKind.Property || child.kind === ReflectionKind.Accessor) {
        options.push(extractConfigOption(child));
      }
    }
  }

  const comment = decl.comment;
  const useWhenTag = comment?.getTag('@useWhen');
  const avoidWhenTag = comment?.getTag('@avoidWhen');
  const pitfallsTag = comment?.getTag('@never');
  const remarksTag = comment?.getTag('@remarks');

  const useWhenText = useWhenTag?.content.map((p) => p.text).join('') ?? '';
  const avoidWhenText = avoidWhenTag?.content.map((p) => p.text).join('') ?? '';
  const pitfallsText = pitfallsTag?.content.map((p) => p.text).join('') ?? '';
  const remarksText =
    remarksTag?.content
      .map((p) => p.text)
      .join('')
      .trim() ?? '';

  const useWhen = useWhenText ? parseBulletList(useWhenText) : undefined;
  const avoidWhen = avoidWhenText ? parseBulletList(avoidWhenText) : undefined;
  const pitfalls = pitfallsText ? parseBulletList(pitfallsText) : undefined;

  return {
    name: decl.name,
    description: getCommentText(comment),
    sourceType: 'config',
    options,
    ...(useWhen && useWhen.length > 0 ? { useWhen } : {}),
    ...(avoidWhen && avoidWhen.length > 0 ? { avoidWhen } : {}),
    ...(pitfalls && pitfalls.length > 0 ? { pitfalls } : {}),
    ...(remarksText ? { remarks: remarksText } : {})
  };
}

/** Parse a multi-line bullet list from a tag value into individual items */
export function parseBulletList(text: string): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const hasBullets = lines.some((l) => /^[-*]\s/.test(l));

  // No bullets anywhere — split on blank-line-separated paragraphs
  if (!hasBullets) {
    return text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\n/g, ' ').trim())
      .filter(Boolean);
  }

  // Has bullets — parse with continuation line joining
  const items: string[] = [];
  let lastWasBullet = false;
  for (const line of lines) {
    if (/^[-*]\s/.test(line)) {
      items.push(line.replace(/^[-*]\s*/, '').trim());
      lastWasBullet = true;
    } else if (lastWasBullet && items.length > 0) {
      items[items.length - 1] += ' ' + line;
    } else {
      items.push(line);
      lastWasBullet = false;
    }
  }
  return items;
}

function aggregateSkillTags(skill: ExtractedSkill): void {
  const useWhen: string[] = [];
  const useWhenSources: Array<{
    text: string;
    sourceName: string;
    sourceKind: string;
    sourceDescription?: string;
  }> = [];
  const avoidWhen: string[] = [];
  const avoidWhenSources: Array<{
    text: string;
    sourceName: string;
    sourceKind: string;
    sourceDescription?: string;
  }> = [];
  const pitfalls: string[] = [];

  // Collect from functions
  for (const fn of skill.functions) {
    if (fn.tags['useWhen']) {
      const items = parseBulletList(fn.tags['useWhen']);
      useWhen.push(...items);
      for (const item of items) {
        useWhenSources.push({
          text: item,
          sourceName: fn.name,
          sourceKind: 'function',
          sourceDescription: fn.description
        });
      }
    }
    if (fn.tags['avoidWhen']) {
      const items = parseBulletList(fn.tags['avoidWhen']);
      avoidWhen.push(...items);
      for (const item of items) {
        avoidWhenSources.push({
          text: item,
          sourceName: fn.name,
          sourceKind: 'function',
          sourceDescription: fn.description
        });
      }
    }
    if (fn.tags['never']) pitfalls.push(...parseBulletList(fn.tags['never']));
  }

  // Collect from classes
  for (const cls of skill.classes) {
    if (cls.tags['useWhen']) {
      const items = parseBulletList(cls.tags['useWhen']);
      useWhen.push(...items);
      for (const item of items) {
        useWhenSources.push({
          text: item,
          sourceName: cls.name,
          sourceKind: 'class',
          sourceDescription: cls.description
        });
      }
    }
    if (cls.tags['avoidWhen']) {
      const items = parseBulletList(cls.tags['avoidWhen']);
      avoidWhen.push(...items);
      for (const item of items) {
        avoidWhenSources.push({
          text: item,
          sourceName: cls.name,
          sourceKind: 'class',
          sourceDescription: cls.description
        });
      }
    }
    if (cls.tags['never']) pitfalls.push(...parseBulletList(cls.tags['never']));
  }

  if (useWhen.length > 0) skill.useWhen = useWhen;
  if (useWhenSources.length > 0) skill.useWhenSources = useWhenSources;
  if (avoidWhen.length > 0) skill.avoidWhen = avoidWhen;
  if (avoidWhenSources.length > 0) skill.avoidWhenSources = avoidWhenSources;
  if (pitfalls.length > 0) skill.pitfalls = pitfalls;
}
