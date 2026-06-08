/**
 * TypeDoc plugin that extracts structured AI agent skills from the TypeDoc reflection tree.
 *
 * Install as `typedoc-plugin-skillit` for auto-discovery, or import `@skillit/typedoc`
 * directly. The plugin hooks into TypeDoc's converter to extract functions, classes, types,
 * enums, config surfaces, and documents, then renders them as SKILL.md + reference files
 * via `@skillit/core`.
 *
 * @remarks
 * The plugin registers 13 TypeDoc options (skillsOutDir, skillsPerPackage, etc.) and
 * handles the full pipeline: extract → render → write → audit → llms.txt.
 *
 * @packageDocumentation
 */

export { load } from './plugin.js';
export type { SkillsPluginOptions } from './plugin.js';
export * from './refine/index.js';
export {
  generateTypeDocSkills,
  extractTypeDocSkills,
  createTypeDocRefineSource
} from './extract-standalone.js';
export type { TypeDocRunOptions } from './extract-standalone.js';
