# Restore procedure

Backups are written nightly by [backup.sh](backup.sh) to `/var/backups/physez`:

- `physez-db-<timestamp>.dump` — PostgreSQL custom-format dump
- `physez-uploads-<timestamp>.tar.gz` — the private upload directory

DESIGN.md §8 requires at least one **rehearsed restore before submission**.
Do the drill in the "Restore drill" section below rather than waiting for a
real incident.

## 1. Stop the API

The database must not change while it is being replaced.

```bash
sudo systemctl stop physez-api
```

## 2. Restore the database

Pick the dump you want:

```bash
ls -lh /var/backups/physez/physez-db-*.dump
```

`--clean --if-exists` drops the existing objects first, so the restore starts
from a known state instead of merging into whatever is there:

```bash
pg_restore \
  --clean --if-exists \
  --no-owner \
  --dbname "$DATABASE_URL" \
  /var/backups/physez/physez-db-<timestamp>.dump
```

If the database itself is gone, create it first:

```bash
sudo -u postgres createdb -O physez physez
```

## 3. Restore the uploads

File rows in the database point at paths on disk, so the uploads must come
from the *same* backup run as the dump — otherwise the two disagree and
downloads 404.

```bash
sudo tar -xzf /var/backups/physez/physez-uploads-<timestamp>.tar.gz \
  -C /srv/physez/server
sudo chown -R physez:physez /srv/physez/server/uploads
```

## 4. Re-apply migrations and start

The dump already contains the schema at backup time; running migrations
catches the case where the deployed code is newer than the backup.

```bash
cd /srv/physez/server
npm run migrate:up
sudo systemctl start physez-api
curl -fsS http://127.0.0.1:3000/api/health
```

`{"status":"ok","database":"up"}` means the API is live and the database is
reachable.

## 5. Verify

- Log in as a known student; the dashboard lists their bookings.
- Open a booking with an attachment and download the file (proves the dump and
  the uploads archive match).
- Check the admin bookings list for the expected rows.

## Restore drill

Rehearse without touching production data by restoring into a scratch
database:

```bash
sudo -u postgres createdb -O physez physez_restore_test
pg_restore --no-owner \
  --dbname "postgres://physez:<password>@localhost:5432/physez_restore_test" \
  /var/backups/physez/physez-db-<timestamp>.dump

# Spot-check that real rows arrived.
psql "postgres://physez:<password>@localhost:5432/physez_restore_test" \
  -c "SELECT count(*) FROM users;" \
  -c "SELECT count(*) FROM bookings;"

sudo -u postgres dropdb physez_restore_test
```

Record the date of the last successful drill here:

| Drill date | Backup used | Result |
|------------|-------------|--------|
| _(not yet run)_ | | |
