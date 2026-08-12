import { randomUUID } from 'node:crypto';

export let EPOCH = randomUUID();

export function rotateEpoch(): string {
  EPOCH = randomUUID();
  return EPOCH;
}
