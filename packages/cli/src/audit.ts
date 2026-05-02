import type {
  ExtractedConfigArgument,
  ExtractedConfigOption,
  ExtractedConfigSurface,
  ExtractedSkill
} from '@to-skills/core';

export interface CliAuditIssue {
  readonly code: `C${number}`;
  readonly severity: 'warning' | 'alert';
  readonly message: string;
  readonly suggestion: string;
  readonly location?: {
    readonly command?: string;
    readonly option?: string;
    readonly argument?: string;
  };
}

export function runCliAudit(skill: ExtractedSkill): CliAuditIssue[] {
  const issues: CliAuditIssue[] = [];

  for (const surface of skill.configSurfaces ?? []) {
    if (surface.sourceType !== 'cli') continue;
    auditSurface(surface, issues);
  }

  return issues;
}

function auditSurface(surface: ExtractedConfigSurface, issues: CliAuditIssue[]): void {
  if (!surface.description.trim()) {
    issues.push({
      code: 'C1',
      severity: 'warning',
      message: `Command "${surface.name}" has no description.`,
      suggestion: `Add .description('[One sentence: what this command does and why]') to Commander command`,
      location: { command: surface.name }
    });
  }

  if (!surface.usage?.trim()) {
    issues.push({
      code: 'C3',
      severity: 'alert',
      message: `Command "${surface.name}" has no usage or examples.`,
      suggestion:
        "Add .usage('[command] [options] <required-arg>') and .addHelpText('after', 'Examples:\\n  $ [command] [typical-args]')",
      location: { command: surface.name }
    });
  }

  if (!(surface.useWhen?.length ?? 0)) {
    issues.push({
      code: 'C8',
      severity: 'warning',
      message: `Command "${surface.name}" has no useWhen guidance.`,
      suggestion:
        'Add @useWhen to the config interface or .addHelpText() with scenario: when to prefer this command over alternatives',
      location: { command: surface.name }
    });
  }

  for (const option of surface.options) {
    auditOption(surface.name, option, issues);
  }

  for (const argument of surface.arguments ?? []) {
    auditArgument(surface.name, argument, issues);
  }

  for (const subcommand of surface.subcommands ?? []) {
    if (!subcommand.description.trim()) {
      issues.push({
        code: 'C5',
        severity: 'warning',
        message: `Subcommand "${surface.name} ${subcommand.name}" has no description.`,
        suggestion: `Add .description('[One sentence]') to subcommand '${subcommand.name}'`,
        location: { command: `${surface.name} ${subcommand.name}` }
      });
    }
    auditSurface(subcommand, issues);
  }
}

function auditOption(
  commandName: string,
  option: ExtractedConfigOption,
  issues: CliAuditIssue[]
): void {
  if (!option.description.trim()) {
    issues.push({
      code: 'C2',
      severity: 'warning',
      message: `Option "${option.cliFlag ?? option.name}" on "${commandName}" has no description.`,
      suggestion:
        "Add description to .option(): .option('[flag]', '[What this option controls — effect on behavior, not the type]')",
      location: { command: commandName, option: option.cliFlag ?? option.name }
    });
    issues.push({
      code: 'C7',
      severity: 'warning',
      message: `Option "${option.cliFlag ?? option.name}" on "${commandName}" is undocumented after CLI/config correlation.`,
      suggestion: `Neither --help text nor typed config interface has a description for '${option.name}'. Add JSDoc to the config interface property or .option() description.`,
      location: { command: commandName, option: option.cliFlag ?? option.name }
    });
  }

  if (
    option.envVar &&
    !includesEnvVar(option.description, option.envVar) &&
    !includesEnvVar(option.remarks, option.envVar)
  ) {
    issues.push({
      code: 'C6',
      severity: 'alert',
      message: `Option "${option.cliFlag ?? option.name}" on "${commandName}" supports ${option.envVar} but does not document it.`,
      suggestion: `Add .env('${option.envVar}') to option or document in help text: 'Also settable via ${option.envVar}'`,
      location: { command: commandName, option: option.cliFlag ?? option.name }
    });
  }
}

function auditArgument(
  commandName: string,
  argument: ExtractedConfigArgument,
  issues: CliAuditIssue[]
): void {
  if (argument.description.trim()) return;

  issues.push({
    code: 'C4',
    severity: 'warning',
    message: `Argument "${argument.name}" on "${commandName}" has no description.`,
    suggestion: `Add .argument('<${argument.name}>', '[What this argument represents — expected format/values]')`,
    location: { command: commandName, argument: argument.name }
  });
}

function includesEnvVar(text: string | undefined, envVar: string): boolean {
  return typeof text === 'string' && text.includes(envVar);
}
