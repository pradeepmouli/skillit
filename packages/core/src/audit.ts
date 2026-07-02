import type { ExtractedSkill } from './types.js';
import type { AuditIssue, AuditPass, AuditResult, AuditSeverity } from './audit-types.js';
import { discoverDepSkillsSync } from './refine/dep-skills.js';

const GENERIC_KEYWORDS = new Set([
  'typescript',
  'javascript',
  'node',
  'nodejs',
  'npm',
  'library',
  'package',
  'utils',
  'utility',
  'helper',
  'tool',
  'framework'
]);

function issue(
  severity: AuditSeverity,
  code: string,
  file: string,
  line: number | null,
  symbol: string,
  message: string,
  suggestion: string
): AuditIssue {
  return { severity, code, file, line, symbol, message, suggestion };
}

function pass(code: string, message: string, detail?: string): AuditPass {
  return { code, message, detail };
}

// ---------------------------------------------------------------------------
// F1: package.json description must exist and be >10 chars
// ---------------------------------------------------------------------------
function checkF1(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const desc = skill.packageDescription?.trim() ?? '';
  if (!desc || desc.length <= 10) {
    issues.push(
      issue(
        'fatal',
        'F1',
        'package.json',
        null,
        'description',
        desc
          ? `package.json description is too short (${desc.length} chars, needs >10)`
          : 'package.json description is missing',
        'Add to package.json: "description": "[One sentence: what problem this library solves for the caller]"'
      )
    );
  } else {
    passing.push(pass('F1', 'package.json description exists and is meaningful', desc));
  }
}

// ---------------------------------------------------------------------------
// F2: keywords — 5+ entries, at least 3 non-generic
// ---------------------------------------------------------------------------
function checkF2(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const keywords = skill.keywords ?? [];
  const domainKeywords = keywords.filter((k) => !GENERIC_KEYWORDS.has(k.toLowerCase()));

  if (keywords.length < 5 || domainKeywords.length < 3) {
    issues.push(
      issue(
        'fatal',
        'F2',
        'package.json',
        null,
        'keywords',
        keywords.length < 5
          ? `Only ${keywords.length} keyword(s) found (need ≥5)`
          : `Only ${domainKeywords.length} domain-specific keyword(s) (need ≥3 non-generic)`,
        'Add to package.json: "keywords": ["[domain-verb]", "[domain-noun]", "[use-case]", "[integration]", "[pattern]"]'
      )
    );
  } else {
    passing.push(
      pass(
        'F2',
        'Keywords meet requirements',
        `${keywords.length} total, ${domainKeywords.length} domain-specific`
      )
    );
  }
}

// ---------------------------------------------------------------------------
// F3: README description — blockquote or firstParagraph must exist, >20 chars
// ---------------------------------------------------------------------------
function checkF3(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const readme = skill.readme;
  const text = (readme?.blockquote?.trim() ?? '') || (readme?.firstParagraph?.trim() ?? '');

  if (!text || text.length <= 20) {
    issues.push(
      issue(
        'fatal',
        'F3',
        'README.md',
        null,
        'description',
        text
          ? `README description is too short (${text.length} chars, needs >20)`
          : 'README is missing a description (blockquote or first paragraph)',
        'Add after title: > [One sentence: what this library does and why someone would use it]'
      )
    );
  } else {
    passing.push(pass('F3', 'README description exists and is meaningful', text.slice(0, 60)));
  }
}

