export class RingBuffer<T> {
  private readonly items: Array<T | undefined>;
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.items = new Array<T | undefined>(capacity);
  }

  push(value: T): void {
    this.items[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  get size(): number {
    return this.count;
  }

  toArray(): T[] {
    const out: T[] = [];
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      const v = this.items[(start + i) % this.capacity];
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  last(n: number): T[] {
    const all = this.toArray();
    return all.slice(Math.max(0, all.length - n));
  }
}
