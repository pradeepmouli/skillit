import type { ExtractedSkill } from '@skillit/core';
import type { SkillitOverlay } from './overlay.js';

export function mergeOverlay(skill: ExtractedSkill, overlay: SkillitOverlay): ExtractedSkill {
  // Step 1: transform functions (pure map — no aggregation side-effects)
  const functions = skill.functions.map((fn) => {
    const ann = overlay.tools[fn.name];
    if (!ann) return fn;
    return {
      ...fn,
      // remarks/example go into fn.tags (read by the refine loop drafter + scorer);
      // they are not present on ExtractedFunctionMcpMetadata.skillit
      tags: {
        ...fn.tags,
        ...(ann.remarks !== undefined && { remarks: ann.remarks }),
        ...(ann.example !== undefined && { example: ann.example })
      },
      mcpMetadata: {
        ...fn.mcpMetadata,
        skillit: {
          ...fn.mcpMetadata?.skillit,
          ...(ann.useWhen !== undefined && { useWhen: [ann.useWhen] }),
          ...(ann.avoidWhen !== undefined && { avoidWhen: [ann.avoidWhen] }),
          ...(ann.never !== undefined && { never: [ann.never] })
        }
      }
    };
  });

  // Step 2: derive skill-level aggregates from the overlay (separate concern from the map above)
  const useWhen = [...(skill.useWhen ?? [])];
  const avoidWhen = [...(skill.avoidWhen ?? [])];
  const never = [...(skill.never ?? [])];
  for (const fn of functions) {
    const ann = overlay.tools[fn.name];
    if (!ann) continue;
    if (ann.useWhen !== undefined) useWhen.push(ann.useWhen);
    if (ann.avoidWhen !== undefined) avoidWhen.push(ann.avoidWhen);
    if (ann.never !== undefined) never.push(ann.never);
  }

  return { ...skill, functions, useWhen, avoidWhen, never };
}