// ---------------------------------------------------------------------------
// F4: JSDoc on exports — every function/class/type/enum/variable must have non-empty description
// ---------------------------------------------------------------------------
function checkF4(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let allGood = true;

  for (const fn of skill.functions) {
    if (!fn.description?.trim()) {
      allGood = false;
      issues.push(
        issue(
          'fatal',
          'F4',
          `${fn.sourceModule ?? skill.name}.ts`,
          null,
          fn.name,
          `Function '${fn.name}' is missing a JSDoc description`,
          `Add: /** [One sentence: what problem ${fn.name} solves for the caller] */`
        )
      );
    }
  }

  for (const cls of skill.classes) {
    if (!cls.description?.trim()) {
      allGood = false;
      issues.push(
        issue(
          'fatal',
          'F4',
          `${cls.sourceModule ?? skill.name}.ts`,
          null,
          cls.name,
          `Class '${cls.name}' is missing a JSDoc description`,
          `Add: /** [One sentence: what problem ${cls.name} solves for the caller] */`
        )
      );
    }
  }

  for (const typ of skill.types) {
    if (!typ.description?.trim()) {
      allGood = false;
      issues.push(
        issue(
          'fatal',
          'F4',
          `${typ.sourceModule ?? skill.name}.ts`,
          null,
          typ.name,
          `Type '${typ.name}' is missing a JSDoc description`,
          `Add: /** [One sentence: what problem ${typ.name} solves for the caller] */`
        )
      );
    }
  }

  for (const enm of skill.enums) {
    if (!enm.description?.trim()) {
      allGood = false;
      issues.push(
        issue(
          'fatal',
          'F4',
          `${enm.sourceModule ?? skill.name}.ts`,
          null,
          enm.name,
          `Enum '${enm.name}' is missing a JSDoc description`,
          `Add: /** [One sentence: what problem ${enm.name} solves for the caller] */`
        )
      );
    }
  }

  for (const variable of skill.variables) {
    if (!variable.description?.trim()) {
      allGood = false;
      issues.push(
        issue(
          'fatal',
          'F4',
          `${variable.sourceModule ?? skill.name}.ts`,
          null,
          variable.name,
          `Variable '${variable.name}' is missing a JSDoc description`,
          `Add: /** [One sentence: what problem ${variable.name} solves for the caller] */`
        )
      );
    }
  }

  if (allGood) {
    passing.push(pass('F4', 'All exported symbols have JSDoc descriptions'));
  }
}

// ---------------------------------------------------------------------------
// E1: @param prose — every parameter must have non-empty description
//     that doesn't trivially restate the name or type
// ---------------------------------------------------------------------------
function isTrivialParamDesc(desc: string, paramName: string): boolean {
  // "The options" for param named "options" — but only check if description IS non-empty
  const normalized = desc
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '');
  return normalized === paramName.toLowerCase();
}

/** Check if a parameter is self-documenting from its name + type */
function isSelfDocumenting(name: string, type: string): boolean {
  const lowerName = name.toLowerCase();
  const lowerType = type.toLowerCase().replace(/[<>[\]|&? ]/g, '');

  // Name matches or contains the type name: texture: Texture, renderer: Renderer
  if (
    lowerType &&
    lowerName.includes(lowerType.replace(/partial|readonly|array/gi, '').toLowerCase())
  )
    return true;
  if (lowerType && lowerType.includes(lowerName)) return true;

  // Well-known options/config pattern: options: SpriteOptions, config: AppConfig
  if (
    /^(options|config|settings|props|params|args)$/i.test(name) &&
    /options|config|settings|props/i.test(type)
  )
    return true;

  // Common positional/dimensional names with numeric types
  if (
    /^(x|y|z|w|h|width|height|depth|index|count|length|size|offset|start|end|min|max|top|left|right|bottom|radius|angle|alpha|scale|rotation|delta|time|duration|delay|speed|priority)$/i.test(
      name
    ) &&
    /number|float|int/i.test(type)
  )
    return true;

  // Boolean flags where name implies meaning: visible, enabled, active, force
  if (
    /boolean/i.test(type) &&
    /^(is|has|can|should|will|force|enable|disable|visible|active|readonly|optional|required|recursive|deep|strict|lazy|async|sync|auto|skip|include|exclude)/.test(
      lowerName
    )
  )
    return true;

  // Callback/handler pattern: callback: () => void, handler: EventHandler
  if (
    /^(callback|handler|listener|fn|func|predicate|comparator|reducer|mapper|filter|resolver|reject|resolve)$/i.test(
      name
    )
  )
    return true;

  return false;
}

function checkE1(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let allGood = true;

  const checkParams = (
    fnName: string,
    sourceModule: string | undefined,
    params: (typeof skill.functions)[0]['parameters']
  ) => {
    for (const param of params) {
      if (!param.description?.trim() && !isSelfDocumenting(param.name, param.type)) {
        allGood = false;
        issues.push(
          issue(
            'error',
            'E1',
            `${sourceModule ?? skill.name}.ts`,
            null,
            `${fnName}#${param.name}`,
            `Parameter '${param.name}' in '${fnName}' is missing a description`,
            `Add: @param ${param.name} — [What the caller controls with this parameter — not the type, but the effect]`
          )
        );
      }
    }
  };

  for (const fn of skill.functions) {
    checkParams(fn.name, fn.sourceModule, fn.parameters);
  }

  for (const cls of skill.classes) {
    for (const method of cls.methods) {
      checkParams(`${cls.name}.${method.name}`, cls.sourceModule, method.parameters);
    }
  }

  if (allGood) {
    passing.push(pass('E1', 'All parameters have prose descriptions'));
  }
}

