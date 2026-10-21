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
    products/          # Live-scoped CRUD, options, stock and image management
    orders/             # Public submission and seller order management
    public-live/       # Public product storefront and order form
  lib/                 # API transport, query client, formatting helpers
  types/               # Generated API contract types
tests/
  app/                 # Application routing and composition
  components/          # Shared UI behavior
  features/            # Feature workflows, organized by feature
  lib/                 # API and infrastructure behavior
  setup.ts             # Shared Testing Library setup
```

Application code stays organized by feature and responsibility; tests live in a dedicated `tests/` tree that mirrors those boundaries. This keeps production modules focused while making the full test suite easy to discover. Features should own their API functions, query hooks, and pages. Shared components should contain reusable presentation or accessibility behavior, not feature business rules. Avoid adding directory layers that do not clarify a responsibility.

## Routing and authentication

- `/login` is public and authenticates with `POST /api/v1/creator/access`.
- `/live/:slug` is a public customer route and has no seller navigation. Customers add product-specific selections to a cart, adjust quantities within shared per-product stock, and submit contact and delivery details without an account.
- `/lives` lists the creator's Lives and links to the create flow.
- `/lives/new` creates a Live using its name and optional TikTok LIVE URL, then opens `/lives/:liveId`. TikTok URLs are validated by the server against HTTPS and the supported TikTok hostnames.
- `/lives/:liveId` resolves the selected Live from `GET /api/v1/lives`. The backend has no authenticated single-Live read endpoint, so the workspace refreshes the creator-owned list on entry rather than trusting an old cache.
- The workspace can add, update, or clear the TikTok LIVE URL. Active storefront pages expose the configured link to customers; the dashboard offers TikTok and storefront actions only when the related destination is available.
- Draft Lives can be activated and active Lives can be ended using `PATCH /api/v1/lives/:liveId`. Ending requires confirmation. The interface offers no transition from `ENDED`.
- `/lives/:liveId/products` lists products scoped to that Live, including stock and the primary image. `/new` creates a product and `/:productId/edit` updates it; editing resolves the product from the authenticated per-Live product list. Product options are group/choice objects, and existing unrecognized legacy values remain untouched unless explicitly replaced.
- Product creation supports selecting and previewing an image before save. The product is created first and its image is uploaded second. If upload fails, the form keeps the saved product ID and offers image-only retry, so retrying cannot create a duplicate product. Editing reuses the same image picker; preview object URLs are revoked when replaced or unmounted.
- `/lives/:liveId/orders` lists the selected Live's authenticated orders and supports manually confirming payment. `/lives/:liveId/orders/:orderId` shows persisted order and item snapshots; the list response is reused, so there is no extra detail endpoint. Both routes use the creator-owned order list, and the order query is refreshed after payment updates.
- Order CSV downloads use the authenticated Live-scoped export endpoint. The original columns remain in the same order; the customer-facing order reference is appended as the final column. The server escapes CSV cells and the browser names the file with the Live name and export date.
- Seller routes are wrapped by `RequireCreator`, which restores the session through `GET /api/v1/creator/me` before rendering private pages.
- Logout calls `POST /api/v1/creator/logout`, then clears the TanStack Query cache.
- The cookie is HTTP-only. Never read or persist its value in JavaScript.
- A client route guard is a presentation boundary only. The API remains responsible for authorization.

Add private pages beneath the authenticated seller layout. Keep customer routes outside that layout. A `401` redirects the seller to login; transport and server failures show a retry state instead of being treated as logged out.

## API and server state

Use `api` from `src/lib/api-client.ts` for all HTTP requests. Pass paths relative to the configured API base, such as `/v1/lives`; the client prefixes `/api`, includes credentials, unwraps the standard `{ data }` envelope, maps backend `{ error }` responses to `ApiError`, and represents network failures as `TransportError`. Use response types from the generated OpenAPI components at feature API boundaries.

Use TanStack Query for server-owned data. Query keys are defined by feature hooks. Mutations should invalidate or update relevant query data; do not mirror server data into local state. Keep form drafts and transient UI state local to the component or feature.

The backend owns prices, totals, stock, validation, status transitions, and persisted state. API money is integer pesewas; use `formatPesewas` for display and `parseCedisToPesewas` for exact decimal GHS input. The seller options editor stores groups as an object of string arrays, for example `{ "Size": ["S", "M"], "Colour": ["Black", "White"] }`. Existing string-array groups load into the editor; unrecognized legacy JSON is preserved unless the seller explicitly replaces it. Option choices do not have separate prices or stock. Product stock is a non-negative integer and defaults to zero, including for existing products migrated from the earlier schema.

The backend accepts image uploads at `POST /api/v1/lives/:liveId/products/:productId/image` and removal at `DELETE` on the same path. Uploads are server-mediated JPEG, PNG, or WebP files up to 5 MB; only the primary image is exposed to seller and public responses. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the repository-root `.env`; these credentials must never use a `VITE_` prefix. The server stores provider IDs separately from public URLs so another storage adapter can be added without changing product features.

Storage and database writes cannot be atomic together. Replacement stores the new image first, commits it as primary, then attempts to delete the former object. A failed provider deletion leaves a non-primary record for later cleanup. Product deletion removes image records with the product, then attempts provider cleanup; a provider outage at that point can leave an untracked Cloudinary asset.

The public `/live/:slug` route supports product quantities, configured option choices, customer contact and delivery details, and order submission. The browser shows an estimated total, while the server calculates the saved total from current prices. The storefront sends an `Idempotency-Key` UUID and keeps only that opaque key in tab-scoped `sessionStorage` until the server confirms the order. Customer details remain in component memory and must be re-entered after a refresh; submitting the same request then reuses the key and returns its original order. A key reused with different details is rejected with `409 IDEMPOTENCY_KEY_REUSED`; the customer can review and submit again to start a new request. Existing clients may omit the header.

On order creation the server atomically decrements stock with a conditional database update inside the order transaction; `409 INSUFFICIENT_STOCK` is recoverable and the storefront can refresh availability. Unpaid orders consume stock too. The current order lifecycle has no cancellation/restock operation; marking an order paid does not alter stock. Product deletion is rejected when order history references the product (`409 PRODUCT_IN_USE`), and the UI keeps the product visible in that case.

## Styling

`DESIGN.md` defines the visual system. Shared CSS tokens are in `src/index.css`, exposed to Tailwind as semantic utilities. Use existing shared components before repeating common button, form, status, or feedback patterns. Keep the customer layout visually separate from the seller workspace while sharing tokens.

## Testing

Use Vitest and Testing Library for user-visible behavior. Test the API boundary with mocked `fetch` responses that match the backend envelope. Test route behavior with a memory router and isolated QueryClient instances. Cover loading, success, empty, error, and unauthorized states where they apply. Avoid asserting internal component structure when accessible behavior can be tested instead.

Client test files are under `tests/`, grouped by app, shared components, feature, or library. Vitest is scoped to `tests/**/*.test.{ts,tsx}` and loads common matchers and cleanup from `tests/setup.ts`.

The Live feature suite covers list success/empty/error states, workspace lookup, create validation and success/error feedback, activation, confirmed ending, and rejected transitions that preserve server state.

The product suite covers Live-scoped list/loading/empty/error states, create and update payloads, stock and option validation, exact GHS-to-pesewas conversion, option-group editing and legacy preservation, image uploads, successful deletion, and deletion rejected for order history. Public storefront tests cover availability, option and quantity selection, order submission, and stock-conflict recovery. Backend integration tests cover image storage lifecycle, stock rollback, option validation, authoritative totals, and concurrent attempts to purchase the last unit.

Public cart lines are keyed by product and selected option values: repeated identical selections merge, while different products remain separate. Stock remains shared across choices for a product. The public order endpoint returns the server-confirmed line prices and total plus a unique `ORD-` reference. Idempotency keys stay in tab-scoped storage until a confirmed response; customer details are not persisted. After a network failure, the same page retries the frozen request with its original key. If a page refresh loses that in-memory request and a mismatched retry receives an idempotency conflict, the storefront stops new submissions and asks the customer to contact the seller rather than risk a duplicate.

Current product stages:

1. Complete: foundation, creator auth, session restoration, and a real Lives dashboard.
2. Complete: Live list, create, workspace, and supported lifecycle transitions.
3. Complete: product list/create/update/delete UI using the existing product API.
4. Next: seller order listing and manual payment tracking.
5. CSV export.
6. Browser-level critical journey and deployment verification.

The product and order route placeholders are intentional. Do not present placeholder pages as completed functionality or use fake data to fill them.
