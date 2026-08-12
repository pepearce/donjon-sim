const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

const IRREGULAR_PLURALS: Record<string, string> = {
  goose: 'geese',
  mouse: 'mice',
  louse: 'lice',
  tooth: 'teeth',
  foot: 'feet',
  child: 'children',
  ox: 'oxen',
  person: 'people',
};

const IRREGULAR_PAST: Record<string, string> = {
  fell: 'felled',
  hit: 'hit',
  cut: 'cut',
  flee: 'fled',
  run: 'ran',
  strike: 'struck',
  buy: 'bought',
  catch: 'caught',
  bite: 'bit',
  slay: 'slew',
  spring: 'sprang',
  tread: 'trod',
  bleed: 'bled',
  lose: 'lost',
  pay: 'paid',
};

export function indefiniteArticle(word: string): string {
  const first = word.trim()[0]?.toLowerCase() ?? '';
  if (!first) return 'a';
  if (/^(hour|honest|heir)/i.test(word)) return 'an';
  if (/^(uni|use|user|euro|one)/i.test(word)) return 'a';
  return VOWELS.has(first) ? 'an' : 'a';
}

export function withIndefinite(word: string): string {
  return `${indefiniteArticle(word)} ${word}`;
}

export function pluralise(word: string): string {
  const lower = word.toLowerCase();
  const irregular = IRREGULAR_PLURALS[lower];
  if (irregular) return matchCase(word, irregular);
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(f)$/i.test(word)) return `${word.slice(0, -1)}ves`;
  if (/fe$/i.test(word)) return `${word.slice(0, -2)}ves`;
  return `${word}s`;
}

export function possessive(word: string): string {
  return /s$/i.test(word) ? `${word}'` : `${word}'s`;
}

export function pastTense(verb: string): string {
  const lower = verb.toLowerCase();
  const irregular = IRREGULAR_PAST[lower];
  if (irregular) return matchCase(verb, irregular);
  if (/e$/i.test(verb)) return `${verb}d`;
  if (/[^aeiou]y$/i.test(verb)) return `${verb.slice(0, -1)}ied`;
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/i.test(verb)) return `${verb}${verb.slice(-1)}ed`;
  return `${verb}ed`;
}

export function thirdPerson(verb: string): string {
  if (/(s|x|z|ch|sh)$/i.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/i.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

export function capitalise(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.length === 0) return text;
  return text.slice(0, text.length - trimmed.length) + trimmed[0]?.toUpperCase() + trimmed.slice(1);
}

export function ordinal(n: number): string {
  const abs = Math.abs(Math.round(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][abs % 10] ?? 'th';
  return `${n}${suffix}`;
}

export function formatCoin(cp: number): string {
  const n = Math.round(cp);
  if (n >= 100_000) return `${(n / 1000).toFixed(0)}k copper`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k copper`;
  return `${n.toLocaleString('en-GB')}cp`;
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-GB');
}

function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase() && source.length > 1) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) return capitalise(replacement);
  return replacement;
}

export function finalise(text: string): string {
  let out = text.replace(/\s+/g, ' ').trim();
  out = out.replace(/\s+([,.;:!?])/g, '$1');
  out = out.replace(/\ba\s+([aeiouAEIOU])/g, 'an $1');
  out = out.replace(/\ban\s+([^aeiouAEIOU\s])/g, 'a $1');
  out = capitalise(out);
  if (out.length > 0 && !/[.!?]$/.test(out)) out += '.';
  return out;
}

export const FILTERS: Record<string, (value: string, arg: string | null) => string> = {
  indef: (v) => withIndefinite(v),
  the: (v) => `the ${v}`,
  s: (v) => pluralise(v),
  poss: (v) => possessive(v),
  cap: (v) => capitalise(v),
  past: (v) => pastTense(v),
  '3sg': (v) => thirdPerson(v),
  num: (v) => formatNumber(Number(v)),
  ord: (v) => ordinal(Number(v)),
  coin: (v) => formatCoin(Number(v)),
  lower: (v) => v.toLowerCase(),
  upper: (v) => v.toUpperCase(),
};