// ---------------------------------------------------------------------------
// E2: @returns — every function where returnType !== 'void' must have returnsDescription
// ---------------------------------------------------------------------------
function checkE2(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let allGood = true;

  const checkFn = (fn: (typeof skill.functions)[0], context: string, sourceModule?: string) => {
    if (fn.returnType && fn.returnType !== 'void' && !fn.returnsDescription?.trim()) {
      // Skip self-documenting returns: type matches function name, boolean predicates, this-returns
      const rt = fn.returnType.toLowerCase();
      const fnName = fn.name.toLowerCase();
      const isSelfDoc =
        rt.includes(fnName) ||
        fnName.includes(rt.replace(/[[\]<>|& ?]/g, '')) ||
        (rt === 'boolean' &&
          /^(is|has|can|should|contains|includes|equals|matches)/.test(fnName)) ||
        rt === 'this' ||
        rt === 'promise<void>';
      if (isSelfDoc) return;

      allGood = false;
      issues.push(
        issue(
          'error',
          'E2',
          `${sourceModule ?? skill.name}.ts`,
          null,
          context,
          `'${context}' returns '${fn.returnType}' but has no @returns description`,
          'Add: @returns [What the caller gets back and what they do with it]'
        )
      );
    }
  };

  for (const fn of skill.functions) {
    checkFn(fn, fn.name, fn.sourceModule);
  }

  for (const cls of skill.classes) {
    for (const method of cls.methods) {
      checkFn(method, `${cls.name}.${method.name}`, cls.sourceModule);
    }
  }

  if (allGood) {
    passing.push(pass('E2', 'All non-void functions have @returns descriptions'));
  }
}

// ---------------------------------------------------------------------------
// E3: Interface property JSDoc — every property in types[].properties must have description
// ---------------------------------------------------------------------------
function checkE3(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let allGood = true;

  for (const typ of skill.types) {
    if (!typ.properties) continue;
    for (const prop of typ.properties) {
      if (!prop.description?.trim()) {
        allGood = false;
        issues.push(
          issue(
            'error',
            'E3',
            `${typ.sourceModule ?? skill.name}.ts`,
            null,
            `${typ.name}.${prop.name}`,
            `Property '${prop.name}' in type '${typ.name}' is missing a JSDoc description`,
            'Add: /** [What this property controls — one phrase] */'
          )
        );
      }
    }
  }

  if (allGood) {
    passing.push(pass('E3', 'All interface/type properties have JSDoc descriptions'));
  }
}

// ---------------------------------------------------------------------------
// E4: @example exists — skill.examples.length > 0 OR any function has examples
// ---------------------------------------------------------------------------
function checkE4(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const hasSkillExamples = skill.examples.length > 0;
  const hasFunctionExamples = skill.functions.some((fn) => fn.examples.length > 0);

  if (!hasSkillExamples && !hasFunctionExamples) {
    issues.push(
      issue(
        'error',
        'E4',
        `${skill.name}.ts`,
        null,
        skill.name,
        'No @example tags found anywhere in the package',
        'Add @example with: import statement, setup, call, assertion/output'
      )
    );
  } else {
    passing.push(pass('E4', 'At least one @example exists in the package'));
  }
}

// ---------------------------------------------------------------------------
// E5: Repository — context.repository must be non-empty
// ---------------------------------------------------------------------------
function checkE5(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  if (!skill.repository?.trim()) {
    issues.push(
      issue(
        'error',
        'E5',
        'package.json',
        null,
        'repository',
        'package.json is missing a repository URL',
        'Add to package.json: "repository": { "type": "git", "url": "[repo-url]" }'
      )
    );
  } else {
    passing.push(pass('E5', 'Repository URL is present', skill.repository));
  }
}

