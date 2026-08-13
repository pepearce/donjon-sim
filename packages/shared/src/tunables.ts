export interface TunableSpec {
  default: number;
  min: number;
  max: number;
  step?: number;
  label: string;
}

export interface TunableEntry {
  key: string;
  group: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  value: number;
  overridden: boolean;
  updatedAt: number | null;
}

const registry = new Map<string, TunableEntry>();

function slotOf(key: string): TunableEntry {
  const slot = registry.get(key);
  if (!slot) throw new Error(`unknown tunable: ${key}`);
  return slot;
}

export function defineTunables<S extends Record<string, TunableSpec>>(
  group: string,
  specs: S,
): { readonly [K in keyof S]: number } {
  const out = {} as { [K in keyof S]: number };
  for (const [name, spec] of Object.entries(specs)) {
    const key = `${group}.${name}`;
    if (registry.has(key)) throw new Error(`duplicate tunable: ${key}`);
    if (spec.default < spec.min || spec.default > spec.max) {
      throw new Error(`default out of range: ${key}`);
    }
    const slot: TunableEntry = {
      key,
      group,
      label: spec.label,
      default: spec.default,
      min: spec.min,
      max: spec.max,
      step: spec.step ?? 1,
      value: spec.default,
      overridden: false,
      updatedAt: null,
    };
    registry.set(key, slot);
    Object.defineProperty(out, name, { get: () => slot.value, enumerable: true });
  }
  return out;
}

export function clampTunable(key: string, value: number): number {
  const slot = slotOf(key);
  if (!Number.isFinite(value)) throw new Error(`non-finite value for ${key}`);
  const stepped = Math.round(value / slot.step) * slot.step;
  const snapped = Number(stepped.toPrecision(12));
  return Math.min(slot.max, Math.max(slot.min, snapped));
}

export function setTunable(key: string, value: number, updatedAt: number): TunableEntry {
  const slot = slotOf(key);
  slot.value = clampTunable(key, value);
  slot.overridden = true;
  slot.updatedAt = updatedAt;
  return { ...slot };
}

export function resetTunable(key: string): TunableEntry {
  const slot = slotOf(key);
  slot.value = slot.default;
  slot.overridden = false;
  slot.updatedAt = null;
  return { ...slot };
}

export function getTunable(key: string): TunableEntry {
  return { ...slotOf(key) };
}

export function listTunables(): TunableEntry[] {
  return [...registry.values()]
    .map((slot) => ({ ...slot }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function applyOverrides(
  rows: Array<{ key: string; value: number; updatedAt: number }>,
): string[] {
  const skipped: string[] = [];
  for (const row of rows) {
    if (!registry.has(row.key)) {
      skipped.push(row.key);
      continue;
    }
    setTunable(row.key, row.value, row.updatedAt);
  }
  return skipped;
}
