import { RngDomain, rngFor, type Watch } from '@donjon/shared';
import type { LoadedPack } from './loader.js';
import { renderTemplate, type SlotEnv } from './render.js';
import { selectTemplate } from './select.js';

export const WATCH_TONE_WEIGHTS: Record<Watch, Record<string, number>> = {
  POTRON_MINET: { epic: 1.4, neutral: 1, absurd: 1, grim: 0.8, dry: 1 },
  ZENITH: { absurd: 1.6, comic: 1.6, neutral: 1, epic: 1, grim: 0.7 },
  CREPUSCULE: { grim: 1.8, melancholy: 1.7, neutral: 1, absurd: 0.9, epic: 1 },
};

export interface NarrateInput {
  eventType: string;
  eventId: number;
  worldSeed: number;
  tick: number;
  env: SlotEnv;
  watch: Watch;
  verbosity?: number;
  recentTemplateIds?: readonly string[];
  pack: LoadedPack;
}

export interface NarrateResult {
  text: string;
  templateId: string;
}

export function narrate(input: NarrateInput): NarrateResult {
  const selectRng = rngFor(input.worldSeed, input.tick, RngDomain.FLAVOUR_SELECT, input.eventId);
  const template = selectTemplate({
    type: input.eventType,
    templates: input.pack.byType.get(input.eventType) ?? [],
    env: input.env,
    toneWeights: WATCH_TONE_WEIGHTS[input.watch] ?? {},
    recentIds: input.recentTemplateIds ?? [],
    rng: selectRng,
  });

  if (!template) return { text: '', templateId: '' };

  const fillRng = rngFor(input.worldSeed, input.tick, RngDomain.FLAVOUR_FILL, input.eventId);
  const text = renderTemplate({
    nodes: template.nodes,
    env: input.env,
    lexicon: input.pack.lexicon,
    rng: fillRng,
    verbosity: input.verbosity ?? 1,
  });

  return { text, templateId: template.id };
}
