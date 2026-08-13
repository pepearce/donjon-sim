import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  clampTunable,
  defineTunables,
  getTunable,
  listTunables,
  resetTunable,
  setTunable,
} from '@donjon/shared';

const T = defineTunables('test-reg', {
  intKnob: { default: 10, min: 0, max: 100, label: 'Int knob' },
  floatKnob: { default: 0.3, min: 0, max: 1, step: 0.01, label: 'Float knob' },
});

describe('defineTunables', () => {
  it('returns live getters with defaults', () => {
    expect(T.intKnob).toBe(10);
    expect(T.floatKnob).toBe(0.3);
  });

  it('throws on duplicate key', () => {
    expect(() => defineTunables('test-reg', { intKnob: { default: 1, min: 0, max: 2, label: 'x' } }))
      .toThrow('duplicate tunable: test-reg.intKnob');
  });

  it('throws when default is outside min/max', () => {
    expect(() => defineTunables('test-bad', { k: { default: 5, min: 10, max: 20, label: 'x' } }))
      .toThrow('default out of range: test-bad.k');
  });
});

describe('setTunable', () => {
  it('updates the live getter', () => {
    setTunable('test-reg.intKnob', 42, 1000);
    expect(T.intKnob).toBe(42);
    const entry = getTunable('test-reg.intKnob');
    expect(entry.overridden).toBe(true);
    expect(entry.updatedAt).toBe(1000);
    resetTunable('test-reg.intKnob');
  });

  it('clamps to min/max', () => {
    setTunable('test-reg.intKnob', 999, 1000);
    expect(T.intKnob).toBe(100);
    setTunable('test-reg.intKnob', -5, 1000);
    expect(T.intKnob).toBe(0);
    resetTunable('test-reg.intKnob');
  });

  it('rounds to step (integers by default, floats by step)', () => {
    setTunable('test-reg.intKnob', 41.7, 1000);
    expect(T.intKnob).toBe(42);
    setTunable('test-reg.floatKnob', 0.4567, 1000);
    expect(T.floatKnob).toBeCloseTo(0.46, 10);
    resetTunable('test-reg.intKnob');
    resetTunable('test-reg.floatKnob');
  });

  it('throws on unknown key and non-finite value', () => {
    expect(() => setTunable('nope.nope', 1, 0)).toThrow('unknown tunable: nope.nope');
    expect(() => setTunable('test-reg.intKnob', Number.NaN, 0)).toThrow();
  });
});

describe('clampTunable', () => {
  it('clamps and rounds without mutating', () => {
    expect(clampTunable('test-reg.intKnob', 999.9)).toBe(100);
    expect(getTunable('test-reg.intKnob').value).toBe(10);
  });
});

describe('resetTunable', () => {
  it('restores the default and clears the override flag', () => {
    setTunable('test-reg.intKnob', 42, 1000);
    const entry = resetTunable('test-reg.intKnob');
    expect(entry.value).toBe(10);
    expect(entry.overridden).toBe(false);
    expect(entry.updatedAt).toBeNull();
  });
});

describe('applyOverrides', () => {
  it('applies known keys and returns unknown ones', () => {
    const skipped = applyOverrides([
      { key: 'test-reg.intKnob', value: 55, updatedAt: 7 },
      { key: 'gone.key', value: 1, updatedAt: 7 },
    ]);
    expect(T.intKnob).toBe(55);
    expect(skipped).toEqual(['gone.key']);
    resetTunable('test-reg.intKnob');
  });
});

describe('listTunables', () => {
  it('includes registered entries sorted by key with copies, not live refs', () => {
    const entries = listTunables().filter((e) => e.group === 'test-reg');
    expect(entries.map((e) => e.key)).toEqual(['test-reg.floatKnob', 'test-reg.intKnob']);
    entries[1]!.value = 999;
    expect(T.intKnob).toBe(10);
  });
});