// ---------------------------------------------------------------------------
// W1: @packageDocumentation — skill.description must be >50 chars
// ---------------------------------------------------------------------------
function checkW1(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const desc = skill.description?.trim() ?? '';
  if (desc.length <= 50) {
    issues.push(
      issue(
        'warning',
        'W1',
        `${skill.name}.ts`,
        null,
        skill.name,
        desc
          ? `Module-level description is too short (${desc.length} chars, needs >50)`
          : 'Module-level @packageDocumentation JSDoc is missing',
        'Add a /** @packageDocumentation */ comment with a detailed description (>50 chars)'
      )
    );
  } else {
    passing.push(
      pass('W1', 'Module-level description is sufficiently detailed', `${desc.length} chars`)
    );
  }
}

// ---------------------------------------------------------------------------
// W2: Per-function @example — every function should have examples
// ---------------------------------------------------------------------------
function checkW2(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let allGood = true;

  for (const fn of skill.functions) {
    if (fn.examples.length === 0) {
      allGood = false;
      issues.push(
        issue(
          'warning',
          'W2',
          `${fn.sourceModule ?? skill.name}.ts`,
          null,
          fn.name,
          `Function '${fn.name}' has no @example`,
          `Add an @example code block to the JSDoc for '${fn.name}'`
        )
      );
    }
  }

  if (allGood) {
    passing.push(pass('W2', 'Every function has at least one @example'));
  }
}

// ---------------------------------------------------------------------------
// W3: Tag usage — at least one function should have a non-empty value in tags
// ---------------------------------------------------------------------------
const NOTABLE_TAGS = new Set(['deprecated', 'since', 'throws', 'see']);

function checkW3(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const hasTaggedFn = skill.functions.some((fn) =>
    Object.entries(fn.tags).some(([key, val]) => NOTABLE_TAGS.has(key) && val.trim())
  );

  if (!hasTaggedFn) {
    issues.push(
      issue(
        'warning',
        'W3',
        `${skill.name}.ts`,
        null,
        skill.name,
        'No functions use @deprecated, @since, @throws, or @see tags',
        'Add relevant JSDoc tags to document version info, deprecations, errors thrown, or related links'
      )
    );
  } else {
    passing.push(pass('W3', 'At least one function uses notable JSDoc tags'));
  }
}

// ---------------------------------------------------------------------------
// W4: 10+ keywords — domain-specific keyword count >= 10
// ---------------------------------------------------------------------------
function checkW4(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const keywords = skill.keywords ?? [];
  const domainKeywords = keywords.filter((k) => !GENERIC_KEYWORDS.has(k.toLowerCase()));

  if (domainKeywords.length < 10) {
    issues.push(
      issue(
        'warning',
        'W4',
        'package.json',
        null,
        'keywords',
        `Only ${domainKeywords.length} domain-specific keyword(s) (recommended ≥10 for discoverability)`,
        'Add more domain-specific keywords to improve discoverability'
      )
    );
  } else {
    passing.push(
      pass('W4', 'Excellent keyword coverage', `${domainKeywords.length} domain-specific keywords`)
    );
  }
}

// ---------------------------------------------------------------------------
// W5: README Features — context.readme?.features must exist
// ---------------------------------------------------------------------------
function checkW5(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  if (!skill.readme?.features?.trim()) {
    const hasRemarks = !!skill.remarks;
    issues.push(
      issue(
        'warning',
        'W5',
        hasRemarks ? `${skill.name}.ts` : 'README.md',
        null,
        'features',
        'README is missing a Features section',
        hasRemarks
          ? 'README ## Features is a secondary source — already have @packageDocumentation @remarks as primary'
          : 'Add "## Features" to README.md, or add @packageDocumentation @remarks with capabilities overview (primary source, takes priority)'
      )
    );
  } else {
    passing.push(pass('W5', 'README has a Features section'));
  }
}

// ---------------------------------------------------------------------------
// W6: README Troubleshooting — context.readme?.troubleshooting must exist
// ---------------------------------------------------------------------------
function checkW6(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  if (!skill.readme?.troubleshooting?.trim()) {
    const hasNever = (skill.never ?? []).length > 0;
    issues.push(
      issue(
        'warning',
        'W6',
        hasNever ? `${skill.name}.ts` : 'README.md',
        null,
        'troubleshooting',
        'README is missing a Troubleshooting section',
        hasNever
          ? 'README ## Troubleshooting is a secondary source — already have @never tags as primary anti-patterns'
          : 'Add "## Troubleshooting" to README.md, or add @never tags to key exports with NEVER + Fix patterns (primary source)'
      )
    );
  } else {
    passing.push(pass('W6', 'README has a Troubleshooting section'));
  }
}

