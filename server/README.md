# Backend operations

See the repository [README](../README.md) for installation, canonical SQLite configuration, fresh-database migrations, creator provisioning, health endpoints, and production environment guidance.

Useful backend-only commands (run from the repository root):

```sh
pnpm --dir server build
pnpm --dir server typecheck
pnpm --dir server test
pnpm db:generate
pnpm db:migrate:deploy
```

`LIVEORDER_DATABASE_PATH` is shared by the server runtime, Prisma CLI, test preparation, and creator provisioning. Relative values resolve from the repository root; production requires an absolute path to a persistent SQLite file.
