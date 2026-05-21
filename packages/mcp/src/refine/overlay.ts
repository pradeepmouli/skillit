import { readFileSync, writeFileSync } from 'node:fs';
import type { DraftedFix } from '@to-skills/core';

export interface OverlayAnnotations {
  useWhen?: string;
  avoidWhen?: string;
  pitfalls?: string;
  remarks?: string;
  example?: string;
}

export interface ToSkillsOverlay {
  version: 1;
  server?: OverlayAnnotations;
  tools: Record<string, OverlayAnnotations>;
}

export function emptyOverlay(): ToSkillsOverlay {
  return { version: 1, tools: {} };
}

export function readOverlay(path: string): ToSkillsOverlay {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ToSkillsOverlay;
  } catch {
    return emptyOverlay();
  }
}

export function writeOverlay(path: string, overlay: ToSkillsOverlay): void {
  writeFileSync(path, JSON.stringify(overlay, null, 2), 'utf8');
}

export function applyFixToOverlay(overlay: ToSkillsOverlay, fix: DraftedFix): ToSkillsOverlay {
  const toolKey = fix.toolName;
  // RefineTag and keyof OverlayAnnotations share the same 5 keys — cast is safe
  const tag = fix.tag as keyof OverlayAnnotations;
  const existing = overlay.tools[toolKey]?.[tag];
  const next =
    existing !== undefined && existing !== fix.value ? `${existing}\n${fix.value}` : fix.value;
  return {
    ...overlay,
    tools: {
      ...overlay.tools,
      [toolKey]: { ...overlay.tools[toolKey], [tag]: next }
    }
  };
}