// ---------------------------------------------------------------------------
// Routing-tag credit: @useWhen/@avoidWhen/@never may live at the top level
// (MCP/TypeDoc skills) OR on a configSurface — either on the surface itself
// (CLI skills correlate them onto `configSurfaces[].useWhen` etc.) or on an
// individual option (config skills carry per-key routing on each option's
// `useWhen`/`avoidWhen`/`never`). Credit guidance found in any of those.
// ---------------------------------------------------------------------------
function hasRoutingTag(skill: ExtractedSkill, tag: 'useWhen' | 'avoidWhen' | 'never'): boolean {
  if ((skill[tag] ?? []).length > 0) return true;
  return (skill.configSurfaces ?? []).some(
    (surface) =>
      (surface[tag] ?? []).length > 0 ||
      surface.options.some((option) => (option[tag] ?? []).length > 0)
  );
}

// ---------------------------------------------------------------------------
// W7: @useWhen on at least one export
// ---------------------------------------------------------------------------
function checkW7(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const hasUseWhen = hasRoutingTag(skill, 'useWhen');

  if (!hasUseWhen) {
    issues.push(
      issue(
        'warning',
        'W7',
        `${skill.name}.ts`,
        null,
        skill.name,
        'No exports have a @useWhen tag',
        'Add @useWhen to 3-5 key exports: @useWhen - [Scenario where the caller should reach for this — include non-obvious expert knowledge]'
      )
    );
  } else {
    passing.push(pass('W7', 'At least one export has a @useWhen tag'));
  }
}

// ---------------------------------------------------------------------------
// W8: @avoidWhen on at least one export
// ---------------------------------------------------------------------------
function checkW8(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const hasAvoidWhen = hasRoutingTag(skill, 'avoidWhen');

  if (!hasAvoidWhen) {
    issues.push(
      issue(
        'warning',
        'W8',
        `${skill.name}.ts`,
        null,
        skill.name,
        'No exports have an @avoidWhen tag',
        'Add @avoidWhen: @avoidWhen - [When NOT to use this — name the alternative]'
      )
    );
  } else {
    passing.push(pass('W8', 'At least one export has an @avoidWhen tag'));
  }
}

// ---------------------------------------------------------------------------
// W9: @never on at least one export
// ---------------------------------------------------------------------------
function checkW9(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const hasPitfalls = hasRoutingTag(skill, 'never');

  if (!hasPitfalls) {
    issues.push(
      issue(
        'warning',
        'W9',
        `${skill.name}.ts`,
        null,
        skill.name,
        'No exports have a @never tag',
        'Add @never: @never - NEVER [action] — [non-obvious reason]. Fix: [recovery path]'
      )
    );
  } else {
    passing.push(pass('W9', 'At least one export has a @never tag'));
  }
}

// ---------------------------------------------------------------------------
// W10: @remarks on complex functions — functions with 3+ params should have @remarks
// ---------------------------------------------------------------------------
function checkW10(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let allGood = true;

  for (const fn of skill.functions) {
    if (fn.parameters.length >= 3 && !fn.remarks?.trim()) {
      allGood = false;
      issues.push(
        issue(
          'warning',
          'W10',
          `${fn.sourceModule ?? skill.name}.ts`,
          null,
          fn.name,
          `Function '${fn.name}' has ${fn.parameters.length} parameters but no @remarks`,
          `Add @remarks to '${fn.name}' to explain parameter interactions and usage nuances`
        )
      );
    }
  }

  if (allGood) {
    passing.push(pass('W10', 'All complex functions (3+ params) have @remarks'));
  }
}

// ---------------------------------------------------------------------------
// W11: @category for intentional grouping — at least one export should have @category
// ---------------------------------------------------------------------------
function checkW11(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const hasCategory =
    skill.functions.some((fn) => fn.category?.trim()) ||
    skill.classes.some((cls) => cls.category?.trim()) ||
    skill.types.some((typ) => typ.category?.trim()) ||
    skill.enums.some((enm) => enm.category?.trim()) ||
    skill.variables.some((v) => v.category?.trim());

  if (!hasCategory) {
    issues.push(
      issue(
        'warning',
        'W11',
        `${skill.name}.ts`,
        null,
        skill.name,
        'No exports have a @category tag',
        'Add @category <group> to exported symbols to enable intentional grouping in documentation'
      )
    );
  } else {
    passing.push(pass('W11', 'At least one export has a @category tag'));
  }
}

