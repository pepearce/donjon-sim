import type { Rng } from '@donjon/shared';
import type { Node } from './parse.js';

export interface CompiledTemplate {
  id: string;
  type: string;
  weight: number;
  tone: string[];
  requires: string[];
  nodes: Node[];
  fallback: boolean;
}

export interface SelectInput {
  type: string;
  templates: readonly CompiledTemplate[];
  env: Record<string, string | number>;
  toneWeights: Record<string, number>;
  recentIds: readonly string[];
  rng: Rng;
}

export const RECENT_PENALTY = 0.05;

export function selectTemplate(input: SelectInput): CompiledTemplate | undefined {
  const forType = input.templates.filter((t) => t.type === input.type);
  if (forType.length === 0) return undefined;

  const eligible = forType.filter(
    (t) => !t.fallback && t.requires.every((key) => input.env[key] !== undefined && input.env[key] !== ''),
  );
  const pool = eligible.length > 0 ? eligible : forType;

  const weightOf = (t: CompiledTemplate): number => {
    let w = t.weight;
    for (const tone of t.tone) w *= input.toneWeights[tone] ?? 1;
    if (input.recentIds.includes(t.id)) w *= RECENT_PENALTY;
    return Math.max(0.0001, w);
  };

  const total = pool.reduce((n, t) => n + weightOf(t), 0);
  let point = input.rng.float() * total;
  for (const template of pool) {
    point -= weightOf(template);
    if (point <= 0) return template;
  }
  return pool[pool.length - 1];
}
