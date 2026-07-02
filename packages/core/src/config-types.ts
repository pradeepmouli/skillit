/**
 * The source type of a configuration surface:
 * - 'cli'    — a command-line command or subcommand
 * - 'config' — a configuration file (e.g. JSON, YAML, TOML)
 * - 'env'    — environment variables
 */
export type ConfigSourceType = 'cli' | 'config' | 'env';

/**
 * Describes a single configuration surface: a CLI command, config file schema,
 * or environment-variable group that an agent may need to invoke or populate.
 */
export interface ExtractedConfigSurface {
  /** Human-readable name of this surface (e.g. "build", "jest.config.ts") */
  name: string;

  /** Short prose description of what this surface controls or triggers */
  description: string;

  /**
   * The kind of surface: CLI command/subcommand, config file, or env-var group.
   * Agents use this to decide how to surface the information (flag syntax vs key
   * path vs environment variable name).
   */
  sourceType: ConfigSourceType;

  /**
   * Optional canonical usage example (e.g. `pnpm build --watch`).
   * Shown verbatim so agents can copy-paste directly.
   */
  usage?: string;

  /** All options (flags, config keys, env vars) accepted by this surface */
  options: ExtractedConfigOption[];

  /** Positional arguments accepted by this CLI surface, in order */
  arguments?: ExtractedConfigArgument[];

  /** Nested subcommands of this CLI surface (recursive) */
  subcommands?: ExtractedConfigSurface[];

  /**
   * Conditions under which an agent should prefer this surface.
   * Mirrors the @useWhen JSDoc pattern used elsewhere in ExtractedSkill.
   */
  useWhen?: string[];

  /**
   * Conditions under which an agent should avoid this surface.
   * Mirrors the @avoidWhen JSDoc pattern used elsewhere in ExtractedSkill.
   */
  avoidWhen?: string[];

  /**
   * Known pitfalls, footguns, or common mistakes for this surface.
   * Mirrors the @never JSDoc pattern used elsewhere in ExtractedSkill.
   */
  never?: string[];

  /**
   * Extended expert notes about this surface — edge cases, interaction effects,
   * or nuances not captured by the description. Mirrors the @remarks JSDoc pattern.
   */
  remarks?: string;
}

/**
 * A single configurable option within a surface: a CLI flag, a config-file key,
 * or an environment variable (or any combination of the three).
 */
export interface ExtractedConfigOption {
  /** Canonical name for this option (used as the display key) */
  name: string;

  /**
   * The long CLI flag for this option, including leading dashes
   * (e.g. `--output-dir`). Omit if this option is not exposed via CLI.
   */
  cliFlag?: string;

  /**
   * The short CLI flag alias (e.g. `-o`).
   * Omit if there is no short form.
   */
  cliShort?: string;

  /**
   * The dot-notation key path in a config file (e.g. `output.dir`).
   * Omit if this option is not settable in a config file.
   */
  configKey?: string;

  /**
   * The environment variable name that sets this option (e.g. `OUTPUT_DIR`).
   * Omit if this option is not settable via environment variable.
   */
  envVar?: string;

  /**
   * TypeScript-style type expression for the accepted value
   * (e.g. `string`, `number`, `boolean`, `'esm' | 'cjs'`).
   */
  type: string;

  /** Short prose description of what this option controls */
  description: string;

  /** Whether this option must be supplied for the surface to function */
  required: boolean;

  /**
   * The default value when the option is not explicitly set.
   * Serialised as a string (e.g. `"true"`, `"4000"`, `"\"dist\""`).
   */
  defaultValue?: string;

  /**
   * Extended expert notes about this option — interaction effects, precedence
   * rules, or platform-specific behaviour.
   */
  remarks?: string;

  /**
   * Conditions under which an agent should set this option.
   * Mirrors the @useWhen JSDoc pattern.
   */
  useWhen?: string[];

  /**
   * Conditions under which an agent should avoid setting this option.
   * Mirrors the @avoidWhen JSDoc pattern.
   */
  avoidWhen?: string[];

  /**
   * Known pitfalls or common mistakes when using this option.
   * Mirrors the @never JSDoc pattern.
   */
  never?: string[];

  /**
   * Logical grouping label for this option (e.g. "Output", "Performance").
   * Agents can use this to cluster related options in generated documentation.
   */
  category?: string;
}

/**
 * A positional command-line argument accepted by a CLI surface.
 * Positional arguments are ordered and do not use flag prefixes.
 */
export interface ExtractedConfigArgument {
  /** Symbolic name of this argument as shown in usage strings (e.g. `<file>`) */
  name: string;

  /** Short prose description of what this argument represents */
  description: string;

  /** Whether the caller must supply this argument */
  required: boolean;

  /**
   * Whether this argument is variadic (accepts one or more values,
   * typically represented as `...<files>` in usage strings).
   */
  variadic: boolean;

  /**
   * The default value used when the argument is omitted (only meaningful
   * when `required` is false). Serialised as a string.
   */
  defaultValue?: string;
}
