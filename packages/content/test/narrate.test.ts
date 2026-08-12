import { describe, expect, it } from 'vitest';
import { RngDomain, rngFor } from '@donjon/shared';
import {
  compilePack,
  finalise,
  formatCoin,
  indefiniteArticle,
  loadCorePack,
  narrate,
  ordinal,
  parseTemplate,
  pastTense,
  pluralise,
  possessive,
  renderTemplate,
  selectTemplate,
  TemplateSyntaxError,
} from '../src/index.js';

const { pack, issues } = loadCorePack();

describe('core pack', () => {
  it('compiles with no issues', () => {
    expect(issues).toEqual([]);
    expect(pack.templates.length).toBeGreaterThan(60);
  });

  it('gives every event type a fallback template', () => {
    for (const [type, list] of pack.byType) {
      expect(list.some((t) => t.fallback), `${type} needs a fallback`).toBe(true);
    }
  });

  it('has a stable flavour hash', () => {
    const again = loadCorePack();
    expect(again.pack.flavourHash).toBe(pack.flavourHash);
    expect(pack.flavourHash).toHaveLength(16);
  });
});

describe('parser', () => {
  it('parses literals, slots, filters, pools, alternation and optionals', () => {
    const nodes = parseTemplate('{a|cap} hit {b|indef} <x|y> [maybe]?0.5 {@pool#tag}');
    const kinds = nodes.map((n) => n.kind);
    expect(kinds).toContain('slot');
    expect(kinds).toContain('alt');
    expect(kinds).toContain('opt');
    expect(kinds).toContain('pool');
  });

  it('parses weighted alternation', () => {
    const nodes = parseTemplate('<3:common|1:rare>');
    const alt = nodes.find((n) => n.kind === 'alt');
    expect(alt?.kind === 'alt' && alt.branches.map((b) => b.weight)).toEqual([3, 1]);
  });

  it('throws on unclosed constructs', () => {
    expect(() => parseTemplate('{unclosed')).toThrow(TemplateSyntaxError);
    expect(() => parseTemplate('<a|b')).toThrow(TemplateSyntaxError);
    expect(() => parseTemplate('[opt')).toThrow(TemplateSyntaxError);
  });

  it('honours escapes', () => {
    const nodes = parseTemplate('literal \\{not a slot\\}');
    expect(nodes.every((n) => n.kind === 'lit')).toBe(true);
  });
});

describe('grammar', () => {
  it('picks articles including the awkward cases', () => {
    expect(indefiniteArticle('duck')).toBe('a');
    expect(indefiniteArticle('ogre')).toBe('an');
    expect(indefiniteArticle('hour')).toBe('an');
    expect(indefiniteArticle('unicorn')).toBe('a');
  });

  it('pluralises regular and irregular nouns', () => {
    expect(pluralise('rat')).toBe('rats');
    expect(pluralise('slime')).toBe('slimes');
    expect(pluralise('box')).toBe('boxes');
    expect(pluralise('body')).toBe('bodies');
    expect(pluralise('mouse')).toBe('mice');
    expect(pluralise('knife')).toBe('knives');
  });

  it('forms possessives and past tenses', () => {
    expect(possessive('Herbert')).toBe("Herbert's");
    expect(possessive('Regrettables')).toBe("Regrettables'");
    expect(pastTense('cleave')).toBe('cleaved');
    expect(pastTense('flee')).toBe('fled');
    expect(pastTense('skewer')).toBe('skewered');
  });

  it('formats ordinals and coin', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(23)).toBe('23rd');
    expect(formatCoin(450)).toBe('450cp');
    expect(formatCoin(250_000)).toBe('250k copper');
  });

  it('finalises punctuation and article agreement', () => {
    expect(finalise('  a  ogre  appeared ')).toBe('An ogre appeared.');
    expect(finalise('done already!')).toBe('Done already!');
    expect(finalise('an duck')).toBe('A duck.');
  });
});

