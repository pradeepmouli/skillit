/**
 * `McpcAdapter` — CLI-as-proxy invocation adapter for Apify's `mcpc` CLI.
 *
 * @remarks
 * Emits SKILL.md output usable by any agent with a shell tool, by routing
 * tool calls through `mcpc` (https://github.com/apify/mcpc). Unlike the
 * `mcp-protocol` adapter, this adapter does NOT emit an `mcp:` frontmatter
 * block — the MCP server connection is established via the shell `mcpc
 * connect` command described in the Setup section. Instead it emits a
 * `generated-by:` block carrying the adapter's fingerprint (FR-IT-012).
 *
 * The body delegates to core's default render path with two extensions:
 *
 * 1. `bodyPrefix` — the Setup section is prepended to the SKILL.md body so
 *    the consumer sees install/connect instructions before the standard
 *    skill content.
 * 2. `skipDefaultFunctionsRef` — the default `references/functions.md` is
 *    suppressed; the adapter emits its own `references/tools.md` carrying
 *    mcpc command-shape rows produced by `renderCliParamTable`.
 *
 * Resources/prompts/types/etc. references are inherited from core
 * unchanged — the only kind requiring CLI-specific rendering is functions
 * (which become tools in the mcpc dialect).
 *
 * @module render
 */

import type {
  AdapterFingerprint,
  AdapterRenderContext,
  ExtractedFunction,
  ExtractedSkill,
  RenderedFile,
  RenderedSkill
} from '@skillit/core';
import { estimateTokens, renderSkill, truncateToTokenBudget } from '@skillit/core';
import type { InvocationAdapter, ParameterPlan } from '@skillit/mcp';
import { generatedByFrontmatter, splitToolsByNamespace } from '@skillit/mcp';
import { renderToolsBody, resolveLaunchCommand } from '@skillit/mcp/adapter-utils';
import { encodeMcpcArgs } from './args.js';
import { renderMcpcSetup } from './setup.js';
import { PACKAGE_VERSION } from './version.js';

/**
 * mcpc CLI-as-proxy adapter — emits shell-command skills consumable by any
 * agent with a `bash`/`shell` tool.
 *
 * @public
 */
export class McpcAdapter implements InvocationAdapter {
  readonly target = 'cli:mcpc' as const;
  readonly fingerprint: AdapterFingerprint;

  constructor() {
    this.fingerprint = {
      adapter: '@skillit/target-mcpc',
      version: PACKAGE_VERSION,
      targetCliRange: 'mcpc@^2.1'
    };
  }

  /**
   * Render an `ExtractedSkill` into a `RenderedSkill` carrying mcpc
   * command-shape SKILL.md output.
   *
   * The launch shape is selected by `resolveLaunchCommand` from `ctx.mode`.
   */
  async render(skill: ExtractedSkill, ctx: AdapterRenderContext): Promise<RenderedSkill> {
    const launchCommand = resolveLaunchCommand(ctx);

    // Frontmatter — `generated-by:` only. Do NOT emit `mcp:` block.
    const additionalFrontmatter = generatedByFrontmatter(this.fingerprint);

    // Setup section — install + connect commands + FR-IT-012 trace line.
    const bodyPrefix = renderMcpcSetup(ctx.skillName, launchCommand, this.fingerprint);

    // Delegate body to core's default path. We disable:
    //  - the default functions.md emission (we emit our own tools.md below)
    //  - the inner canonicalize pass — because we mutate `references` after
    //    this call, and a single canonicalize run at the host's outer wrapper
    //    is sufficient (and avoids a redundant second pass on the body).
    const baseRendered = renderSkill(skill, {
      maxTokens: ctx.maxTokens,
      additionalFrontmatter,
      bodyPrefix,
      skipDefaultFunctionsRef: true,
      canonicalize: false,
      invocation: undefined,
      namePrefix: ctx.skillName
    });

    // Append our own tools.md (or per-namespace tools-<ns>.md split) if
    // there are any tools. The host's outer canonicalize wrapper (in
    // renderSkill's invocation-adapter dispatch) runs exactly once over
    // this final shape, including the tools file(s).
    const toolsRefs = renderToolsReference(skill.functions, ctx.skillName, ctx.maxTokens);
    for (const ref of toolsRefs) {
      baseRendered.references.push(ref);
    }

    return baseRendered;
  }
}

/**
 * Build the `references/tools.md` file(s) with mcpc command-shape rows.
 *
 * Returns an empty array when the IR has no tools (so the adapter doesn't
 * emit an empty file). When the rendered body fits inside `maxTokens`, a
 * single `references/tools.md` is returned. Otherwise the helper splits the
 * surface by first-segment namespace (FR-022) and returns one
 * `references/tools-<ns>.md` per namespace. Each emitted file has its
 * content passed through `truncateToTokenBudget` so even a single oversized
 * namespace cannot blow past the budget; the `tokens` field reports the
 * pre-truncation estimate, matching the convention used by core's renderer.
 */
function renderToolsReference(
  functions: readonly ExtractedFunction[],
  skillName: string,
  maxTokens: number
): RenderedFile[] {
  if (functions.length === 0) return [];

  const cliVerb = `mcpc ${skillName} tools-call`;
  const groups = splitToolsByNamespace(
    functions,
    (subset) =>
      estimateTokens(
        renderToolsBody(subset, skillName, encodePlanForTable, encodeMcpcArgs, cliVerb)
      ),
    maxTokens
  );

  const files: RenderedFile[] = [];
  for (const group of groups) {
    const content = renderToolsBody(
      group.tools,
      skillName,
      encodePlanForTable,
      encodeMcpcArgs,
      cliVerb
    );
    const filename =
      group.name === 'tools'
        ? `${skillName}/references/tools.md`
        : `${skillName}/references/tools-${group.name}.md`;
    files.push({
      filename,
      content: truncateToTokenBudget(content, maxTokens),
      tokens: estimateTokens(content)
    });
  }
  return files;
}

/**
 * Encoder used by `renderCliParamTable`. Identical encoding rules to
 * `encodeMcpcArgs` but operates on a single plan so it can be the
 * per-row-callback the table expects.
 *
 * mcpc-specific: scalar non-string values use `:=` (typed), and Tier 3
 * fallback emits `--json '<JSON-payload>'`.
 */
function encodePlanForTable(plan: ParameterPlan): string {
  const key = plan.path.join('.');
  switch (plan.type) {
    case 'json':
      return `--json '<JSON-payload>'`;
    case 'scalar': {
      if (plan.scalarType === 'string') return `${key}=<value>`;
      if (plan.scalarType === 'boolean') return `${key}:=<true|false>`;
      // number / integer
      return `${key}:=<value>`;
    }
    case 'enum':
      // DU guarantees `plan.enum.length >= 1`.
      return `${key}=<one-of-${plan.enum.join('|')}>`;
    case 'string-array':
      return `${key}:=<json-array>`;
    default: {
      const _exhaustive: never = plan;
      throw new Error(
        `encodePlanForTable: unhandled ParameterPlan arm: ${JSON.stringify(_exhaustive)}`
      );
    }
  }
}
