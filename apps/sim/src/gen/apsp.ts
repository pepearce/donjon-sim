export interface Apsp {
  nextHop: Uint8Array;
  dist: Uint8Array;
}

export const UNREACHABLE = 255;

export function buildApsp(adjacency: readonly number[][]): Apsp {
  const n = adjacency.length;
  const nextHop = new Uint8Array(n * n).fill(UNREACHABLE);
  const dist = new Uint8Array(n * n).fill(UNREACHABLE);

  const queue = new Int32Array(n);
  const prev = new Int32Array(n);

  for (let source = 0; source < n; source++) {
    prev.fill(-1);
    const seen = new Uint8Array(n);
    let head = 0;
    let tail = 0;
    queue[tail++] = source;
    seen[source] = 1;
    dist[source * n + source] = 0;
    nextHop[source * n + source] = source;

    while (head < tail) {
      const cur = queue[head++] ?? 0;
      const neighbours = adjacency[cur] ?? [];
      for (const next of neighbours) {
        if (seen[next]) continue;
        seen[next] = 1;
        prev[next] = cur;
        dist[source * n + next] = Math.min(UNREACHABLE - 1, (dist[source * n + cur] ?? 0) + 1);
        queue[tail++] = next;
      }
    }

    for (let target = 0; target < n; target++) {
      if (target === source || !seen[target]) continue;
      let step = target;
      while ((prev[step] ?? -1) !== source && (prev[step] ?? -1) !== -1) step = prev[step] ?? source;
      nextHop[source * n + target] = step;
    }
  }

  return { nextHop, dist };
}

export function nextRoomTowards(
  apsp: { nextHop: Uint8Array },
  roomCount: number,
  from: number,
  to: number,
): number {
  if (from === to) return to;
  const step = apsp.nextHop[from * roomCount + to] ?? UNREACHABLE;
  return step === UNREACHABLE ? from : step;
}
