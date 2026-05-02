import type { ExtractedConfigSurface, ExtractedConfigOption } from './config-types.js';

// ---------------------------------------------------------------------------
// Inline SKILL.md sections
// ---------------------------------------------------------------------------

/**
 * Render ExtractedConfigSurface[] as SKILL.md inline sections.
 *
 * CLI surfaces → ## Commands
 * Config/env surfaces → ## Configuration
 */
export function renderConfigSurfaceSection(surfaces: ExtractedConfigSurface[] | undefined): string {
  if (!surfaces || surfaces.length === 0) return '';

  const cli = surfaces.filter((s) => s.sourceType === 'cli');
  const config = surfaces.filter((s) => s.sourceType !== 'cli');

  const parts: string[] = [];

  if (cli.length > 0) {
    parts.push(renderCommandsSection(cli));
  }

  if (config.length > 0) {
    parts.push(renderConfigSection(config));
  }

  return parts.join('\n\n');
}

function renderCommandsSection(surfaces: ExtractedConfigSurface[]): string {
  const lines: string[] = ['## Commands'];

  for (const surface of surfaces) {
    lines.push('');
    lines.push(`### ${surface.name}`);

    if (surface.description) {
      lines.push('');
      lines.push(surface.description);
    }

    if (surface.usage) {
      lines.push('');
      lines.push('**Usage:**');
      lines.push('```');
      lines.push(surface.usage);
      lines.push('```');
    }

    if (surface.options.length > 0) {
      lines.push('');
      lines.push(renderOptionsTable(surface.options, 'cli'));
    }

    if (surface.arguments && surface.arguments.length > 0) {
      lines.push('');
      lines.push('**Arguments:**');
      for (const arg of surface.arguments) {
        const req = arg.required ? ' *(required)*' : '';
        const def = arg.defaultValue ? ` — default: \`${arg.defaultValue}\`` : '';
        const desc = arg.description ? ` — ${arg.description}` : '';
        lines.push(`- \`${arg.name}\`${req}${def}${desc}`);
      }
    }

    if (surface.useWhen && surface.useWhen.length > 0) {
      lines.push('');
      lines.push('**Use when:**');
      for (const item of surface.useWhen) {
        lines.push(`- ${item}`);
      }
    }

    if (surface.avoidWhen && surface.avoidWhen.length > 0) {
      lines.push('');
      lines.push('**Avoid when:**');
      for (const item of surface.avoidWhen) {
        lines.push(`- ${item}`);
      }
    }

    if (surface.pitfalls && surface.pitfalls.length > 0) {
      lines.push('');
      lines.push('**Pitfalls:**');
      for (const item of surface.pitfalls) {
        lines.push(`- ${item}`);
      }
    }
  }

  return lines.join('\n');
}

function renderConfigSection(surfaces: ExtractedConfigSurface[]): string {
  const lines: string[] = ['## Configuration'];

  // Config tables always go in references/config.md — SKILL.md gets a compact pointer.
  // A single config surface: show name + description + option count + pitfalls.
  // Multiple config surfaces: just point to the reference file.
  if (surfaces.length === 1) {
    const s = surfaces[0]!;
    const desc = s.description ? ` — ${s.description}` : '';
    lines.push('');
    lines.push(`**${s.name}**${desc} (${s.options.length} options — see references/config.md)`);

    if (s.pitfalls && s.pitfalls.length > 0) {
      lines.push('');
      lines.push('**Pitfalls:**');
      for (const item of s.pitfalls) {
        lines.push(`- ${item}`);
      }
    }

    return lines.join('\n');
  }

  // Multiple surfaces: skip the bullet list — just point to config.md
  lines.push('');
  lines.push(`${surfaces.length} configuration interfaces — see references/config.md for details.`);
  return lines.join('\n');
}

function renderOptionsTable(options: ExtractedConfigOption[], mode: 'cli' | 'config'): string {
  const flagCol = mode === 'cli' ? 'Flag' : 'Key';

  const rows: string[] = [
    `| ${flagCol} | Type | Required | Default | Env | Description |`,
    `| --- | --- | --- | --- | --- | --- |`
  ];

  for (const opt of options) {
    const key =
      mode === 'cli'
        ? opt.cliShort
          ? `\`${opt.cliFlag}\` / \`${opt.cliShort}\``
          : `\`${opt.cliFlag ?? opt.name}\``
        : `\`${opt.configKey ?? opt.name}\``;

    const required = opt.required ? 'yes' : 'no';
    const def = opt.defaultValue ? `\`${opt.defaultValue}\`` : '—';
    const env = opt.envVar ? `\`${opt.envVar}\`` : '—';
    const desc = opt.description.replace(/\|/g, '\\|');

    rows.push(`| ${key} | \`${opt.type}\` | ${required} | ${def} | ${env} | ${desc} |`);
  }

  return rows.join('\n');
}

// ---------------------------------------------------------------------------
// Detailed reference files
// ---------------------------------------------------------------------------

/**
 * Render ExtractedConfigSurface[] as per-option detail for reference files.
 *
 * CLI surfaces → # Commands with ## commandName / #### --flag
 * Config/env surfaces → # Configuration with ## InterfaceName / #### propertyName
 */
