import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
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

function json(res: ServerResponse, status: number, body: unknown, cache = 'no-store'): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache,
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function createHttpServer(deps: HttpDeps): Server {
  const { world, hub } = deps;
  const speed = (): number => deps.speed();

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    if (req.method !== 'GET') {
      json(res, 405, { error: { code: 'method_not_allowed', message: 'GET only' } });
      return;
    }

    const mapMatch = /^\/api\/v1\/floors\/(\d+)\/map$/.exec(path);
    if (mapMatch) {
      const map = projectFloorMap(world, Number(mapMatch[1]));
      if (!map) {
        json(res, 404, { error: { code: 'no_such_floor', message: path } });
        return;
      }

      const etag = `"${createHash('sha1').update(map.tiles).digest('hex').slice(0, 16)}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
        res.end();
        return;
      }

      const payload = JSON.stringify(map);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        ETag: etag,
        'Access-Control-Allow-Origin': '*',
        'Content-Length': Buffer.byteLength(payload),
      });
      res.end(payload);
      return;
    }

    const fogMatch = /^\/api\/v1\/teams\/(\d+)\/fog$/.exec(path);
    if (fogMatch) {
      const team = world.teams.find((t) => t.id === Number(fogMatch[1]));
      if (!team) {
        json(res, 404, { error: { code: 'no_such_team', message: path } });
        return;
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

      json(res, 200, {
        teamId: team.id,
        floorId: team.floorId,
        roomIdx: team.roomIdx,
        explored: byFloor,
        sight: [...sight],
        tiles: encodeFog(team),
      });
      return;
    }

    const detailMatch = /^\/api\/v1\/teams\/(\d+)\/detail$/.exec(path);
    if (detailMatch) {
      const detail = projectTeamDetail(world, Number(detailMatch[1]));
      if (!detail) {
        json(res, 404, { error: { code: 'no_such_team', message: path } });
        return;
      }
      json(res, 200, detail);
      return;
    }

    switch (path) {
      case '/api/v1/bootstrap': {
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
        json(res, 200, body);
        return;
      }
      case '/api/v1/state':
        json(res, 200, projectSnapshot(world, hub.cursor, speed()));
        return;
      case '/api/v1/teams':
        json(res, 200, { teams: projectTeams(world) });
        return;
      case '/api/v1/floors':
        json(res, 200, { floors: projectFloorIndex(world) }, 'max-age=60');
        return;
      case '/api/v1/stream': {
        const raw = url.searchParams.get('since');
        const since = raw === null || raw === '' ? null : Number(raw);
        hub.add(res, world, Number.isFinite(since) ? since : null);
        return;
      }
      case '/healthz':
        json(res, 200, { ok: true, tick: world.tick });
        return;
      case '/metrics':
        json(res, 200, deps.onStats());
        return;
      default:
        json(res, 404, { error: { code: 'not_found', message: path } });
    }
  };

  return createServer(handler);
}
