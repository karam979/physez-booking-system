# Deploying PhysEZ

Step-by-step checklist for a first deployment: API + PostgreSQL + n8n on one
VPS, the two frontends on Netlify. Everything referenced here lives in
[deploy/](deploy/).

Architecture (DESIGN.md §3): the browser only ever talks to its Netlify site.
Netlify proxies `/api/*` to the VPS, so the browser stays same-origin with the
API and the auth cookie needs no cross-site handling.

---

## 0. Before you start

- A VPS with Node.js 24+, PostgreSQL 16 and either Caddy or Nginx.
- A DNS record for the API host, e.g. `api.physez.example.com` → VPS IP.
- Two Netlify sites connected to this repository.
- A Telegram bot token and chat id, and a Google account for Calendar.

Generate the two secrets now and keep them somewhere safe — you will paste
each into more than one place:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # N8N_SHARED_SECRET
```

---

## 1. Database

```bash
sudo -u postgres createuser physez --pwprompt
sudo -u postgres createdb -O physez physez
```

Keep PostgreSQL on localhost only — port 5432 must not be reachable from the
internet (DESIGN.md §7). Confirm:

```bash
sudo ss -lntp | grep 5432        # expect 127.0.0.1:5432, not 0.0.0.0:5432
```

If it listens on all interfaces, set `listen_addresses = 'localhost'` in
`postgresql.conf` and restart.

---

## 2. API

```bash
sudo mkdir -p /srv/physez && sudo chown physez:physez /srv/physez
sudo -u physez git clone <repo-url> /srv/physez
cd /srv/physez/server
npm ci --omit=dev
cp .env.example .env
```

### API environment variables (`/srv/physez/server/.env`)

Every variable from DESIGN.md §8 that belongs to the backend:

| Variable | Value to use | Notes |
|----------|--------------|-------|
| `DATABASE_URL` | `postgres://physez:<password>@localhost:5432/physez` | Local socket only. |
| `JWT_SECRET` | first `openssl rand -hex 32` | Rotating it logs everyone out. |
| `APP_TIMEZONE` | e.g. `Asia/Jerusalem` | Drives availability day boundaries and the reminder's "tomorrow". |
| `FRONTEND_ORIGINS` | the two Netlify URLs, comma-separated | Only needed if you ever serve the apps cross-origin instead of via the proxy; see the security notes below. |
| `UPLOAD_DIR` | `/srv/physez/server/uploads` | Must sit outside any static/served directory. |
| `MAX_UPLOAD_MB` | `10` | Keep the proxy's body limit slightly above this. |
| `N8N_WEBHOOK_BASE_URL` | e.g. `https://auto-flows-979.duckdns.org` | No trailing slash. |
| `N8N_SHARED_SECRET` | second `openssl rand -hex 32` | Must equal `PHYSEZ_SHARED_SECRET` in n8n. |
| `PORT` | `3000` | The reverse proxy forwards here. |
| `NODE_ENV` | `production` | **Required**: the auth cookie is only marked `Secure` in production. Set in the systemd unit. |

`TEST_DATABASE_URL` is for local development only — leave it out in
production.

Then create the upload directory and install the service:

```bash
mkdir -p /srv/physez/server/uploads
npm run migrate:up

sudo cp /srv/physez/deploy/physez-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now physez-api
curl -fsS http://127.0.0.1:3000/api/health
```

Expect `{"status":"ok","database":"up"}`.

---

## 2b. API as a Docker service (alternative to step 2)

If the VPS already runs a Docker stack (PostgreSQL, n8n, Caddy on a shared
network), run the API there instead of under systemd. Skip step 2 entirely.

```bash
cd /srv/physez
cp server/.env.example server/.env      # then fill it in, see the table above
```

Three values differ from the systemd setup, because the container talks to
its neighbours by **service name**, not `localhost`:

| Variable | Docker value |
|----------|--------------|
| `DATABASE_URL` | `postgres://physez:<password>@<postgres-service>:5432/physez` |
| `N8N_WEBHOOK_BASE_URL` | `http://<n8n-service>:5678` |
| `UPLOAD_DIR` | leave it — compose forces `/app/uploads`, backed by a volume |

