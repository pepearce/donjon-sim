import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { getRequestListener, type HttpBindings } from '@hono/node-server';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { PROTOCOL_VERSION, TICK_MS, type BootstrapDTO } from '@donjon/shared';
import { SIM_VERSION } from '../db/boot.js';
import { EPOCH } from '../epoch.js';
import { encodeFog } from '../engine/fog.js';
import {
  projectFloorIndex,
  projectFloorMap,
  projectSnapshot,
  projectTeamDetail,
  projectTeams,
} from '../snapshot/projector.js';
import type { Hub } from './hub.js';
import type { World } from '../engine/world.js';

export { EPOCH };

export interface HttpDeps {
  world: World;
  hub: Hub;
  speed(): number;
  port: number;
  onStats(): Record<string, unknown>;
}

function headers(cache = 'no-store'): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache,
    'Access-Control-Allow-Origin': '*',
  };
}

export function createHttpServer(deps: HttpDeps): Server {
  const { world, hub } = deps;
  const speed = (): number => deps.speed();

  const app = new Hono<{ Bindings: HttpBindings }>();

  app.use(async (c, next) => {
    if (c.req.method !== 'GET') {
      return c.json({ error: { code: 'method_not_allowed', message: 'GET only' } }, 405, headers());
    }
    await next();
  });

  app.get('/api/v1/floors/:id{[0-9]+}/map', (c) => {
    const map = projectFloorMap(world, Number(c.req.param('id')));
    if (!map) {
      return c.json({ error: { code: 'no_such_floor', message: c.req.path } }, 404, headers());
    }

    const etag = `"${createHash('sha1').update(map.tiles).digest('hex').slice(0, 16)}"`;
    if (c.req.header('if-none-match') === etag) {
      return c.body(null, 304, { ETag: etag, 'Cache-Control': 'no-cache' });
    }

    return c.json(map, 200, { ...headers('no-cache'), ETag: etag });
  });

  app.get('/api/v1/teams/:id{[0-9]+}/fog', (c) => {
    const team = world.teams.find((t) => t.id === Number(c.req.param('id')));
    if (!team) {
      return c.json({ error: { code: 'no_such_team', message: c.req.path } }, 404, headers());
    }
    const byFloor: Record<string, number[]> = {};
    for (const key of team.explored) {
      const [floorId, roomIdx] = key.split(':');
      if (floorId === undefined || roomIdx === undefined) continue;
      (byFloor[floorId] ??= []).push(Number(roomIdx));
    }

    const floor = world.floors.find((f) => f.id === team.floorId);
    const sight = new Set<number>([team.roomIdx]);
    if (floor) {
      for (const near of floor.adjacency[team.roomIdx] ?? []) sight.add(near);
    }

    return c.json(
      {
        teamId: team.id,
        floorId: team.floorId,
        roomIdx: team.roomIdx,
        explored: byFloor,
        sight: [...sight],
        tiles: encodeFog(team),
      },
      200,
      headers(),
    );
  });

  app.get('/api/v1/teams/:id{[0-9]+}/detail', (c) => {
    const detail = projectTeamDetail(world, Number(c.req.param('id')));
    if (!detail) {
      return c.json({ error: { code: 'no_such_team', message: c.req.path } }, 404, headers());
    }
    return c.json(detail, 200, headers());
  });

  app.get('/api/v1/bootstrap', (c) => {
    const body: BootstrapDTO = {
      server: {
        simVersion: SIM_VERSION,
        protocol: PROTOCOL_VERSION,
        tickMs: TICK_MS,
        speed: speed(),
        epoch: EPOCH,
      },
      snapshot: projectSnapshot(world, hub.cursor, speed()),
      cursor: hub.cursor,
      streamUrl: '/api/v1/stream',
    };
    return c.json(body, 200, headers());
  });

  app.get('/api/v1/state', (c) => c.json(projectSnapshot(world, hub.cursor, speed()), 200, headers()));

  app.get('/api/v1/teams', (c) => c.json({ teams: projectTeams(world) }, 200, headers()));

  app.get('/api/v1/floors', (c) => c.json({ floors: projectFloorIndex(world) }, 200, headers('max-age=60')));

  app.get('/api/v1/stream', (c) => {
    const raw = c.req.query('since');
    const since = raw === undefined || raw === '' ? null : Number(raw);
    hub.add(c.env.outgoing, world, Number.isFinite(since) ? since : null);
    return RESPONSE_ALREADY_SENT;
  });

  app.get('/healthz', (c) => c.json({ ok: true, tick: world.tick }, 200, headers()));

  app.get('/metrics', (c) => c.json(deps.onStats(), 200, headers()));

  app.notFound((c) => c.json({ error: { code: 'not_found', message: c.req.path } }, 404, headers()));

  return createServer(getRequestListener(app.fetch));
}
