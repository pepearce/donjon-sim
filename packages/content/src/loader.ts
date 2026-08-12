import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTemplate } from './parse.js';
import type { CompiledTemplate } from './select.js';
import type { Lexicon } from './render.js';

export interface RawTemplate {
  id: string;
  type: string;
  weight?: number;
  tone?: string[];
  requires?: string[];
  text: string;
  fallback?: boolean;
}

export interface LoadedPack {
  templates: CompiledTemplate[];
  lexicon: Lexicon;
  flavourHash: string;
  byType: Map<string, CompiledTemplate[]>;
}

export interface PackIssue {
  templateId: string;
  problem: string;
}

export function compilePack(raw: RawTemplate[], lexicon: Lexicon): { pack: LoadedPack; issues: PackIssue[] } {
  const issues: PackIssue[] = [];
  const templates: CompiledTemplate[] = [];

  for (const entry of raw) {
    try {
      const nodes = parseTemplate(entry.text);
      templates.push({
        id: entry.id,
        type: entry.type,
        weight: entry.weight ?? 1,
        tone: entry.tone ?? [],
        requires: entry.requires ?? [],
        nodes,
        fallback: entry.fallback ?? false,
      });
    } catch (error) {
      issues.push({ templateId: entry.id, problem: (error as Error).message });
    }
  }

  const byType = new Map<string, CompiledTemplate[]>();
  for (const template of templates) {
    const list = byType.get(template.type) ?? [];
    list.push(template);
    byType.set(template.type, list);
  }

  for (const [type, list] of byType) {
    if (!list.some((t) => t.fallback)) {
      issues.push({ templateId: type, problem: `event type ${type} has no fallback template` });
    }
  }

  const seen = new Set<string>();
  for (const template of templates) {
    if (seen.has(template.id)) issues.push({ templateId: template.id, problem: 'duplicate template id' });
    seen.add(template.id);
  }

  const flavourHash = createHash('sha256')
    .update(JSON.stringify(raw))
    .update(JSON.stringify(lexicon))
    .digest('hex')
    .slice(0, 16);

  return { pack: { templates, lexicon, flavourHash, byType }, issues };
}

export function loadCorePack(): { pack: LoadedPack; issues: PackIssue[] } {
  const dir = fileURLToPath(new URL('../packs/core/', import.meta.url));
  const raw = JSON.parse(readFileSync(`${dir}templates.json`, 'utf8')) as RawTemplate[];
  const lexicon = JSON.parse(readFileSync(`${dir}lexicon.json`, 'utf8')) as Lexicon;
  return compilePack(raw, lexicon);
}
