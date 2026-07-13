import { readFileSync, writeFileSync } from 'node:fs';
import type { DraftedFix } from '@skillit/core';

export interface OverlayAnnotations {
  useWhen?: string;
  avoidWhen?: string;
  never?: string;
  remarks?: string;
  example?: string;
}

export interface SkillitOverlay {
  version: 1;
  server?: OverlayAnnotations;
  tools: Record<string, OverlayAnnotations>;
}

export function emptyOverlay(): SkillitOverlay {
  return { version: 1, tools: {} };
}

export function readOverlay(path: string): SkillitOverlay {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyOverlay();
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['tools'] !== 'object' ||
    (parsed as Record<string, unknown>)['tools'] === null
  ) {
    return emptyOverlay();
  }
  return parsed as SkillitOverlay;
}

export function writeOverlay(path: string, overlay: SkillitOverlay): void {
  writeFileSync(path, JSON.stringify(overlay, null, 2), 'utf8');
}

export function applyFixToOverlay(overlay: SkillitOverlay, fix: DraftedFix): SkillitOverlay {
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