export function renderConfigReference(surfaces: ExtractedConfigSurface[] | undefined): string {
  if (!surfaces || surfaces.length === 0) return '';

  const cli = surfaces.filter((s) => s.sourceType === 'cli');
  const config = surfaces.filter((s) => s.sourceType !== 'cli');

  const parts: string[] = [];

  if (cli.length > 0) {
    parts.push(renderCommandsReference(cli));
  }

  if (config.length > 0) {
    parts.push(renderConfigDetailReference(config));
  }

  return parts.join('\n\n');
}

function renderCommandsReference(surfaces: ExtractedConfigSurface[]): string {
  const lines: string[] = ['# Commands'];

  for (const surface of surfaces) {
    lines.push('');
    lines.push(`## ${surface.name}`);

    if (surface.description) {
      lines.push('');
      lines.push(surface.description);
    }

    if (surface.usage) {
      lines.push('');
      lines.push('```');
      lines.push(surface.usage);
      lines.push('```');
    }

    if (surface.remarks) {
      lines.push('');
      lines.push(surface.remarks);
    }

    if (surface.options.length > 0) {
      lines.push('');
      lines.push('### Options');
      for (const opt of surface.options) {
        const heading = opt.cliFlag ?? `--${opt.name}`;
        lines.push('');
        lines.push(`#### ${heading}`);
        renderOptionDetail(opt, lines);
      }
    }

    if (surface.arguments && surface.arguments.length > 0) {
      lines.push('');
      lines.push('### Arguments');
      for (const arg of surface.arguments) {
        lines.push('');
        lines.push(`#### \`${arg.name}\``);
        lines.push('');
        lines.push(arg.description);
        if (arg.required) {
          lines.push('');
          lines.push('**Required:** yes');
        }
        if (arg.variadic) {
          lines.push('');
          lines.push('**Variadic:** yes');
        }
        if (arg.defaultValue) {
          lines.push('');
          lines.push(`**Default:** \`${arg.defaultValue}\``);
        }
      }
    }

    if (surface.useWhen && surface.useWhen.length > 0) {
      lines.push('');
      lines.push('### Use when');
      for (const item of surface.useWhen) {
        lines.push(`- ${item}`);
      }
    }

    if (surface.pitfalls && surface.pitfalls.length > 0) {
      lines.push('');
      lines.push('### NEVER');
      for (const item of surface.pitfalls) {
        lines.push(`- ${item}`);
      }
    }
  }

  return lines.join('\n');
}

function renderConfigDetailReference(surfaces: ExtractedConfigSurface[]): string {
  const lines: string[] = ['# Configuration'];

  for (const surface of surfaces) {
    lines.push('');
    lines.push(`## ${surface.name}`);

    if (surface.description) {
      lines.push('');
      lines.push(surface.description);
    }

    if (surface.remarks) {
      lines.push('');
      lines.push(surface.remarks);
    }

    if (surface.options.length > 0) {
      lines.push('');
      lines.push('### Properties');
      for (const opt of surface.options) {
        const heading = opt.configKey ?? opt.name;
        lines.push('');
        lines.push(`#### ${heading}`);
        renderOptionDetail(opt, lines);
      }
    }

    if (surface.useWhen && surface.useWhen.length > 0) {
      lines.push('');
      lines.push('### Use when');
      for (const item of surface.useWhen) {
        lines.push(`- ${item}`);
      }
    }

    if (surface.pitfalls && surface.pitfalls.length > 0) {
      lines.push('');
      lines.push('### NEVER');
      for (const item of surface.pitfalls) {
        lines.push(`- ${item}`);
      }
    }
  }

  return lines.join('\n');
}

function renderOptionDetail(opt: ExtractedConfigOption, lines: string[]): void {
  lines.push('');
  lines.push(opt.description);

  lines.push('');
  lines.push(`**Type:** \`${opt.type}\``);

  if (opt.required) {
    lines.push('');
    lines.push('**Required:** yes');
  }

  if (opt.defaultValue) {
    lines.push('');
    lines.push(`**Default:** \`${opt.defaultValue}\``);
  }

  if (opt.envVar) {
    lines.push('');
    lines.push(`**Environment:** \`${opt.envVar}\``);
  }

  if (opt.remarks) {
    lines.push('');
    lines.push(opt.remarks);
  }

  if (opt.useWhen && opt.useWhen.length > 0) {
    lines.push('');
    lines.push('**Use when:**');
    for (const item of opt.useWhen) {
      lines.push(`- ${item}`);
    }
  }

  if (opt.avoidWhen && opt.avoidWhen.length > 0) {
    lines.push('');
    lines.push('**Avoid when:**');
    for (const item of opt.avoidWhen) {
      lines.push(`- ${item}`);
    }
  }

  if (opt.pitfalls && opt.pitfalls.length > 0) {
    lines.push('');
    lines.push('**Pitfalls:**');
    for (const item of opt.pitfalls) {
      lines.push(`- ${item}`);
    }
  }
}