// ---------------------------------------------------------------------------
// W12: Dep-skill coverage — deps with skills should appear in ## See Also
// ---------------------------------------------------------------------------
function checkW12(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  if (!skill.rootDir) {
    passing.push(pass('W12', 'No rootDir set — dep-skill check skipped'));
    return;
  }
  const found = discoverDepSkillsSync(skill.rootDir);
  if (found.length === 0) {
    passing.push(pass('W12', 'No dep skills found'));
    return;
  }
  const covered = new Set((skill.seeAlso ?? []).map((r) => r.name));
  const missing = found.filter((r) => !covered.has(r.name));
  if (missing.length === 0) {
    passing.push(pass('W12', 'All dep skills referenced in ## See Also'));
    return;
  }
  for (const ref of missing) {
    issues.push(
      issue(
        'warning',
        'W12',
        'package.json',
        null,
        ref.name,
        `Dep '${ref.name}' has a skill at '${ref.path}' but is missing from ## See Also`,
        'Run `skillit gen` to populate the ## See Also section with dep skill references'
      )
    );
  }
}

// ---------------------------------------------------------------------------
// A1: Generic keywords — for each generic keyword present, emit alert
// ---------------------------------------------------------------------------
function checkA1(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const keywords = skill.keywords ?? [];
  const genericFound = keywords.filter((k) => GENERIC_KEYWORDS.has(k.toLowerCase()));

  for (const kw of genericFound) {
    issues.push(
      issue(
        'alert',
        'A1',
        'package.json',
        null,
        `keywords[${kw}]`,
        `Keyword '${kw}' is too generic and adds little discoverability value`,
        `Replace '${kw}' with a more specific, domain-relevant keyword`
      )
    );
  }

  if (genericFound.length === 0) {
    passing.push(pass('A1', 'No generic keywords found'));
  }
}

// ---------------------------------------------------------------------------
// A2: @param restates type — description that is just "The {type}" or "The {name}"
//     (only when description IS non-empty — E1 catches empty ones)
// ---------------------------------------------------------------------------
function checkA2(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let anyRestating = false;

  const checkParams = (
    fnName: string,
    sourceModule: string | undefined,
    params: (typeof skill.functions)[0]['parameters']
  ) => {
    for (const param of params) {
      const desc = param.description?.trim();
      if (!desc) continue; // E1 handles empty — skip here

      if (isTrivialParamDesc(desc, param.name)) {
        anyRestating = true;
        issues.push(
          issue(
            'alert',
            'A2',
            `${sourceModule ?? skill.name}.ts`,
            null,
            `${fnName}#${param.name}`,
            `Parameter '${param.name}' description trivially restates the name: "${desc}"`,
            `Replace the description with meaningful prose explaining the purpose of '${param.name}'`
          )
        );
      }
    }
  };

  for (const fn of skill.functions) {
    checkParams(fn.name, fn.sourceModule, fn.parameters);
  }

  for (const cls of skill.classes) {
    for (const method of cls.methods) {
      checkParams(`${cls.name}.${method.name}`, cls.sourceModule, method.parameters);
    }
  }

  if (!anyRestating) {
    passing.push(pass('A2', 'No parameters trivially restate their name'));
  }
}

// ---------------------------------------------------------------------------
// A3: Trivial @example — example is a single line with no import, no assignment, no comment
// ---------------------------------------------------------------------------
function isTrivialExample(example: string): boolean {
  const lines = example
    .trim()
    .split('\n')
    .filter((l) => l.trim());
  if (lines.length !== 1) return false;
  const line = (lines[0] ?? '').trim();
  if (line.startsWith('import ') || line.startsWith('//') || line.includes('=')) return false;
  return true;
}

function checkA3(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let anyTrivial = false;

  const checkExamples = (symbol: string, sourceModule: string | undefined, examples: string[]) => {
    for (const ex of examples) {
      if (isTrivialExample(ex)) {
        anyTrivial = true;
        issues.push(
          issue(
            'alert',
            'A3',
            `${sourceModule ?? skill.name}.ts`,
            null,
            symbol,
            `'${symbol}' has a trivial @example (single line, no import/assignment/comment)`,
            `Expand the example to show a realistic usage pattern with imports and context`
          )
        );
      }
    }
  };

  for (const fn of skill.functions) {
    checkExamples(fn.name, fn.sourceModule, fn.examples);
  }

  for (const ex of skill.examples) {
    if (isTrivialExample(ex)) {
      anyTrivial = true;
      issues.push(
        issue(
          'alert',
          'A3',
          `${skill.name}.ts`,
          null,
          skill.name,
          `Package-level example is trivial (single line, no import/assignment/comment)`,
          `Expand the example to show a realistic usage pattern with imports and context`
        )
      );
    }
  }

  if (!anyTrivial) {
    passing.push(pass('A3', 'All examples are non-trivial'));
  }
}

