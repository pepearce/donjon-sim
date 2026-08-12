export type WakeKind =
  | 'RESTOCK'
  | 'BLEED_OUT'
  | 'CORPSE_SWEEP'
  | 'ARRIVAL'
  | 'TRAP_REARM'
  | 'DAY_TURN';

export interface Wake {
  dueTick: number;
  kind: WakeKind;
  entityId: number;
  seq: number;
}

export class Scheduler {
  private readonly heap: Wake[] = [];
  private seq = 0;

  get size(): number {
    return this.heap.length;
  }

  schedule(dueTick: number, kind: WakeKind, entityId: number): void {
    const wake: Wake = { dueTick, kind, entityId, seq: this.seq++ };
    this.heap.push(wake);
    this.bubbleUp(this.heap.length - 1);
  }

  popDue(tick: number): Wake[] {
    const out: Wake[] = [];
    while (this.heap.length > 0) {
      const top = this.heap[0];
      if (!top || top.dueTick > tick) break;
      out.push(this.pop());
    }
    return out;
  }

  peekDueTick(): number {
    return this.heap[0]?.dueTick ?? Number.POSITIVE_INFINITY;
  }

  cancel(kind: WakeKind, entityId: number): void {
    for (let i = this.heap.length - 1; i >= 0; i--) {
      const w = this.heap[i];
      if (w && w.kind === kind && w.entityId === entityId) this.removeAt(i);
    }
  }

  toArray(): Wake[] {
    return [...this.heap].sort((a, b) => a.dueTick - b.dueTick || a.seq - b.seq);
  }

  load(wakes: Wake[]): void {
    this.heap.length = 0;
    for (const w of wakes) {
      this.heap.push({ ...w, seq: this.seq++ });
      this.bubbleUp(this.heap.length - 1);
    }
  }

  private pop(): Wake {
    const top = this.heap[0];
    if (!top) throw new Error('pop from empty scheduler');
    const last = this.heap.pop();
    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private removeAt(index: number): void {
    const last = this.heap.pop();
    if (index >= this.heap.length || !last) return;
    this.heap[index] = last;
    this.bubbleDown(index);
    this.bubbleUp(index);
  }

  private less(a: Wake, b: Wake): boolean {
    return a.dueTick < b.dueTick || (a.dueTick === b.dueTick && a.seq < b.seq);
  }

  private bubbleUp(start: number): void {
    let i = start;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const a = this.heap[i];
      const b = this.heap[parent];
      if (!a || !b || !this.less(a, b)) break;
      this.heap[i] = b;
      this.heap[parent] = a;
      i = parent;
    }
  }

  private bubbleDown(start: number): void {
    let i = start;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      const cur = this.heap[smallest];
      const l = this.heap[left];
      const r = this.heap[right];
      if (l && cur && this.less(l, cur)) smallest = left;
      const s1 = this.heap[smallest];
      if (r && s1 && this.less(r, s1)) smallest = right;
      if (smallest === i) break;
      const a = this.heap[i];
      const b = this.heap[smallest];
      if (!a || !b) break;
      this.heap[i] = b;
      this.heap[smallest] = a;
      i = smallest;
    }
  }
}
