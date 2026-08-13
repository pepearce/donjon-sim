import { DAY_TICKS } from '@donjon/shared';
import { emit } from '../emit.js';
import { teamById } from '../world.js';
import { pushHistory, type RecordEntry, type Team, type World } from '../types.js';
import { adjustStanding } from './dungeon.js';

export const RECORD_KINDS = ['deepest', 'haul', 'kills', 'survivor', 'toll'];

export function setRecord(
  world: World,
  kind: string,
  label: string,
  value: number,
  holder: string,
  team: Team | undefined,
): void {
  const rounded = Math.round(value);
  const records = world.dungeon.records;
  const existing = records.find((r) => r.kind === kind);
  if (existing && rounded <= existing.value) return;

  const entry: RecordEntry = {
    kind,
    label,
    value: rounded,
    holder,
    teamName: team?.name ?? '',
    tick: world.tick,
  };

  if (existing) {
    Object.assign(existing, entry);
  } else {
    records.push(entry);
    records.sort((a, b) => RECORD_KINDS.indexOf(a.kind) - RECORD_KINDS.indexOf(b.kind));
  }

  emit(world, {
    type: 'RECORD_SET',
    teamId: team?.id ?? null,
    payload: { kind, label, value: rounded, holder, team: entry.teamName },
  });

  if (team) {
    adjustStanding(team, 5);
    pushHistory(team, world.tick, 'record', `${team.name} set a new record for ${label}: ${rounded}.`);
  }
}

export function updateSurvivorRecord(world: World): void {
  let best = 0;
  let holder = '';
  let holderTeam: Team | undefined;

  for (const hero of [...world.heroes].sort((a, b) => a.id - b.id)) {
    const end = hero.diedTick ?? world.tick;
    const age = end - hero.bornTick;
    if (age <= best) continue;
    best = age;
    holder = hero.name;
    holderTeam = hero.teamId === null ? undefined : teamById(world, hero.teamId);
  }

  if (holder === '') return;
  const existing = world.dungeon.records.find((r) => r.kind === 'survivor');
  if (existing && best < existing.value + DAY_TICKS) return;
  setRecord(world, 'survivor', 'longest service', best, holder, holderTeam);
}
