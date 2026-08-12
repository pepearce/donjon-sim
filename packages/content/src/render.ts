import type { Rng } from '@donjon/shared';
import { FILTERS, finalise } from './grammar.js';
import type { Filter, Node } from './parse.js';

export type SlotEnv = Record<string, string | number>;

export interface Lexicon {
  [pool: string]: Array<{ word: string; tags?: string[] }>;
}

export interface RenderInput {
  nodes: Node[];
  env: SlotEnv;
  lexicon: Lexicon;
  rng: Rng;
  verbosity: number;
}

function applyFilters(value: string, filters: Filter[]): string {
  let out = value;
  for (const filter of filters) {
    const fn = FILTERS[filter.name];
    if (fn) out = fn(out, filter.arg);
  }
  return out;
}

function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T | undefined {
  const total = items.reduce((n, item) => n + Math.max(0, weight(item)), 0);
  if (total <= 0) return items[0];
  let point = rng.float() * total;
  for (const item of items) {
    point -= Math.max(0, weight(item));
    if (point <= 0) return item;
  }
  return items[items.length - 1];
}

function walk(nodes: Node[], input: RenderInput, out: string[]): void {
  for (const node of nodes) {
    switch (node.kind) {
      case 'lit':
        out.push(node.text);
        break;

      case 'slot': {
        const raw = input.env[node.path];
        out.push(applyFilters(raw === undefined ? '' : String(raw), node.filters));
        break;
      }

      case 'pool': {
        const pool = input.lexicon[node.pool] ?? [];
        const candidates =
          node.tag === null ? pool : pool.filter((entry) => (entry.tags ?? []).includes(node.tag as string));
        const usable = candidates.length > 0 ? candidates : pool;
        if (usable.length === 0) {
          out.push('');
          break;
        }
        const chosen = usable[Math.floor(input.rng.float() * usable.length)];
        out.push(applyFilters(chosen?.word ?? '', node.filters));
        break;
      }

      case 'alt': {
        const branch = pickWeighted(node.branches, (b) => b.weight, input.rng);
        if (branch) walk(branch.nodes, input, out);
        break;
      }

      case 'opt': {
        const threshold = node.p * input.verbosity;
        if (input.rng.float() < threshold) walk(node.nodes, input, out);
        break;
      }

      default:
        break;
    }
  }
}

export function renderTemplate(input: RenderInput): string {
  const out: string[] = [];
  walk(input.nodes, input, out);
  return finalise(out.join(''));
}