// ---------------------------------------------------------------------------
// A4: Quick Start quality — recommend @example when README fallback is too long
// ---------------------------------------------------------------------------
function checkA4(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const quickStart = skill.readme?.quickStart;
  const hasCodeExample = skill.functions.some((f) => f.examples.length > 0);

  // If README Quick Start is long and no @example exists, recommend the primary source
  if (quickStart && !hasCodeExample) {
    const quickStartLines = quickStart.split('\n').length;
    if (quickStartLines > 20) {
      issues.push(
        issue(
          'warning',
          'A4',
          `${skill.name}.ts`,
          null,
          'quickStart',
          `README Quick Start is ${quickStartLines} lines — too long for inline SKILL.md rendering`,
          'Add @example to a key exported function with a focused 5-10 line snippet. @example takes priority over README Quick Start and produces a leaner SKILL.md'
        )
      );
      return;
    }
  }

  if (!quickStart) {
    passing.push(pass('A4', 'No Quick Start section to check'));
    return;
  }

  // Find code blocks and check their line counts
  const codeBlockRegex = /```[\s\S]*?```/g;
  const blocks = quickStart.match(codeBlockRegex) ?? [];
  let anyVerbose = false;

  for (const block of blocks) {
    const lines = block.split('\n').length;
    if (lines > 15) {
      anyVerbose = true;
      issues.push(
        issue(
          'alert',
          'A4',
          'README.md',
          null,
          'quickStart',
          `Quick Start code block is ${lines} lines (recommended ≤15)`,
          'Add @example to a key export with a focused snippet — @example trumps README Quick Start'
        )
      );
    }
  }

  if (!anyVerbose) {
    passing.push(pass('A4', 'Quick Start code blocks are concise'));
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the documentation audit on a single extracted skill.
 *
 * Executes 20+ checks across fatal/error/warning/alert severity levels and returns
 * a structured result with issues, passing checks, and summary counts.
 *
 * @param skill - The extracted skill (the IR) whose exports/JSDoc plus project
 *   metadata (description, README, keywords, repository) are checked. The audit
 *   is a pure function of this IR — no separate context channel.
 * @returns The audit result: collected issues, passing checks, and summary counts.
 * @category Audit
 * @useWhen
 * - You want programmatic quality feedback on JSDoc coverage before publishing skills
 * - Building a CI gate that blocks PRs with undocumented exports
 * @avoidWhen
 * - Rapid local iteration where audit noise slows you down — use the skillsAudit: false option instead
 */
export function auditSkill(skill: ExtractedSkill): AuditResult {
  const issues: AuditIssue[] = [];
  const passing: AuditPass[] = [];

  // Fatal checks
  checkF1(skill, issues, passing);
  checkF2(skill, issues, passing);
  checkF3(skill, issues, passing);
  checkF4(skill, issues, passing);

  // Error checks
  checkE1(skill, issues, passing);
  checkE2(skill, issues, passing);
  checkE3(skill, issues, passing);
  checkE4(skill, issues, passing);
  checkE5(skill, issues, passing);

  // Warning checks
  checkW1(skill, issues, passing);
  checkW2(skill, issues, passing);
  checkW3(skill, issues, passing);
  checkW4(skill, issues, passing);
  checkW5(skill, issues, passing);
  checkW6(skill, issues, passing);
  checkW7(skill, issues, passing);
  checkW8(skill, issues, passing);
  checkW9(skill, issues, passing);
  checkW10(skill, issues, passing);
  checkW11(skill, issues, passing);
  checkW12(skill, issues, passing);

  // Alert checks
  checkA1(skill, issues, passing);
  checkA2(skill, issues, passing);
  checkA3(skill, issues, passing);
  checkA4(skill, issues, passing);

  const summary: Record<AuditSeverity, number> = { fatal: 0, error: 0, warning: 0, alert: 0 };
  for (const iss of issues) summary[iss.severity]++;

  return { package: skill.name, summary, issues, passing };
}
