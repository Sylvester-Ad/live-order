# LiveOrder frontend

The frontend is a React and TypeScript application built with Vite. It uses Tailwind CSS 4, React Router, TanStack Query, native `fetch`, Vitest, and React Testing Library. Keep feature behavior close to its feature module and keep transport, routing, and theme behavior shared and explicit.

## Local development

From the repository root, `pnpm dev` starts the Express API on port 3000 and Vite on port 5173. Vite proxies `/api` and the API documentation routes to Express. Browser API calls use the same-origin `/api` path by default, which lets the HTTP-only session cookie work without cross-origin cookie configuration.

`API_PROXY_TARGET` in `client/.env` selects the upstream origin used by Vite for `/api`, `/api-docs`, and `/api-docs.json`. It defaults to `http://localhost:3000`; change it when the backend runs elsewhere and restart Vite. This setting is consumed by Vite and is not exposed to browser code.

`VITE_API_BASE_URL` controls the browser request base and defaults to same-origin `/api`. `VITE_*` values are public and must not contain secrets. Express uses `CORS_ORIGINS`, a comma-separated list of exact allowed origins, for direct cross-origin requests; configure it in the server environment (or the repository-root `.env` used by the server). Local Vite and preview origins are allowed by default. Credentialed CORS reflects only allowlisted origins. The session cookie is `SameSite=Lax`, so a cross-origin deployment must remain same-site; for a different site, use a same-site reverse proxy or separately review the cookie policy. The recommended production arrangement is a same-origin or same-site API proxy.

Useful commands:

```sh
pnpm --dir client dev
pnpm --dir client build
pnpm --dir client lint
pnpm --dir client test
pnpm --dir client generate:api
```

API type generation reads `/api-docs.json` from the configured `API_PROXY_TARGET`; run the backend first, then review generated changes. Set `API_PROXY_TARGET` in `client/.env` (or the command environment) to use a different backend. Do not hand-edit `src/types/openapi.generated.ts`.

## Project structure

```text
src/
  app/                 # Bootstrap providers, route tree, global 404
  components/          # Reusable layout, UI, and feedback primitives
  features/
    auth/              # Creator login, session hooks, route protection
    dashboard/         # Seller dashboard and Lives listing
    lives/             # Live workspace and Live API access
    public-live/       # Public customer storefront
  lib/                 # API transport, query client, formatting helpers
  types/               # Generated API contract types
```

Features should own their API functions, query hooks, pages, and tests as they grow. Shared components should contain reusable presentation or accessibility behavior, not feature business rules. Avoid adding directory layers that do not clarify a responsibility.

## Routing and authentication

- `/login` is public and authenticates with `POST /api/v1/creator/access`.
- `/live/:slug` is a public customer route and has no seller navigation.
- `/lives` lists the creator's Lives and links to the create flow.
- `/lives/new` creates a Live using its name, then opens `/lives/:liveId`.
- `/lives/:liveId` resolves the selected Live from `GET /api/v1/lives`. The backend has no authenticated single-Live read endpoint, so the workspace refreshes the creator-owned list on entry rather than trusting an old cache.
- Draft Lives can be activated and active Lives can be ended using `PATCH /api/v1/lives/:liveId`. Ending requires confirmation. The interface offers no transition from `ENDED`.
- Seller routes are wrapped by `RequireCreator`, which restores the session through `GET /api/v1/creator/me` before rendering private pages.
- Logout calls `POST /api/v1/creator/logout`, then clears the TanStack Query cache.
- The cookie is HTTP-only. Never read or persist its value in JavaScript.
- A client route guard is a presentation boundary only. The API remains responsible for authorization.

Add private pages beneath the authenticated seller layout. Keep customer routes outside that layout. A `401` redirects the seller to login; transport and server failures show a retry state instead of being treated as logged out.

## API and server state

Use `api` from `src/lib/api-client.ts` for all HTTP requests. Pass paths relative to the configured API base, such as `/v1/lives`; the client prefixes `/api`, includes credentials, unwraps the standard `{ data }` envelope, maps backend `{ error }` responses to `ApiError`, and represents network failures as `TransportError`. Use response types from the generated OpenAPI components at feature API boundaries.

Use TanStack Query for server-owned data. Query keys are defined by feature hooks. Mutations should invalidate or update relevant query data; do not mirror server data into local state. Keep form drafts and transient UI state local to the component or feature.

The backend owns prices, totals, validation, status transitions, and persisted state. API money is integer pesewas; use `formatPesewas` for display and preserve integer values in data flows. Product `options` are currently arbitrary JSON, so do not invent a schema or silently discard values.

## Styling

`DESIGN.md` defines the visual system. Shared CSS tokens are in `src/index.css`, exposed to Tailwind as semantic utilities. Use existing shared components before repeating common button, form, status, or feedback patterns. Keep the customer layout visually separate from the seller workspace while sharing tokens.

## Testing

Use Vitest and Testing Library for user-visible behavior. Test the API boundary with mocked `fetch` responses that match the backend envelope. Test route behavior with a memory router and isolated QueryClient instances. Cover loading, success, empty, error, and unauthorized states where they apply. Avoid asserting internal component structure when accessible behavior can be tested instead.

The Live feature suite covers list success/empty/error states, workspace lookup, create validation and success/error feedback, activation, confirmed ending, and rejected transitions that preserve server state.

Current product stages:

1. Complete: foundation, creator auth, session restoration, and a real Lives dashboard.
2. Complete: Live list, create, workspace, and supported lifecycle transitions.
3. Next: product list/create/update/delete UI using the existing product API.
4. Order listing and manual payment tracking.
5. CSV export.
6. Public ordering form and confirmation using the active Live and order endpoints.
7. Browser-level critical journey and deployment verification.

The product and order route placeholders are intentional. Do not present placeholder pages as completed functionality or use fake data to fill them.
