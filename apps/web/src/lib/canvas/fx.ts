import type { EventType, Severity } from '@donjon/shared';
import type { FxEvent } from '../applyFrame.js';
import { FX_PALETTE, withAlpha } from '../design/teams.js';

export const MAX_PARTICLES = 220;
export const MAX_MARKERS = 40;
export const MAX_INGEST_AGE_MS = 500;
export const DRAMA_CAPACITY = 48;
export const MARKER_LIFE_MS = 180_000;

export type FxKind = 'ring' | 'spark' | 'text' | 'glint' | 'marker' | 'rect' | 'arrow';

export interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  born: number;
  life: number;
  color: string;
  size: number;
  size2: number;
  grow: number;
  text: string;
  weight: number;
}

export interface DramaBeat {
  teamId: number;
  type: EventType;
  severity: Severity;
  born: number;
}

export interface FxView {
  offsetX: number;
  offsetY: number;
  tilePx: number;
  width: number;
  height: number;
}

export interface FxAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
  room: boolean;
}

export type FxResolver = (fx: FxEvent) => FxAnchor | null;

const LABELS: Partial<Record<EventType, string>> = {
  COMBAT_START: 'CLASH',
  MONSTER_DOWN: 'SLAIN',
  HERO_DOWN: 'DOWN',
  HERO_DEATH: 'FALLEN',
  TEAM_WIPE: 'WIPED',
  LOOT_FOUND: 'LOOT',
  TRAP_SPRUNG: 'TRAP',
  TRAP_DISARMED: 'DISARMED',
  HERO_LEVEL_UP: 'LEVEL UP',
  ROOM_CLEARED: 'CLEARED',
  FLOOR_DESCEND: 'DESCEND',
  HERO_NEMESIS_SLAIN: 'NEMESIS',
  RECORD_SET: 'RECORD',
  ROOM_LANDMARK: 'LANDMARK',
};

const DRAMA_WEIGHT: Partial<Record<EventType, number>> = {
  COMBAT_START: 26,
  COMBAT_END: 6,
  MONSTER_DOWN: 14,
  HERO_DOWN: 42,
  HERO_DEATH: 64,
  TEAM_WIPE: 90,
  TRAP_SPRUNG: 30,
  TRAP_DISARMED: 10,
  LOOT_FOUND: 12,
  HERO_LEVEL_UP: 16,
  ROOM_CLEARED: 10,
  FLOOR_DESCEND: 22,
  HERO_NEMESIS_SLAIN: 70,
  RECORD_SET: 52,
  ROOM_LANDMARK: 18,
};

export function dramaWeight(type: EventType, severity: Severity): number {
  return (DRAMA_WEIGHT[type] ?? 8) + severity * 6;
}

