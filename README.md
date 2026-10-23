# LiveOrder

LiveOrder is a seller workspace and public ordering application for TikTok LIVE sellers. The repository has three independent pnpm package projects: the root (Prisma tooling and shared TypeScript), `server/`, and `client/`.

## Local setup

Use the repository's pinned pnpm version (`pnpm@12.8.1`) and install each package separately:

```sh
pnpm install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
pnpm --dir client install --frozen-lockfile
cp .env.example .env
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
The migration command creates an empty SQLite file without truncating an existing one. In a production image after the build, use `pnpm --dir server migrate:deploy:production` to run the compiled migration wrapper.

## Build and run

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm start
```

`pnpm build` creates frontend assets and compiles the backend to `server/dist/server/src/server.js`; `pnpm start` runs that compiled server. The backend build generates Prisma Client first, cleans only `server/dist`, and excludes test files. `pnpm --dir server typecheck` runs the backend TypeScript check alone.

For local development, use `pnpm dev`. To run backend tests alone, use `pnpm --dir server test`; the test setup targets `data/test.db`, separate from the development database.

## Creator provisioning

Apply migrations first, then provision a creator against the same database configuration used by the server:

```sh
pnpm creator:create "Creator Name"
```

The command resolves `.env` from the repository root even when invoked through the server package. It stores a restricted-permission copy of the one-time access code in the ignored file `data/creator-codes.json` and prints the code once to the operator's terminal. Treat both the file and terminal output as credentials: run provisioning in a private administrative session, do not capture its output in application or centralized command logs, deliver the code through a separate secure channel, and remove the local copy when it is no longer needed. The database stores only the access-code hash.

After a production build, `pnpm --dir server creator:create:production "Creator Name"` runs the compiled provisioning command.

## Health checks and logs

* `GET /api/health` is liveness: it reports that the HTTP process responds and does not require a database query.
* `GET /api/health/ready` is readiness: it queries SQLite and returns `503` with a generic error if the database is unavailable.

Production HTTP logs include method, status, and duration without request bodies or URL parameters. Unhandled errors produce structured metadata without exception messages, request data, or stack traces; development retains Morgan's concise request log and error stack diagnostics. API responses do not expose internal exception details.

## Production secrets and operational notes

Keep `CLOUDINARY_API_SECRET`, session configuration, and all other credentials server-side. `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_API_KEY` are also configured only on the backend in this MVP. Do not place credentials in `VITE_` variables, source control, container build arguments, or image layers.

This milestone does not add deployment infrastructure, automated backups, or restore automation. Before launch, provision persistent storage for SQLite, establish off-host backups, rehearse restoration, and verify rollback and disk monitoring procedures.
