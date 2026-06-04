import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseMarkdownDoc, renderSkill, writeSkills } from '@skillit/core';
import type { ExtractedDocument, ExtractedSkill } from '@skillit/core';
import { walkSidebar } from './sidebar-walker.js';

// Minimal Vite Plugin interface — avoids a hard dep on the `vite` package.
// vitepress already ships vite; users always have it.
interface VitePlugin {
  name: string;
  enforce?: 'pre' | 'post';
  config?: (config: any, env: any) => void;
  closeBundle?: () => void;
}

export type { OrderedDoc, WalkSidebarOptions } from './sidebar-walker.js';
export { walkSidebar } from './sidebar-walker.js';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface ToSkillsVitePressOptions {
  /** Output directory for skill files (default: "skills") */
  skillsOutDir?: string;
  /** Skill name override (default: from VitePress site title) */
  name?: string;
  /** Max tokens per skill file (default: 4000) */
  maxTokens?: number;
  /** Exclude sidebar routes matching /api/ prefix (default: true) */
  excludeApi?: boolean;
  /** Additional sidebar route prefixes to exclude */
  exclude?: string[];
  /** License identifier to include in skill frontmatter */
  license?: string;
}

// ─── File resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a VitePress sidebar link (e.g. "/getting-started") to an absolute
 * file path. Tries `<link>.md` then `<link>/index.md`.
 */
function resolveDocPath(srcDir: string, link: string): string | undefined {
  // Normalise: strip leading slash
  const rel = link.replace(/^\//, '');

  const candidates = [join(srcDir, `${rel}.md`), join(srcDir, rel, 'index.md')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export function toSkills(options?: ToSkillsVitePressOptions): VitePlugin {
  let siteTitle = '';
  let siteDescription = '';
  let sidebar: any = [];
  let srcDir = '';

  return {
    name: 'to-skills-vitepress',
    enforce: 'post',

    config(config: any) {
      const vitepress = config.vitepress;
      if (!vitepress?.site) return;

      siteTitle = options?.name || vitepress.site.title || 'docs';
      siteDescription = vitepress.site.description || '';
      sidebar = vitepress.site.themeConfig?.sidebar ?? [];
      srcDir = vitepress.srcDir || '';
    },

    closeBundle() {
      if (!srcDir || !sidebar) return;

      // Build exclude list
      const excludeRoutes: string[] = [...(options?.exclude ?? [])];
      if (options?.excludeApi !== false) {
        excludeRoutes.push('/api/');
      }

      // 1. Walk sidebar to get ordered doc paths
      const orderedDocs = walkSidebar(sidebar, { exclude: excludeRoutes });

      if (orderedDocs.length === 0) return;

      // 2. For each doc: resolve file path, read, parse
      const documents: ExtractedDocument[] = [];

      for (const doc of orderedDocs) {
        const filePath = resolveDocPath(srcDir, doc.path);
        if (!filePath) continue;

        const raw = readFileSync(filePath, 'utf-8');
        const parsed = parseMarkdownDoc(raw, filePath);

        // Build content: title heading + raw body
        const content = parsed.rawContent || raw;

        documents.push({
          title: doc.title || parsed.title,
          content
        });
      }

      if (documents.length === 0) return;

      // 3. Build ExtractedSkill
      const skill: ExtractedSkill = {
        name: siteTitle,
        description: siteDescription,
        license: options?.license,
        documents,
        functions: [],
        classes: [],
        types: [],
        enums: [],
        variables: [],
        examples: []
      };

      // 4. Render skill
      const skillsOutDir = resolve(options?.skillsOutDir ?? 'skills');
      const maxTokens = options?.maxTokens ?? 4000;

      const rendered = renderSkill(skill, { outDir: skillsOutDir, maxTokens });

      // 5. Write to disk
      writeSkills([rendered], { outDir: skillsOutDir });

      // 6. Log output
      const allFiles = [rendered.skill, ...rendered.references];
      console.log(`[to-skills] Generated ${allFiles.length} file(s) → ${skillsOutDir}`);
      for (const file of allFiles) {
        console.log(`  ${file.filename}`);
      }
    }
  };
}
