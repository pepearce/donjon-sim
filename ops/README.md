# Deploying Donjon Sim

Two long-running processes: the simulation (`donjon-sim`) and the dashboard (`donjon-web`).
Caddy terminates TLS and proxies both. The SSE route needs `flush_interval -1` — without it the
proxy buffers the event stream and the dashboard sits on a stale snapshot.

## Install

```bash
sudo useradd --system --home /opt/donjon-sim donjon
sudo mkdir -p /opt/donjon-sim /var/lib/donjon /etc/donjon
sudo rsync -a --exclude node_modules ./ /opt/donjon-sim/
cd /opt/donjon-sim && sudo -u donjon npm ci
sudo -u donjon npm -w @donjon/web run build

sudo install -m0644 ops/donjon-sim.service ops/donjon-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now donjon-sim donjon-web
```

## Admin token

The admin server binds to `127.0.0.1:8788` only, requires the `x-donjon-admin-token` header, and
refuses any request carrying `x-forwarded-for`. Never proxy it.

```bash
echo "DONJON_ADMIN_TOKEN=$(openssl rand -hex 24)" | sudo tee /etc/donjon/sim.env
sudo chmod 600 /etc/donjon/sim.env
sudo systemctl restart donjon-sim
```

## Operating

```bash
TOKEN=$(sudo grep -oP 'DONJON_ADMIN_TOKEN=\K.*' /etc/donjon/sim.env)
H="x-donjon-admin-token: $TOKEN"

curl -s -H "$H" 127.0.0.1:8788/admin/diag | jq
curl -s -H "$H" -X POST 127.0.0.1:8788/admin/pause
curl -s -H "$H" -X POST '127.0.0.1:8788/admin/step?n=100'
curl -s -H "$H" -X POST '127.0.0.1:8788/admin/speed?x=10'
curl -s -H "$H" -X POST 127.0.0.1:8788/admin/checkpoint | jq
curl -s -H "$H" -X POST 127.0.0.1:8788/admin/resume
```

## Health and soak

```bash
curl -s localhost:8787/healthz
curl -s localhost:8787/metrics | jq '{tick, dbBytes, hub, flush}'
watch -n300 'curl -s localhost:8787/metrics | jq "{tick, dbBytes, heap: .mem.heapUsed}"'
```

After 24 hours the DB should be flat within a few MB — retention prunes severity 0 events after
6 in-world hours, severity 1 after 48, severity 2 after 30 days, and keeps severity 3 forever up to
a 400k hard cap.

## Backup

SQLite in WAL mode; back up online without stopping the sim:

```bash
sqlite3 /var/lib/donjon/donjon.sqlite ".backup '/var/backups/donjon-$(date +%F).sqlite'"
```

## Reset the world

```bash
sudo systemctl stop donjon-sim
sudo -u donjon rm -f /var/lib/donjon/donjon.sqlite*
sudo systemctl start donjon-sim
```
