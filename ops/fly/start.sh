#!/usr/bin/env bash
set -uo pipefail

node --import tsx /app/apps/sim/src/main.ts &
sim=$!

HOST=127.0.0.1 PORT=3000 node /app/apps/web/build/index.js &
web=$!

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
proxy=$!

signalled=0
shutdown() {
	kill -TERM "$sim" "$web" "$proxy" 2>/dev/null || true
}
trap 'signalled=1; shutdown' TERM INT

wait -n
shutdown

wait "$sim" 2>/dev/null || true
wait "$web" "$proxy" 2>/dev/null || true

[[ $signalled -eq 1 ]] && exit 0
exit 1
