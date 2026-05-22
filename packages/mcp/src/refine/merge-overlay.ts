import type { ExtractedSkill } from '@to-skills/core';
import type { ToSkillsOverlay } from './overlay.js';

export function mergeOverlay(skill: ExtractedSkill, overlay: ToSkillsOverlay): ExtractedSkill {
  // Step 1: transform functions (pure map — no aggregation side-effects)
  const functions = skill.functions.map((fn) => {
    const ann = overlay.tools[fn.name];
    if (!ann) return fn;
    return {
      ...fn,
      mcpMetadata: {
        ...fn.mcpMetadata,
        toSkills: {
          ...fn.mcpMetadata?.toSkills,
          ...(ann.useWhen !== undefined && { useWhen: [ann.useWhen] }),
          ...(ann.avoidWhen !== undefined && { avoidWhen: [ann.avoidWhen] }),
          ...(ann.pitfalls !== undefined && { pitfalls: [ann.pitfalls] })
          // remarks and example are overlay-only fields not present on
          // ExtractedFunctionMcpMetadata.toSkills — intentionally omitted here
        }
      }
    };
  });

  // Step 2: derive skill-level aggregates from the overlay (separate concern from the map above)
  const useWhen = [...(skill.useWhen ?? [])];
  const avoidWhen = [...(skill.avoidWhen ?? [])];
  const pitfalls = [...(skill.pitfalls ?? [])];
  for (const fn of functions) {
    const ann = overlay.tools[fn.name];
    if (!ann) continue;
    if (ann.useWhen !== undefined) useWhen.push(ann.useWhen);
    if (ann.avoidWhen !== undefined) avoidWhen.push(ann.avoidWhen);
    if (ann.pitfalls !== undefined) pitfalls.push(ann.pitfalls);
  }

  return { ...skill, functions, useWhen, avoidWhen, pitfalls };
}
