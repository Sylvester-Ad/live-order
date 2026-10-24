# LiveOrder

LiveOrder is a seller workspace and public ordering application for TikTok LIVE sellers. The repository has three independent pnpm package projects: the root (Prisma tooling and shared TypeScript), `server/`, and `client/`.

## Local setup

Use the repository's pinned pnpm version (`pnpm@12.8.1`) and install each package separately:

```sh
pnpm install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
pnpm --dir client install --frozen-lockfile
cp -n .env.example .env
```

Keep `.env` on the server side and out of version control. The frontend only uses `client/.env` variables prefixed with `VITE_`; those values are public.

## SQLite configuration

`LIVEORDER_DATABASE_PATH` is the one database setting used by the Express runtime, Prisma CLI, and creator provisioning command.

* Relative paths resolve from the repository root, independent of the command's current directory.
* Local development defaults to `./data/dev.db`, preserving the repository's existing intended development location.
* Production must set `NODE_ENV=production` and an absolute path on persistent storage, for example `/var/lib/liveorder/liveorder.db`. The containing persistent directory must already exist and be writable by the application user.
* Do not set `DATABASE_URL`; this project derives Prisma's SQLite file URL from `LIVEORDER_DATABASE_PATH`.

After setting the path in `.env` or the process environment, initialize or update the configured database with:

```sh
pnpm db:generate
pnpm db:migrate:deploy
```

Migration deployment applies all checked-in migrations. A fresh production database should be initialized this way before starting the application. Do not use `prisma db push` in production.
The migration command creates an empty SQLite file without truncating an existing one. In a production image after the build, run `node dist/server/src/scripts/migrate-deploy.js` from `/app/server` to apply migrations.

## Build and run

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm start
```

`pnpm build` creates frontend assets and compiles the backend to `server/dist/server/src/server.js`; `pnpm start` runs that compiled server. The backend build generates Prisma Client first, cleans only `server/dist`, and excludes test files. `pnpm --dir server typecheck` runs the backend TypeScript check alone.

For local development, use `pnpm dev`. To run backend tests alone, use `pnpm --dir server test`; the test setup targets `data/test.db` by default. Set `LIVEORDER_TEST_DATABASE_PATH` to use a separate disposable test database.

## Creator provisioning

Apply migrations first, then provision a creator against the same database configuration used by the server:

```sh
pnpm creator:create "Creator Name"
```

The command resolves `.env` from the repository root even when invoked through the server package. It stores a restricted-permission copy of the one-time access code in the ignored file `data/creator-codes.json` and prints the code once to the operator's terminal. Treat both the file and terminal output as credentials: run provisioning in a private administrative session, do not capture its output in application or centralized command logs, deliver the code through a separate secure channel, and remove the local copy when it is no longer needed. The database stores only the access-code hash.

After a production build, `node dist/server/src/scripts/create-creator.js "Creator Name"` from `/app/server` runs the compiled provisioning command.

## Health checks and logs

* `GET /api/health` is liveness: it reports that the HTTP process responds and does not require a database query.
* `GET /api/health/ready` is readiness: it queries SQLite and returns `503` with a generic error if the database is unavailable.

Production HTTP logs include method, status, and duration without request bodies or URL parameters. Unhandled errors produce structured metadata without exception messages, request data, or stack traces; development retains Morgan's concise request log and error stack diagnostics. API responses do not expose internal exception details.

## Production secrets and operational notes

Keep `CLOUDINARY_API_SECRET`, session configuration, and all other credentials server-side. `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_API_KEY` are also configured only on the backend in this MVP. Do not place credentials in `VITE_` variables, source control, container build arguments, or image layers.

Deployment infrastructure and scheduled backup automation are not configured here. The one-off SQLite backup and restore commands are documented below; operators still need to schedule them and configure S3 lifecycle retention before launch.

## Containerized production-like run

The Docker build uses the official `node:24.22.1-alpine3.24` image for all Node stages and `caddy:2.11.7-alpine` for the web image. Node 24 is the active LTS release line. Caddy 2.11.7 is an explicitly pinned Caddy 2 Alpine release, retaining Caddy's automatic HTTPS support. Build and production dependency stages install pnpm 12.8.1 and use the independent root, server, and client lockfiles with frozen installs. The `better-sqlite3` binding is installed or compiled inside Alpine with the matching Node ABI; Python, make, and the C++ compiler stay in build stages. The backend runtime retains `libstdc++` for the native binding but does not include pnpm; its compiled migration wrapper invokes the locally installed Prisma CLI directly with Node.

There are exactly two Compose services: `caddy` serves the built Vite application and proxies `/api` requests to `backend:3000` without stripping the prefix; it also proxies the existing `/api-docs` routes. `backend` runs the compiled Express server. Caddy applies an SPA fallback for React Router routes. Both image health checks use `GET /api/health/ready`, and Caddy waits for the backend health check before starting. The backend has no published host port. The Vite production build uses the same-origin `/api` path and does not receive server credentials. Compose passes only the Cloudinary and optional CORS application settings from `.env` to the backend; host-port and Caddy settings are not injected into it.

To build and start a local HTTP instance:

```sh
cp .env.example .env
# Fill in the server-side Cloudinary values if product image operations are needed.
docker compose build
docker compose run --rm backend node dist/server/src/scripts/migrate-deploy.js
docker compose run --rm backend node dist/server/src/scripts/create-creator.js "Creator Name"
docker compose up -d
```

Provision the creator from a private terminal. The command prints a one-time access code; do not capture it in logs or paste it into this document. Its recovery file is inside the one-off container and is removed by `--rm`, so securely retain the code from that private terminal. Do not automatically provision creators at startup. After startup, test `http://localhost:8080/`, a direct React Router URL, `http://localhost:8080/api/health`, and `http://localhost:8080/api/health/ready`. Compose sets production mode and the absolute database path in the container, overriding the local development values in `.env.example`.

