import type { ServerResponse } from 'node:http';
import type { SnapshotDTO } from '@donjon/shared';
import { buildFrame } from '../snapshot/delta.js';
import { projectSnapshot } from '../snapshot/projector.js';
import type { World } from '../engine/types.js';

interface Client {
  id: number;
  res: ServerResponse;
  needsResync: boolean;
}

export interface HubStats {
  clients: number;
  seq: number;
  framesSent: number;
  bytesSent: number;
  evicted: number;
  resyncs: number;
  ringSize: number;
}

const SLOW_CLIENT_BYTES = 512 * 1024;
const KILL_CLIENT_BYTES = 4 * 1024 * 1024;
const RING_CAPACITY = 600;

export class Hub {
  private readonly clients = new Map<number, Client>();
  private readonly ring: Array<{ seq: number; buffer: Buffer }> = [];
  private nextClientId = 1;
  private seq = 0;
  private lastSnapshot: SnapshotDTO | null = null;
  private cachedSnapshot: { seq: number; buffer: Buffer } | null = null;

  readonly stats: HubStats = {
    clients: 0,
    seq: 0,
    framesSent: 0,
    bytesSent: 0,
    evicted: 0,
    resyncs: 0,
    ringSize: 0,
  };

  constructor(private speed: number) {}

  get cursor(): number {
    return this.seq;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  private snapshotBuffer(world: World): { seq: number; buffer: Buffer } {
    if (this.cachedSnapshot && this.cachedSnapshot.seq === this.seq) return this.cachedSnapshot;
    const snap = projectSnapshot(world, this.seq, this.speed);
    const buffer = Buffer.from(
      `event: snapshot\nid: ${this.seq}\ndata: ${JSON.stringify(snap)}\n\n`,
      'utf8',
    );
    this.cachedSnapshot = { seq: this.seq, buffer };
    return this.cachedSnapshot;
  }

  add(res: ServerResponse, world: World, since: number | null): number {
    const id = this.nextClientId++;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 2000\n: donjon-sim tick=${world.tick}\n\n`);

    const oldest = this.ring[0]?.seq ?? this.seq;
    const replayable = since !== null && since >= oldest && since < this.seq;

    if (replayable) {
      const gap = this.ring.filter((f) => f.seq > since).map((f) => f.buffer);
      if (gap.length > 0) res.write(Buffer.concat(gap));
    } else {
      res.write(this.snapshotBuffer(world).buffer);
    }

    const client: Client = { id, res, needsResync: false };
    this.clients.set(id, client);
    this.stats.clients = this.clients.size;

    res.on('close', () => {
      this.clients.delete(id);
      this.stats.clients = this.clients.size;
    });

    return id;
  }

  broadcast(world: World): void {
    const previous = this.lastSnapshot;
    const from = this.seq;
    this.seq += 1;
    this.stats.seq = this.seq;

    const next = projectSnapshot(world, this.seq, this.speed);
    let buffer: Buffer;

    if (previous) {
      const frame = buildFrame(previous, next, {
        seq: this.seq,
        from,
        fromTick: previous.tick,
        speed: this.speed,
      });
      buffer = Buffer.from(`event: frame\nid: ${this.seq}\ndata: ${JSON.stringify(frame)}\n\n`, 'utf8');
    } else {
      buffer = Buffer.from(
        `event: snapshot\nid: ${this.seq}\ndata: ${JSON.stringify(next)}\n\n`,
        'utf8',
      );
    }

    this.lastSnapshot = next;
    this.cachedSnapshot = null;
    for (const team of world.teams) team.trail.length = 0;

    this.ring.push({ seq: this.seq, buffer });
    while (this.ring.length > RING_CAPACITY) this.ring.shift();
    this.stats.ringSize = this.ring.length;

    if (this.clients.size === 0) return;

    for (const client of this.clients.values()) {
      if (client.res.writableLength > KILL_CLIENT_BYTES) {
        client.res.write('event: bye\ndata: {"reason":"too-slow"}\n\n');
        client.res.end();
        this.clients.delete(client.id);
        this.stats.evicted += 1;
        continue;
      }

      if (client.res.writableLength > SLOW_CLIENT_BYTES || client.needsResync) {
        client.needsResync = false;
        this.stats.resyncs += 1;
        client.res.write(this.snapshotBuffer(world).buffer);
        continue;
      }

      client.res.write(buffer);
      this.stats.framesSent += 1;
      this.stats.bytesSent += buffer.length;
    }
    this.stats.clients = this.clients.size;
  }

  heartbeat(): void {
    for (const client of this.clients.values()) client.res.write(': hb\n\n');
  }

  closeAll(): void {
    for (const client of this.clients.values()) {
      client.res.write('event: bye\ndata: {"reason":"shutdown"}\n\n');
      client.res.end();
    }
    this.clients.clear();
    this.stats.clients = 0;
  }
}
