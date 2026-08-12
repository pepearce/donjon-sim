declare const brand: unique symbol;

type Brand<T, B> = T & { readonly [brand]: B };

export type Cp = Brand<number, 'Cp'>;
export type Bp = Brand<number, 'Bp'>;
export type Milli = Brand<number, 'Milli'>;
export type TeamId = Brand<number, 'TeamId'>;
export type HeroId = Brand<number, 'HeroId'>;
export type FloorId = Brand<number, 'FloorId'>;
export type RoomId = Brand<number, 'RoomId'>;

export const cp = (n: number): Cp => n as Cp;
export const bp = (n: number): Bp => n as Bp;
export const milli = (n: number): Milli => n as Milli;
export const teamId = (n: number): TeamId => n as TeamId;
export const heroId = (n: number): HeroId => n as HeroId;
export const floorId = (n: number): FloorId => n as FloorId;
export const roomId = (n: number): RoomId => n as RoomId;

export const applyBp = (amount: number, rate: number): number =>
  Math.floor((amount * rate) / 10000);

export const MAX_TEAMS = 10;
export const MAX_ROSTER = 5;