SQLite resides at `/var/lib/liveorder/liveorder.db` inside the backend and is stored in the Compose-managed `liveorder-data` volume. Compose creates this volume during the first migration run. `docker compose down` preserves it; do not use `docker compose down --volumes` in production. Replacing or rebuilding the backend container retains this volume. Caddy's `/data` and `/config` are also persistent so certificate state can survive restarts.

For local HTTP, the defaults are `SITE_ADDRESS=:80`, host port 8080, and host port 8443. Public HTTPS requires a valid hostname in `SITE_ADDRESS`, DNS pointing to the server, and inbound network access to ports 80 and 443. Set `HTTP_PORT=80` and `HTTPS_PORT=443` for that deployment. Caddy can then manage certificates automatically; the local HTTP setup alone does not provide public HTTPS.

On each application update, build the new images, run `docker compose run --rm backend node dist/server/src/scripts/migrate-deploy.js` against the persistent volume, then recreate the services with `docker compose up -d`. These commands run in `/app/server`, matching the image's working directory. Migrations are never run automatically by the server entrypoint. This milestone does not automate off-host database backups; arrange and rehearse backups before production launch.

## SQLite backup and restore

The backend backup command uses `better-sqlite3`'s SQLite online backup API. It reads a consistent snapshot while the application is running, then verifies `PRAGMA integrity_check`, required LiveOrder schema columns, and foreign-key consistency before reporting success. It refuses to overwrite an existing backup and uses owner-only file permissions. The default source is the same `LIVEORDER_DATABASE_PATH` used by Express and Prisma; `--source` can override it for an explicit alternate database. Backup files must be placed directly under the dedicated `backups/` directory beside the configured database, with a `liveorder-<UTC timestamp>.sqlite` filename.

Set these non-secret runtime settings for S3 uploads:

* `AWS_REGION` (or `AWS_DEFAULT_REGION`).
* `LIVEORDER_BACKUP_BUCKET`.
* `LIVEORDER_BACKUP_PREFIX` (optional; defaults to `liveorder/backups/sqlite`).

The AWS SDK uses its normal credential provider chain. On EC2, use an instance role; do not put access keys in `.env`, Compose, or the image. Grant the application role only `s3:PutObject` on `arn:aws:s3:::<bucket>/<prefix>/*`. The bucket should block public access and use S3 server-side encryption. The uploader requests AWS-managed SSE-S3 (`AES256`) and does not set an ACL.

