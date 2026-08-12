export function onFloor<T extends { floorId: number }>(
  items: readonly T[],
  floorId: number | null,
): T[] {
  if (floorId === null) return [];
  return items.filter((item) => item.floorId === floorId);
}

export function followFloor(
  focusedId: number | null,
  tokens: readonly { id: number; floorId: number }[],
  lastFollowed: number | null,
): number | null {
  if (focusedId === null) return null;
  const token = tokens.find((t) => t.id === focusedId);
  if (!token || token.floorId === lastFollowed) return null;
  return token.floorId;
}