Set the shared network name in `docker-compose.prod.yml` (replace
`REPLACE-WITH-EXISTING-NETWORK`; find it with `docker network ls`), then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f physez_api
```

The container runs migrations at start and then launches the API. For more
than one replica, set `RUN_MIGRATIONS=false` and run migrations once by hand
so the replicas do not race:

```bash
docker compose -f docker-compose.prod.yml run --rm physez_api npm run migrate:up
```

Point Caddy at the container instead of `127.0.0.1:3000`:

```
handle /api/* {
	reverse_proxy physez_api:3000
}
```

Uploads live in the `physez_uploads` volume, so back them up from there:

```bash
docker run --rm -v physez_uploads:/data -v /var/backups/physez:/backup alpine \
  tar -czf /backup/physez-uploads-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

## 3. Reverse proxy + HTTPS

Pick one. Both configs expose only `/api/*` and never serve `UPLOAD_DIR`.

**Caddy** (certificates are automatic):

```bash
sudo cp /srv/physez/deploy/Caddyfile /etc/caddy/Caddyfile   # edit the hostname first
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

**Nginx** (certificates via certbot):

```bash
sudo cp /srv/physez/deploy/nginx-physez-api.conf /etc/nginx/sites-available/physez-api
sudo ln -s /etc/nginx/sites-available/physez-api /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.physez.example.com
sudo nginx -t && sudo systemctl reload nginx
```

Verify from your laptop:

```bash
curl -fsS https://api.physez.example.com/api/health
```

---

## 4. Netlify (both apps)

Do this twice — once per site.

| Setting | Student site | Admin site |
|---------|--------------|------------|
| Base directory | `apps/student-web` | `apps/admin-web` |
| Build command | `npm run build` | `npm run build` |
| Publish directory | `apps/student-web/dist` | `apps/admin-web/dist` |

Before the first deploy, edit the `netlify.toml` in each app directory and
replace `REPLACE-WITH-API-HOST` with the real API host, then commit.

### Netlify environment variables

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_BASE` | `/api` | Listed in DESIGN.md §8. The apps call `/api/...` relative paths, so the proxy handles it and this stays the default; set it explicitly if you ever bypass the proxy. |

---

## 5. n8n

Import the four workflows from [n8n/](n8n/README.md) and set these on the n8n
side (DESIGN.md §8):

| Variable | Value |
|----------|-------|
| `PHYSEZ_SHARED_SECRET` | same value as the API's `N8N_SHARED_SECRET` |
| `PHYSEZ_API_BASE` | `http://127.0.0.1:3000` if n8n runs on the same VPS |
| `GOOGLE_CALENDAR_ID` | the target calendar id |
| `TELEGRAM_CHAT_ID` | the admin chat id |
| `APP_TIMEZONE` | same as the API |

Credentials (n8n credential store, never env vars): the Telegram bot token and
the Google OAuth credentials.

Restrict the n8n editor with basic auth or an IP allow-list. The webhook
endpoints stay reachable — each workflow verifies the shared secret itself.

> Live wiring is currently blocked; see the status note at the end of
> [n8n/README.md](n8n/README.md).

---

## 6. Backups

```bash
sudo cp /srv/physez/deploy/physez-backup.cron /etc/cron.d/physez-backup
sudo chmod 644 /etc/cron.d/physez-backup
sudo -u physez /srv/physez/deploy/backup.sh    # run once by hand
```

Then do a restore drill and record the date in
[deploy/RESTORE.md](deploy/RESTORE.md). DESIGN.md §8 requires at least one
rehearsed restore before submission.

---

## 7. Seed the first admin

There is no admin sign-up endpoint by design — `POST /api/auth/register`
always creates a student. Create the teacher account directly:

```bash
cd /srv/physez/server
node -e "import('bcryptjs').then(async b => console.log(await b.default.hash(process.argv[1], 12)))" 'a-strong-password'
```

```sql
INSERT INTO users (name, email, password_hash, role)
VALUES ('Karam', 'you@example.com', '<paste the hash>', 'admin');
```

---

## 8. Smoke test (DESIGN.md §8)

- [ ] `https://api.<host>/api/health` returns `{"status":"ok","database":"up"}`
- [ ] Both Netlify sites load
- [ ] `GET /api/topics` through each site's `/api` proxy returns JSON
- [ ] Register a student, log in, log out
- [ ] Admin creates an availability slot; it appears in the student booking wizard
- [ ] Student books a lesson → admin sees it pending → confirms it
- [ ] Confirmed time disappears from public availability
- [ ] Upload a PDF, download it back; a second student gets 403
- [ ] Switch to Arabic and Hebrew: layout flips to RTL
- [ ] Telegram alert arrives on booking (once n8n wiring is live)

---

## Redeploying

```bash
/srv/physez/deploy/deploy.sh
```

Pulls `main`, installs, migrates, restarts, and fails loudly if the health
check does not pass. The frontends redeploy themselves from Git.

---

## Deployment-time security checklist

From DESIGN.md §7, the items that are configuration rather than code:

- [ ] `NODE_ENV=production` is set (otherwise the auth cookie is not `Secure`)
- [ ] PostgreSQL listens on localhost only
- [ ] `UPLOAD_DIR` is outside any served directory and owned by the app user
- [ ] The n8n editor is not publicly accessible
- [ ] `JWT_SECRET` and `N8N_SHARED_SECRET` are unique, random, and never committed
- [ ] `server/.env` is `chmod 600` and owned by the app user
- [ ] HTTPS works and HTTP redirects to it
- [ ] A restore drill has been completed and recorded
