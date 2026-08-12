# Donjon Sim

A perpetually-running simulation of a for-profit dungeon, in the world of *Donjon*
(Sfar & Trondheim, 1998). Parties of anthropomorphic heroes form, delve, loot, argue and die;
the Keeper bills them for it. A web dashboard shows the live state: a canvas tile map with
moving party tokens, a narrated event feed, a leaderboard, the Keeper's balance sheet and a
memorial to the fallen.

The simulation runs independently of any browser. Zero LLM calls at runtime — all prose comes
from a deterministic template engine over hand-authored content packs.

## The heroes have opinions

A hero carries up to two traits that steer real decisions rather than decorating a card. A
craven party breaks earlier and a bold one later; the greedy hero takes the loot; the vengeful
one goes for its nemesis; the cautious one scouts the trap; the loyal and the pious are the
reason anyone gets dragged back from bleeding out.

Nemeses are keyed on the monster's *name*, never its id — monsters are recreated with fresh
ids on every restock, so an id would dangle within the hour. Relations accumulate between
heroes: rescuing someone builds a bond, abandoning them while they bleed builds a grudge, and
both feed back into grief, morale and who is willing to walk into the dark together again.
Bonds are common and grudges are rare, which is the correct ratio for a workplace.

Teams keep a history and a standing with the Keeper. The Keeper runs named schemes against
whoever is winning, and a records board tracks what the dungeon has not seen before. Rooms
earn reputations from the deaths they have swallowed.

## Run it

```bash
npm install
npm run sim     # simulation + API on :8787, admin on 127.0.0.1:8788
npm run web     # dashboard on :5173
```

Open http://localhost:5173. A text-only, screen-reader-friendly view lives at `/text`.

## Verify

```bash
npm run check   # tsc strict across the workspace + svelte-check
npm test        # 75 tests, including a 100k-tick soak with invariant checks
```

## Layout

```
packages/shared    tick constants, seeded PRNG, event taxonomy, wire protocol types
packages/content   template DSL parser, grammar, selection, narrate(), core pack
apps/sim           engine, procedural floor generation, SQLite persistence, HTTP + SSE, admin
apps/web           SvelteKit dashboard, canvas renderer, delta application, text view
ops                systemd units, Caddyfile, deployment notes
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DONJON_SEED` | `0xd0f0a` | World seed; the same seed replays identically |
| `DONJON_SPEED` | `1` | Tick multiplier (1 tick = 1 in-world minute) |
| `DONJON_DB` | `donjon.db` | SQLite file |
| `DONJON_PORT` | `8787` | Public API + SSE |
| `DONJON_ADMIN_PORT` | `8788` | Admin, loopback only |
| `DONJON_ADMIN_TOKEN` | dev token | Required `x-donjon-admin-token` header |
| `DONJON_MAX_TICKS` | `0` | Stop after N ticks (0 = forever) |
| `DONJON_FEED_SEVERITY` | `1` | Minimum severity printed to stdout |

See `ops/README.md` for deployment and `docs/PLAN.md` for the full design.