describe('narrate', () => {
  const base = {
    eventType: 'MONSTER_DOWN',
    eventId: 42,
    worldSeed: 0xd0f0a,
    tick: 1234,
    env: { hero: 'Herbert', monster: 'rat clerk', damage: 7 },
    watch: 'ZENITH' as const,
    pack,
  };

  it('is deterministic for the same (seed, tick, eventId)', () => {
    const a = narrate(base);
    const b = narrate(base);
    expect(a.text).toBe(b.text);
    expect(a.templateId).toBe(b.templateId);
    expect(a.text.length).toBeGreaterThan(0);
  });

  it('varies with eventId', () => {
    const texts = new Set(
      Array.from({ length: 40 }, (_, i) => narrate({ ...base, eventId: i }).text),
    );
    expect(texts.size).toBeGreaterThan(4);
  });

  it('always ends in punctuation and starts capitalised', () => {
    for (let i = 0; i < 200; i++) {
      const { text } = narrate({ ...base, eventId: i });
      expect(text).toMatch(/^[A-Z0-9]/);
      expect(text).toMatch(/[.!?]$/);
    }
  });

  it('never leaks an unresolved slot or stray brace', () => {
    for (const [type] of pack.byType) {
      for (let i = 0; i < 30; i++) {
        const { text } = narrate({
          ...base,
          eventType: type,
          eventId: i,
          env: {
            hero: 'Herbert',
            monster: 'rat clerk',
            team: 'The Ninth Regrettables',
            room: 'The Rat Exchange',
            floor: 'The Ground Floor',
            source: 'rust golem',
            trap: 'a spring-loaded invoice',
            item: 'notched sabre',
            motto: 'We have read the waiver.',
            reason: 'insolvent',
            text: 'tolls doubled',
            action: 'taken',
            species: 'duck',
            className: 'sabreur',
            damage: 7,
            coin: 340,
            cp: 500,
            carriedCp: 900,
            tollCp: 135,
            recoveredCp: 220,
            level: 3,
            depth: 2,
            floors: 3,
            rooms: 57,
            size: 4,
            enemies: 2,
            lead: 'goblin intern',
            staff: 18,
            dormancyMs: 5000,
          },
        });
        expect(text, `${type} leaked braces: ${text}`).not.toMatch(/[{}<>[\]]/);
        expect(text).not.toMatch(/\bundefined\b/);
      }
    }
  });

  it('falls back rather than throwing on an unknown event type', () => {
    const result = narrate({ ...base, eventType: 'NO_SUCH_EVENT' });
    expect(result.text).toBe('');
  });

  it('penalises recently used templates', () => {
    const list = pack.byType.get('EXPLORED') ?? [];
    const nonFallback = list.filter((t) => !t.fallback);
    const recent = nonFallback.slice(0, nonFallback.length - 1).map((t) => t.id);
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const chosen = selectTemplate({
        type: 'EXPLORED',
        templates: list,
        env: { team: 'T', room: 'R' },
        toneWeights: {},
        recentIds: recent,
        rng: rngFor(1, i, RngDomain.FLAVOUR_SELECT, i),
      });
      if (chosen) counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + 1);
    }
    const survivor = nonFallback[nonFallback.length - 1];
    expect(survivor).toBeDefined();
    const survivorCount = counts.get(survivor?.id ?? '') ?? 0;
    const others = [...counts.entries()].filter(([id]) => id !== survivor?.id).map(([, n]) => n);
    expect(survivorCount).toBeGreaterThan(Math.max(0, ...others));
  });

  it('keeps repeats low across 24 renders when recent ids are threaded, as production does', () => {
    const seen: string[] = [];
    const recent: string[] = [];
    let repeats = 0;

    for (let i = 0; i < 24; i++) {
      const { text, templateId } = narrate({
        ...base,
        eventId: 1000 + i,
        recentTemplateIds: recent,
      });
      if (seen.includes(text)) repeats += 1;
      seen.push(text);
      recent.push(templateId);
      if (recent.length > 24) recent.shift();
    }

    expect(repeats).toBeLessThanOrEqual(6);
    expect(new Set(seen).size).toBeGreaterThanOrEqual(18);
    expect(new Set(recent).size).toBeGreaterThanOrEqual(6);
  });
});

describe('render', () => {
  it('skipped alternation branches consume no extra fill entropy', () => {
    const nodes = parseTemplate('<a|b>');
    const rngA = rngFor(1, 1, RngDomain.FLAVOUR_FILL, 1);
    renderTemplate({ nodes, env: {}, lexicon: {}, rng: rngA, verbosity: 1 });
    const after = rngA.u32();

    const rngB = rngFor(1, 1, RngDomain.FLAVOUR_FILL, 1);
    rngB.float();
    expect(rngB.u32()).toBe(after);
  });

  it('respects verbosity when deciding optional blocks', () => {
    const nodes = parseTemplate('core[ extra]?1.0');
    const quiet = renderTemplate({
      nodes,
      env: {},
      lexicon: {},
      rng: rngFor(1, 1, RngDomain.FLAVOUR_FILL, 1),
      verbosity: 0,
    });
    expect(quiet).toBe('Core.');
  });

  it('reports a missing fallback in a broken pack', () => {
    const { issues: broken } = compilePack(
      [{ id: 'x.00', type: 'X', text: 'hello' }],
      {},
    );
    expect(broken.some((i) => i.problem.includes('no fallback'))).toBe(true);
  });
});
