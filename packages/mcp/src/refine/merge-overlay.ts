import type { ExtractedSkill } from '@to-skills/core';
import type { ToSkillsOverlay } from './overlay.js';

export function mergeOverlay(skill: ExtractedSkill, overlay: ToSkillsOverlay): ExtractedSkill {
  const useWhen = [...(skill.useWhen ?? [])];
  const avoidWhen = [...(skill.avoidWhen ?? [])];
  const pitfalls = [...(skill.pitfalls ?? [])];

  const functions = skill.functions.map((fn) => {
    const ann = overlay.tools[fn.name];
    if (!ann) return fn;
    if (ann.useWhen) useWhen.push(ann.useWhen);
    if (ann.avoidWhen) avoidWhen.push(ann.avoidWhen);
    if (ann.pitfalls) pitfalls.push(ann.pitfalls);
    return {
      ...fn,
      mcpMetadata: {
        ...fn.mcpMetadata,
        toSkills: {
          ...fn.mcpMetadata?.toSkills,
          ...(ann.useWhen !== undefined && { useWhen: [ann.useWhen] }),
          ...(ann.avoidWhen !== undefined && { avoidWhen: [ann.avoidWhen] }),
          ...(ann.pitfalls !== undefined && { pitfalls: [ann.pitfalls] })
        }
      }
    };
  });

  return { ...skill, functions, useWhen, avoidWhen, pitfalls };
}