Create a local backup while Compose is running, optionally uploading the verified file in the same operation:

```sh
BACKUP_FILE="/var/lib/liveorder/backups/liveorder-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
docker compose run --rm --no-deps backend node dist/server/src/scripts/backup-sqlite.js --destination "$BACKUP_FILE" --upload
```

The backup remains in the `liveorder-data` Docker volume after upload. Successfully uploaded backups are marked locally; backups older than 14 days are pruned only after a later upload succeeds. Failed or otherwise unuploaded backups remain available for retry. To prevent unbounded disk growth during a prolonged outage, creation stops when seven unuploaded artifacts are already present; retry or resolve those artifacts before creating more. A local-only backup also counts as unuploaded until it is uploaded. Retention cleanup failures are logged as warnings after the S3 upload has been confirmed and do not change the reported upload result.

To upload a previously created local backup separately:

```sh
docker compose run --rm --no-deps backend node dist/server/src/scripts/upload-sqlite-backup.js --backup /var/lib/liveorder/backups/<backup-file>.sqlite
```

Backup object keys are timestamped in UTC and include a random identifier. For retention, configure an S3 lifecycle expiration rule scoped to the configured prefix (the default object prefix is `liveorder/backups/sqlite/`), with a 90-day expiration. This keeps deletion outside the application and avoids granting the application role listing or delete permissions. If bucket versioning is enabled, also expire noncurrent versions. Do not use a bucket-wide rule that can match unrelated objects.

Restore a local backup to a **separate** file in persistent storage. This command validates the source and staged copy, refuses an existing destination by default, and rejects the configured active database path even if `--replace-existing` is supplied:

```sh
docker compose run --rm --no-deps backend node dist/server/src/scripts/restore-sqlite-backup.js \
  --source /var/lib/liveorder/backups/<backup-file>.sqlite \
  --destination /var/lib/liveorder/restore/restored.db
```

To restore a downloaded S3 object, download it to a trusted host path with the AWS CLI and mount that file read-only into the one-off container:

```sh
aws s3 cp "s3://<bucket>/<key>" ./liveorder-restore.sqlite
docker compose run --rm --no-deps \
  -v "$PWD/liveorder-restore.sqlite:/restore/backup.sqlite:ro" \
  backend node dist/server/src/scripts/restore-sqlite-backup.js \
  --source /restore/backup.sqlite \
  --destination /var/lib/liveorder/restore/restored.db
```

The restore operation never modifies the backup file. `--replace-existing` is available only for a non-active destination and should be used only when replacement is intentional; existing SQLite WAL/SHM sidecars cause replacement to be refused.

### Production recovery

Restoring production requires a maintenance window. Stop Caddy and the backend first so no requests or database writes continue. Restore and validate to a separate file on the persistent volume. Confirm there are no `-wal` or `-shm` sidecars for the active database, preserve the current database under a dated recovery name, then move the validated restore into the active path. For example, after choosing the restored path and a unique recovery suffix:

```sh
docker compose stop caddy backend
docker compose run --rm --no-deps backend sh -ec '
  db=/var/lib/liveorder/liveorder.db
  restored=/var/lib/liveorder/restore/restored.db
  previous="$db.pre-restore-20261024T150000Z"
  test -f "$restored"
  test ! -e "$db-wal" && test ! -e "$db-shm"
  mv "$db" "$previous"
  if mv "$restored" "$db"; then
    echo "Validated restore promoted; previous database retained at $previous"
  else
    mv "$previous" "$db"
    exit 1
  fi
'
docker compose up -d
```

Then check readiness and representative seller/customer workflows. Keep the pre-restore database and the S3 backup until the recovered data has been reviewed. Use the application release compatible with the backup schema; restore itself does not run migrations.

The named Docker volume and S3 objects are independent failure domains. A local backup in the volume is not an off-host backup. Schedule uploads, alert on failures, and rehearse recovery before production launch; this milestone does not provision the bucket, lifecycle policy, or scheduler.