function blank(): Particle {
  return {
    kind: 'ring',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    drag: 0,
    born: 0,
    life: 600,
    color: FX_PALETTE.clash,
    size: 0.5,
    size2: 0,
    grow: 0,
    text: '',
    weight: 1,
  };
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export class FxLayer {
  private parts: Particle[] = [];
  private markers: Particle[] = [];
  private beats: DramaBeat[] = [];
  private seed = 1;

  get particleCount(): number {
    return this.parts.length + this.markers.length;
  }

  get drama(): readonly DramaBeat[] {
    return this.beats;
  }

  dramaSince(cutoff: number): DramaBeat[] {
    return this.beats.filter((b) => b.born >= cutoff);
  }

  clearParticles(): void {
    this.parts.length = 0;
    this.markers.length = 0;
  }

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private push(p: Particle): void {
    if (p.kind === 'marker') {
      this.markers.push(p);
      if (this.markers.length > MAX_MARKERS) this.markers.splice(0, this.markers.length - MAX_MARKERS);
      return;
    }
    this.parts.push(p);
    if (this.parts.length > MAX_PARTICLES) this.parts.splice(0, this.parts.length - MAX_PARTICLES);
  }

  private ring(now: number, x: number, y: number, color: string, size: number, grow: number, life: number, weight = 2): void {
    const p = blank();
    p.kind = 'ring';
    p.x = x;
    p.y = y;
    p.born = now;
    p.life = life;
    p.color = color;
    p.size = size;
    p.grow = grow;
    p.weight = weight;
    this.push(p);
  }

  private label(now: number, x: number, y: number, color: string, text: string, life = 1500): void {
    if (!text) return;
    const p = blank();
    p.kind = 'text';
    p.x = x;
    p.y = y - 0.4;
    p.vy = -0.9;
    p.born = now;
    p.life = life;
    p.color = color;
    p.text = text;
    p.size = 0.62;
    this.push(p);
  }

  private burst(now: number, x: number, y: number, color: string, count: number, speed: number, life = 850): void {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + this.rand() * 0.6;
      const s = speed * (0.55 + this.rand() * 0.8);
      const p = blank();
      p.kind = 'spark';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.drag = 2.4;
      p.born = now;
      p.life = life * (0.7 + this.rand() * 0.6);
      p.color = color;
      p.size = 0.11 + this.rand() * 0.09;
      this.push(p);
    }
  }

  ingest(queue: FxEvent[], resolve: FxResolver, now: number, reduced: boolean): void {
    for (let i = queue.length - 1; i >= 0; i--) {
      const fx = queue[i];
      if (!fx) {
        queue.splice(i, 1);
        continue;
      }
      queue.splice(i, 1);

      if (fx.teamId !== null) {
        this.beats.push({ teamId: fx.teamId, type: fx.type, severity: fx.severity, born: fx.born });
        if (this.beats.length > DRAMA_CAPACITY) this.beats.splice(0, this.beats.length - DRAMA_CAPACITY);
      }

      const anchor = resolve(fx);
      if (!anchor) continue;

      const stale = now - fx.born > MAX_INGEST_AGE_MS;
      const persistent = fx.type === 'HERO_DEATH' || fx.type === 'TEAM_WIPE';
      if (stale && !persistent) continue;

      this.spawn(fx, anchor, now, reduced);
    }
  }

  private spawn(fx: FxEvent, anchor: FxAnchor, now: number, reduced: boolean): void {
    const x = anchor.x;
    const y = anchor.y;
    const text = LABELS[fx.type] ?? '';

    if (reduced) {
      if (fx.type === 'HERO_DEATH' || fx.type === 'TEAM_WIPE') this.marker(now, x, y, fx.type === 'TEAM_WIPE');
      this.ring(now, x, y, this.tint(fx), 0.8, 0, 900, 2);
      this.label(now, x, y, this.tint(fx), text, 1400);
      return;
    }

    switch (fx.type) {
      case 'COMBAT_START': {
        this.ring(now, x, y, FX_PALETTE.clash, 0.5, 1.9, 620, 2.5);
        this.ring(now, x, y, FX_PALETTE.blood, 0.35, 1.2, 460, 1.5);
        this.burst(now, x, y, FX_PALETTE.clash, 6, 2.6, 520);
        break;
      }
      case 'COMBAT_END':
        this.ring(now, x, y, withAlpha(FX_PALETTE.cleared, 0.7), 1.4, -1.0, 620, 1.5);
        break;
      case 'MONSTER_DOWN':
        this.burst(now, x, y, FX_PALETTE.monster, 7, 2.2, 700);
        this.label(now, x, y, FX_PALETTE.monster, text, 1100);
        break;
      case 'HERO_DOWN':
        this.ring(now, x, y, FX_PALETTE.blood, 0.4, 2.2, 700, 3);
        this.burst(now, x, y, FX_PALETTE.blood, 9, 2.8, 850);
        this.label(now, x, y, FX_PALETTE.blood, text, 1500);
        break;
      case 'HERO_DEATH':
        this.marker(now, x, y, false);
        this.ring(now, x, y, FX_PALETTE.death, 0.4, 3.0, 1000, 3.5);
        this.burst(now, x, y, FX_PALETTE.death, 12, 3.4, 1100);
        this.label(now, x, y, FX_PALETTE.death, text, 1900);
        break;
      case 'TEAM_WIPE':
        this.marker(now, x, y, true);
        this.ring(now, x, y, FX_PALETTE.death, 0.5, 5.5, 1500, 4);
        this.ring(now, x, y, FX_PALETTE.blood, 0.5, 3.4, 1100, 2.5);
        this.burst(now, x, y, FX_PALETTE.death, 18, 4.2, 1500);
        this.label(now, x, y, FX_PALETTE.death, text, 2400);
        break;
      case 'LOOT_FOUND': {
        const g = blank();
        g.kind = 'glint';
        g.x = x;
        g.y = y;
        g.born = now;
        g.life = 1100;
        g.color = FX_PALETTE.loot;
        g.size = 0.95;
        this.push(g);
        for (let i = 0; i < 5; i++) {
          const p = blank();
          p.kind = 'spark';
          p.x = x + (this.rand() - 0.5) * 0.6;
          p.y = y + (this.rand() - 0.5) * 0.4;
          p.vy = -1.1 - this.rand();
          p.vx = (this.rand() - 0.5) * 0.8;
          p.drag = 1.2;
          p.born = now;
          p.life = 900 + this.rand() * 400;
          p.color = FX_PALETTE.loot;
          p.size = 0.1 + this.rand() * 0.07;
          this.push(p);
        }
        this.label(now, x, y, FX_PALETTE.loot, text, 1300);
        break;
      }
      case 'TRAP_SPRUNG':
        this.ring(now, x, y, FX_PALETTE.trap, 0.3, 2.6, 620, 3);
        this.burst(now, x, y, FX_PALETTE.trap, 10, 3.4, 700);
        this.label(now, x, y, FX_PALETTE.trap, text, 1400);
        break;
      case 'TRAP_DISARMED':
        this.ring(now, x, y, FX_PALETTE.disarm, 1.1, -0.9, 700, 1.5);
        this.label(now, x, y, FX_PALETTE.disarm, text, 1100);
        break;
      case 'HERO_LEVEL_UP':
        for (let i = 0; i < 7; i++) {
          const p = blank();
          p.kind = 'spark';
          p.x = x + (this.rand() - 0.5) * 0.9;
          p.y = y + 0.3;
          p.vy = -1.6 - this.rand() * 1.2;
          p.vx = (this.rand() - 0.5) * 0.5;
          p.drag = 0.6;
          p.born = now;
          p.life = 900 + this.rand() * 500;
          p.color = FX_PALETTE.level;
          p.size = 0.1 + this.rand() * 0.06;
          this.push(p);
        }
        this.ring(now, x, y, FX_PALETTE.level, 0.4, 1.4, 700, 2);
        this.label(now, x, y, FX_PALETTE.level, text, 1600);
        break;
      case 'ROOM_CLEARED':
        this.rect(now, anchor, FX_PALETTE.cleared, 1200);
        break;
      case 'ROOM_LANDMARK':
        this.rect(now, anchor, FX_PALETTE.landmark, 2200);
        this.label(now, x, y, FX_PALETTE.landmark, text, 2000);
        break;
      case 'FLOOR_DESCEND': {
        for (let i = 0; i < 3; i++) {
          const p = blank();
          p.kind = 'ring';
          p.x = x;
          p.y = y;
          p.born = now + i * 130;
          p.life = 900;
          p.color = FX_PALETTE.descend;
          p.size = 2.6;
          p.grow = -2.2;
          p.weight = 2;
          this.push(p);
        }
        const a = blank();
        a.kind = 'arrow';
        a.x = x;
        a.y = y;
        a.born = now;
        a.life = 1100;
        a.color = FX_PALETTE.descend;
        a.size = 0.8;
        this.push(a);
        this.label(now, x, y - 0.6, FX_PALETTE.descend, text, 1500);
        break;
      }
      case 'HERO_NEMESIS_SLAIN':
        this.ring(now, x, y, FX_PALETTE.blood, 0.3, 4.0, 1200, 3);
        this.burst(now, x, y, FX_PALETTE.record, 14, 3.6, 1200);
        this.label(now, x, y, FX_PALETTE.record, text, 2000);
        break;
      case 'RECORD_SET': {
        this.ring(now, x, y, FX_PALETTE.record, 0.6, 2.8, 1400, 3);
        const g = blank();
        g.kind = 'glint';
        g.x = x;
        g.y = y;
        g.born = now;
        g.life = 1600;
        g.color = FX_PALETTE.record;
        g.size = 1.5;
        this.push(g);
        this.label(now, x, y, FX_PALETTE.record, text, 2200);
        break;
      }
      default:
        this.ring(now, x, y, this.tint(fx), 0.5, 1.6, 700, 2);
    }
  }

  private tint(fx: FxEvent): string {
    if (fx.severity >= 3) return FX_PALETTE.death;
    if (fx.severity === 2) return FX_PALETTE.clash;
    return FX_PALETTE.cleared;
  }

  private rect(now: number, anchor: FxAnchor, color: string, life: number): void {
    const p = blank();
    p.kind = 'rect';
    p.x = anchor.x;
    p.y = anchor.y;
    p.born = now;
    p.life = life;
    p.color = color;
    p.size = Math.max(anchor.w, 1);
    p.size2 = Math.max(anchor.h, 1);
    p.weight = 2;
    this.push(p);
  }

  private marker(now: number, x: number, y: number, wipe: boolean): void {
    const p = blank();
    p.kind = 'marker';
    p.x = x;
    p.y = y;
    p.born = now;
    p.life = MARKER_LIFE_MS;
    p.color = wipe ? FX_PALETTE.death : FX_PALETTE.blood;
    p.size = wipe ? 0.46 : 0.34;
    p.weight = wipe ? 2 : 1.4;
    this.push(p);
  }

  step(now: number, dtMs: number, reduced: boolean): void {
    const dt = reduced ? 0 : Math.min(dtMs, 120) / 1000;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (!p) {
        this.parts.splice(i, 1);
        continue;
      }
      if (now - p.born > p.life) {
        this.parts.splice(i, 1);
        continue;
      }
      if (dt > 0 && (p.kind === 'spark' || p.kind === 'text')) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx *= damp;
        p.vy *= damp;
      }
    }
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      if (!m || now - m.born > m.life) this.markers.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: FxView, now: number): void {
    const { offsetX, offsetY, tilePx } = view;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const m of this.markers) this.paint(ctx, m, now, offsetX, offsetY, tilePx, view);
    for (const p of this.parts) this.paint(ctx, p, now, offsetX, offsetY, tilePx, view);

    ctx.restore();
  }

  private paint(
    ctx: CanvasRenderingContext2D,
    p: Particle,
    now: number,
    offsetX: number,
    offsetY: number,
    tilePx: number,
    view: FxView,
  ): void {
    const age = now - p.born;
    if (age < 0) return;
    const t = Math.min(1, age / p.life);
    const sx = offsetX + (p.x + 0.5) * tilePx;
    const sy = offsetY + (p.y + 0.5) * tilePx;
    if (sx < -tilePx * 6 || sy < -tilePx * 6 || sx > view.width + tilePx * 6 || sy > view.height + tilePx * 6) {
      return;
    }

    switch (p.kind) {
      case 'ring': {
        const r = (p.size + p.grow * easeOut(t)) * tilePx;
        if (r <= 0.5) return;
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.weight * Math.max(0.6, tilePx / 14));
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'spark': {
        ctx.globalAlpha = (1 - t) ** 1.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.8, p.size * tilePx), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'text': {
        const size = Math.max(9, p.size * tilePx);
        if (tilePx < 6) return;
        ctx.globalAlpha = t < 0.15 ? t / 0.15 : (1 - t) ** 0.9;
        ctx.font = `700 ${Math.round(size)}px ui-monospace, SFMono-Regular, monospace`;
        ctx.lineWidth = Math.max(2, size * 0.28);
        ctx.strokeStyle = 'rgba(5, 4, 3, 0.9)';
        ctx.lineJoin = 'round';
        ctx.strokeText(p.text, sx, sy);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, sx, sy);
        break;
      }
      case 'glint': {
        const pulse = Math.sin(t * Math.PI);
        const r = p.size * tilePx * (0.5 + pulse);
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, tilePx / 12);
        ctx.beginPath();
        ctx.moveTo(sx - r, sy);
        ctx.lineTo(sx + r, sy);
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx, sy + r);
        const d = r * 0.45;
        ctx.moveTo(sx - d, sy - d);
        ctx.lineTo(sx + d, sy + d);
        ctx.moveTo(sx + d, sy - d);
        ctx.lineTo(sx - d, sy + d);
        ctx.stroke();
        break;
      }
      case 'rect': {
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.weight * Math.max(0.6, tilePx / 16));
        const w = p.size * tilePx;
        const h = p.size2 * tilePx;
        ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
        break;
      }
      case 'arrow': {
        const drop = easeOut(t) * tilePx * 1.4;
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.5, tilePx / 8);
        const r = p.size * tilePx;
        ctx.beginPath();
        ctx.moveTo(sx, sy - r + drop);
        ctx.lineTo(sx, sy + r * 0.4 + drop);
        ctx.moveTo(sx - r * 0.6, sy - r * 0.2 + drop);
        ctx.lineTo(sx, sy + r * 0.4 + drop);
        ctx.lineTo(sx + r * 0.6, sy - r * 0.2 + drop);
        ctx.stroke();
        break;
      }
      case 'marker': {
        const fade = 1 - t;
        ctx.globalAlpha = 0.18 + fade * 0.62;
        const r = Math.max(2, p.size * tilePx);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.weight * Math.max(0.5, tilePx / 18));
        ctx.beginPath();
        ctx.moveTo(sx - r, sy - r);
        ctx.lineTo(sx + r, sy + r);
        ctx.moveTo(sx + r, sy - r);
        ctx.lineTo(sx - r, sy + r);
        ctx.stroke();
        ctx.globalAlpha = (0.18 + fade * 0.62) * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
