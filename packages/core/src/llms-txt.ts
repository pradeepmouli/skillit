import type { ExtractedSkill } from './types.js';
import { estimateTokens } from './tokens.js';

/** Max description length in llms.txt summary */
const SUMMARY_DESC_MAX = 150;

export interface LlmsTxtOptions {
  /** Project name (falls back to first skill name) */
  projectName: string;
  /** Project description */
  projectDescription: string;
}

export interface LlmsTxtResult {
  /** llms.txt content (summary index) */
  summary: string;
  /** llms-full.txt content (complete API) */
  full: string;
  /** Estimated tokens for summary */
  summaryTokens: number;
  /** Estimated tokens for full */
  fullTokens: number;
}

/** Render llms.txt and llms-full.txt from extracted skills */
export function renderLlmsTxt(skills: ExtractedSkill[], options: LlmsTxtOptions): LlmsTxtResult {
  const summary = renderSummary(skills, options);
  const full = renderFull(skills, options);

  return {
    summary,
    full,
    summaryTokens: estimateTokens(summary),
    fullTokens: estimateTokens(full)
  };
}

// ---------------------------------------------------------------------------
// llms.txt — summary index
// ---------------------------------------------------------------------------

function renderSummary(skills: ExtractedSkill[], options: LlmsTxtOptions): string {
  const lines: string[] = [];

  lines.push(`# ${options.projectName}\n`);
  if (options.projectDescription) {
    lines.push(`> ${options.projectDescription}\n`);
  }

  if (skills.length > 1) {
    for (const skill of skills) {
      lines.push(`## ${skill.name}\n`);
      if (skill.description) {
        lines.push(`> ${truncateDescription(skill.description)}\n`);
      }
      renderSummarySections(skill, lines);
    }
  } else if (skills.length === 1) {
    renderSummarySections(skills[0]!, lines);
  }

  return lines.join('\n');
}

function renderSummarySections(skill: ExtractedSkill, lines: string[]): void {
  const primary: string[] = [];
  const optional: string[] = [];

  // Functions
  for (const fn of skill.functions) {
    const desc = truncateDescription(fn.description);
    primary.push(`- \`${fn.name}\`${desc ? `: ${desc}` : ''}`);
  }

  // Classes
  for (const cls of skill.classes) {
    const desc = truncateDescription(cls.description);
    primary.push(`- \`${cls.name}\`${desc ? `: ${desc}` : ''}`);
  }

  // Variables
  for (const v of skill.variables ?? []) {
    const desc = truncateDescription(v.description);
    primary.push(`- \`${v.name}\`${desc ? `: ${desc}` : ''}`);
  }

  // Types/Interfaces
  for (const t of skill.types) {
    const desc = truncateDescription(t.description);
    optional.push(`- \`${t.name}\`${desc ? `: ${desc}` : ''}`);
  }

  // Enums
  for (const e of skill.enums) {
    const desc = truncateDescription(e.description);
    optional.push(`- \`${e.name}\`${desc ? `: ${desc}` : ''}`);
  }

  if (primary.length > 0) {
    lines.push('### API\n');
    lines.push(...primary);
    lines.push('');
  }

  if (optional.length > 0) {
    lines.push('## Optional\n');
    lines.push('### Types\n');
    lines.push(...optional);
    lines.push('');
  }
}

// ---------------------------------------------------------------------------
// llms-full.txt — complete API content
// ---------------------------------------------------------------------------

function renderFull(skills: ExtractedSkill[], options: LlmsTxtOptions): string {
  const lines: string[] = [];

  lines.push(`# ${options.projectName}\n`);
  if (options.projectDescription) {
    lines.push(`> ${options.projectDescription}\n`);
  }

  for (const skill of skills) {
    if (skills.length > 1) {
      lines.push(`## ${skill.name}\n`);
      if (skill.description) lines.push(`${skill.description}\n`);
    }

    // Functions
    for (const fn of skill.functions) {
      lines.push(`### ${fn.name}\n`);
      if (fn.description) lines.push(`${fn.description}\n`);
      if (fn.signature) {
        lines.push('```ts', fn.signature, '```\n');
      }
      if (fn.parameters.length > 0) {
        lines.push('**Parameters:**');
        for (const p of fn.parameters) {
          const opt = p.optional ? ' (optional)' : '';
          lines.push(`- \`${p.name}: ${p.type}\`${opt} — ${p.description || ''}`);
        }
        lines.push('');
      }
      if (fn.returnType && fn.returnType !== 'void') {
        lines.push(`**Returns:** \`${fn.returnType}\`\n`);
      }
      if (fn.examples.length > 0) {
        for (const ex of fn.examples) {
          lines.push(ex);
        }
        lines.push('');
      }
    }

    // Classes
    for (const cls of skill.classes) {
      lines.push(`### ${cls.name}\n`);
      if (cls.description) lines.push(`${cls.description}\n`);
      if (cls.constructorSignature) {
        lines.push('```ts', cls.constructorSignature, '```\n');
      }
      if (cls.properties.length > 0) {
        lines.push('**Properties:**');
        for (const p of cls.properties) {
          lines.push(`- \`${p.name}: ${p.type}\` — ${p.description || ''}`);
        }
        lines.push('');
      }
      if (cls.methods.length > 0) {
        lines.push('**Methods:**');
        for (const m of cls.methods) {
          lines.push(`- \`${m.signature}\` — ${m.description || ''}`);
        }
        lines.push('');
      }
    }

    // Types
    for (const t of skill.types) {
      lines.push(`### ${t.name}\n`);
      if (t.description) lines.push(`${t.description}\n`);
      if (t.definition) {
        lines.push('```ts', `type ${t.name} = ${t.definition}`, '```\n');
      }
    }

    // Enums
    for (const e of skill.enums) {
      lines.push(`### ${e.name}\n`);
      if (e.description) lines.push(`${e.description}\n`);
      for (const m of e.members) {
        lines.push(`- \`${m.name}\` = \`${m.value}\` — ${m.description || ''}`);
      }
      lines.push('');
    }

    // Variables
    for (const v of skill.variables ?? []) {
      lines.push(`### ${v.name}\n`);
      if (v.description) lines.push(`${v.description}\n`);
      const keyword = v.isConst ? 'const' : 'let';
      lines.push('```ts', `${keyword} ${v.name}: ${v.type}`, '```\n');
    }

    if (skills.length > 1) {
      lines.push('---\n');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateDescription(desc: string): string {
  if (!desc || desc.length <= SUMMARY_DESC_MAX) return desc;
  const firstSentence = desc.match(/^[^.!?]+[.!?]/)?.[0];
  if (firstSentence && firstSentence.length <= SUMMARY_DESC_MAX) {
    return firstSentence;
  }
  return desc.slice(0, SUMMARY_DESC_MAX - 3) + '...';
}
