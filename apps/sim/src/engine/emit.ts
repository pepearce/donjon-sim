import { SEVERITY, type EventType, type SimEvent } from '@donjon/shared';
import type { World } from './world.js';

export interface EmitInput {
  type: EventType;
  teamId?: number | null;
  heroId?: number | null;
  floorId?: number | null;
  roomId?: number | null;
  payload?: Record<string, string | number>;
}

export function emit(world: World, input: EmitInput): SimEvent {
  const event: SimEvent = {
    id: world.nextEventId,
    tick: world.tick,
    type: input.type,
    severity: SEVERITY[input.type],
    teamId: input.teamId ?? null,
    heroId: input.heroId ?? null,
    floorId: input.floorId ?? null,
    roomId: input.roomId ?? null,
    payload: input.payload ?? {},
  };
  world.nextEventId += 1;
  world.pendingEvents.push(event);
  world.tailRing.push(event);
  return event;
}
