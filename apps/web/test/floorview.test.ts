import { describe, expect, it } from 'vitest';
import { followFloor, onFloor } from '../src/lib/floorview.js';

const tok = (id: number, floorId: number): { id: number; floorId: number } => ({ id, floorId });

describe('onFloor', () => {
  it('keeps only entities belonging to the given floor', () => {
    const items = [tok(1, 1), tok(2, 2), tok(3, 1)];
    expect(onFloor(items, 1).map((t) => t.id)).toEqual([1, 3]);
  });

  it('draws nothing when no floor is loaded', () => {
    expect(onFloor([tok(1, 1)], null)).toEqual([]);
  });
});

describe('followFloor', () => {
  it('returns nothing when no team is focused', () => {
    expect(followFloor(null, [tok(1, 2)], null)).toBeNull();
  });

  it('follows the focused team onto its floor', () => {
    expect(followFloor(1, [tok(1, 3)], null)).toBe(3);
  });

  it('follows again when the focused team changes floor', () => {
    expect(followFloor(1, [tok(1, 4)], 3)).toBe(4);
  });

  it('stays put while the focused team stays on the floor it was followed to', () => {
    expect(followFloor(1, [tok(1, 3)], 3)).toBeNull();
  });

  it('returns nothing when the focused team has no token', () => {
    expect(followFloor(9, [tok(1, 3)], null)).toBeNull();
  });
});
