# Trailhead Ledger — Scout Expense Tracker

A self-hosted web app for tracking a Boy Scout troop's finances: **scout ledgers**, **troop bank accounts**, and **events with per-scout cost splits**.

Everything runs in a **single Docker container** — the database (PostgreSQL), the API, and the web UI are all inside it. You only ever expose **one port**. SSL is handled by your router/reverse proxy, not the container.

- **Image on Docker Hub:** `alex12342/scout-expense-tracker`
- **Data lives in one folder** (`./data`) — back that up and you've backed up the whole troop.

---

## Features

- **Dashboard** — troop-wide snapshot: total bank balance, who owes money, who's in credit, and unpaid event splits.
- **Scouts** — add/edit scouts (name, BSA number, rank). Each scout has a running balance and a full transaction ledger.
- **Bank Accounts** — track checking/savings accounts with an opening balance and a live computed balance.
- **Events** — create an event with a total cost and a list of participants. The cost is split automatically (or set each scout's share manually). Record payments and refunds as they come in, and see who's paid up.
- **Ledger** — every money movement in one place: deposits, reimbursements, expenses, and adjustments.
- **Settings** — change your password, and (as an admin) add or remove team members with `admin` or `leader` roles.

---

## Quick start

> **Requirements:** Docker (or Unraid, which uses Docker under the hood).

### 1. Pull the image

```bash
docker pull alex12342/scout-expense-tracker
```

### 2. Run the container

```bash
docker run -d \
  --name scout-expense-tracker \
  --restart unless-stopped \
  -p 8080:80 \
  -v ~/scout-ledger-data:/app/data \
  alex12342/scout-expense-tracker
```

This maps the app to **`http://localhost:8080`** and stores all data in `~/scout-ledger-data`.

> The first boot takes a few seconds while it initializes the database and creates your admin account.

### 3. Open it and sign in

1. Go to **`http://localhost:8080`**.
2. Sign in with the default account:
   - **Username:** `admin`
   - **Password:** `ChangeMe123!`
3. **Change the password immediately** (Settings → Change Password).

That's it — the app is ready to use.

---

## Using Docker Compose (recommended for most)

Prefer Compose? You have two choices:

- **Option A** — run the pre-built image from Docker Hub (no build needed).
- **Option B** — build the app from this repository's source.

### Option A — use the Docker Hub image

Create a `docker-compose.yml` that points at the published image (no local build):

```yaml
services:
  scout-expense-tracker:
    image: alex12342/scout-expense-tracker
    container_name: scout-expense-tracker
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./data:/app/data
    environment:
      - PUID=1000
      - PGID=1000
      # Optional: set your own first-run admin password
      # - DEFAULT_ADMIN_USERNAME=admin
      # - DEFAULT_ADMIN_PASSWORD=YourStrongPass1
```

Then start it:

```bash
docker compose up -d
```

### Option B — build from source

```bash
# From the repository root
docker compose up --build -d
```

Both options give you the same result. Data is stored in `./data` (next to the compose file) and survives restarts and redeploys.

---

## First-time setup (what happens on boot)

On the very first start the container will:

1. Start its embedded PostgreSQL.
2. Create the `scout_expense_tracker` database and apply the schema.
3. Create the **admin user** from your environment (defaults: `admin` / `ChangeMe123!`).
4. Start the API and the web UI.

After that, every restart is instant and your data is preserved.

> **Note:** The default admin password is only used **once**, on first boot, when no users exist yet. Changing `DEFAULT_ADMIN_PASSWORD` later has no effect — use Settings → Change Password instead.

---

## A typical workflow

1. **Add your bank account(s)** — Bank Accounts → New Account. Enter the current balance as the *opening balance*.
2. **Add your scouts** — Scouts → Add Scout.
3. **Record an event** — Events → New Event. Enter the total cost and pick the participants. It splits the cost evenly by default, or set each scout's share.
4. **Collect payments** — open the event and record each payment. Scouts move from *Unpaid* → *Partial* → *Paid*.
5. **Keep the ledger tidy** — use Ledger for one-off deposits, reimbursements, or expenses.
6. **Check the Dashboard** anytime for the troop's overall position.

---

## Configuration (environment variables)

All of these are optional and have sensible defaults. Set them in `docker-compose.yml` under `environment:`, or pass them with `-e` on `docker run`.

| Variable | Default | What it does |
|---|---|---|
| `PUID` / `PGID` | `1000` | Host user/group that owns the data volume (use your Unraid user id). |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error`. |
| `CORS_ORIGIN` | `*` | Allowed origins (comma-separated) if you call the API from another host. Leave `*` behind a proxy. |
| `JWT_SECRET` | *(auto-generated)* | Secret for signing login tokens. If unset, one is generated on first boot and stored in the data folder, so sessions survive restarts. Set it to a fixed value if you prefer. |
| `DEFAULT_ADMIN_USERNAME` | `admin` | Username for the **first-run** admin only. |
| `DEFAULT_ADMIN_PASSWORD` | `ChangeMe123!` | Password for the **first-run** admin only (min 8 chars, must include a letter and a number). |

> The database is **embedded** in the container and is not exposed to the outside. You do not need to run a separate PostgreSQL.

---

## Data & backups

Everything important is under the volume you mounted to **`/app/data`** (the `./data` folder in the examples above):

- The PostgreSQL database
- The persisted JWT secret
- Boot logs

**To back up:** stop the container and copy the folder.

```bash
docker compose stop
cp -a ./data ~/backups/scout-ledger-$(date +%F)
docker compose start
```

**To restore:** stop the container, copy the folder back over `./data`, and start it again.

**To start completely fresh:** stop the container and delete the `data` folder before starting again.

---

## Running behind a reverse proxy / with SSL

The container listens on port **80** and is not set up for HTTPS. That's intentional — put your reverse proxy (Nginx, Caddy, Traefik, or your Unraid proxy) in front of it.

Example **Caddyfile** snippet:

```
scout.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Example **Nginx** server block:

```nginx
server {
    listen 443 ssl http2;
    server_name scout.example.com;

    # your ssl_certificate / ssl_certificate_key lines here

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Point the proxy at the host port you mapped (e.g. `8080:80`) and you're done.

---

## Health check

The container exposes a health endpoint and a Docker healthcheck. Verify it with:

```bash
curl -fsS http://localhost:8080/api/health
```

Expected when everything is up:

```json
{ "status": "ok", "db": "up", "version": "...", "gitSha": "..." }
```

Watch the container's health and logs with:

```bash
docker compose ps
docker compose logs -f
```

---

## API (optional)

All data can also be accessed via a JSON API under `/api`, using the JWT you receive from `/api/auth/login`. Endpoints include `/api/dashboard`, `/api/scouts`, `/api/bank-accounts`, `/api/events`, `/api/ledger`, and `/api/auth/*`. See the source under `artifacts/api-server/src/routes/` for full details.

---

## Requirements & tech stack

- **Runtime:** one Docker image (Node.js 24 + embedded PostgreSQL 15 + Nginx, supervised by `supervisord`).
- **Frontend:** React 19 + Vite + Tailwind CSS.
- **Backend:** Express 5 + Drizzle ORM + PostgreSQL.
- **No external services required** — the database runs inside the container.
