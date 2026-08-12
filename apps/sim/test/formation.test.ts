import { describe, expect, it } from 'vitest';
import type { EventType } from '@donjon/shared';
import { lineOf } from '../src/engine/systems/formation.js';
import { newWorld } from '../src/engine/setup.js';
import { step } from '../src/engine/step.js';
import type { Hero, World } from '../src/engine/types.js';

const SEED = 0xd0f0a;

function heroWith(className: string, traits: string[]): Hero {
  return {
    id: 1,
    name: 'Test',
    species: 'duck',
    className,
    primary: 'str',
    teamId: 1,
    level: 1,
    xp: 0,
    hp: 10,
    hpMax: 10,
    stats: { str: 10, agi: 10, wil: 10 },
    state: 'ok',
    bleedOutTick: 0,
    kills: 0,
    scarred: false,
    bornTick: 0,
    diedTick: null,
    diedWallMs: null,
    goldCp: 0,
    items: [],
    traits,
    epithet: '',
    nemesisName: '',
    nemesisDowns: 0,
    relations: [],
  };
}

describe('lineOf', () => {
  it('places the martial classes in front and the casters behind', () => {
    expect(lineOf(heroWith('sabreur', []))).toBe('front');
    expect(lineOf(heroWith('bruiser', []))).toBe('front');
    expect(lineOf(heroWith('cutpurse', []))).toBe('front');
    expect(lineOf(heroWith('sapper', []))).toBe('front');
    expect(lineOf(heroWith('thaumaturge', []))).toBe('back');
    expect(lineOf(heroWith('pretre', []))).toBe('back');
  });

  it('lets traits pull a hero across the line', () => {
    expect(lineOf(heroWith('thaumaturge', ['bold', 'reckless']))).toBe('front');
    expect(lineOf(heroWith('sabreur', ['craven', 'cautious']))).toBe('back');
    expect(lineOf(heroWith('pretre', ['bold']))).toBe('back');
    expect(lineOf(heroWith('pretre', ['bold', 'glory_hound']))).toBe('front');
  });
});

describe('signature acts', () => {
  it('fires every class act somewhere in a long run', () => {
    const world: World = newWorld(SEED);
    const seen = new Set<EventType>();

    for (let i = 0; i < 40_000; i++) {
      step(world);
      for (const e of world.pendingEvents) seen.add(e.type);
      world.pendingEvents.length = 0;
    }

    expect(seen.has('HERO_BLAST'), 'sapper charge never fired').toBe(true);
    expect(seen.has('HERO_RIPOSTE'), 'sabreur second cut never fired').toBe(true);
    expect(seen.has('HERO_SKIM'), 'cutpurse skim never fired').toBe(true);
    expect(seen.has('HERO_AID'), 'pretre last rites never fired').toBe(true);
    expect(seen.has('HERO_ARC'), 'thaumaturge arc never fired').toBe(true);
    expect(seen.has('HERO_SHIELDED'), 'bruiser intercept never fired').toBe(true);
  }, 120_000);
});
