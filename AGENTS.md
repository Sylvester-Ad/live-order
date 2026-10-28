# LiveOrder — Agent Instructions

## 1. Project Overview

LiveOrder is a web application that helps creators selling products during TikTok Live manage their products, live selling sessions, customer orders, payment status, and order records.

The primary users are creators who need a straightforward, reliable interface that allows them to manage their selling activities without unnecessary complexity.

The application should prioritize usability, correctness, maintainability, and a good experience on mobile devices.

### Product principles

* Make common seller workflows easy to understand and complete.
* Prefer straightforward implementations over unnecessary abstractions.
* Keep business logic and responsibilities clearly separated.
* Treat the backend as the authority for business rules, prices, totals, inventory, and persisted data.
* Never use mock data to disguise an unfinished API integration.
* Clearly communicate loading, success, empty, and error states.
* Build incrementally and verify each feature before expanding the application.

## 2. Repository Boundaries

The repository contains the frontend, backend, and database configuration.

### Frontend

The frontend lives in `client/`.

The existing frontend uses React, TypeScript, and Vite. Inspect the repository before assuming any additional libraries or conventions.

Frontend implementation tasks should normally modify files within `client/`.

### Backend

The backend lives in `server/`.

The backend uses Express 5, TypeScript, Prisma, and SQLite.

The backend is the authoritative source for API contracts and business rules.

Do not modify backend routes, middleware, services, database schemas, migrations, OpenAPI definitions, or backend tests as part of a frontend task unless the task explicitly authorizes those changes.

If a frontend feature requires an API capability that does not exist, document the gap and request approval before changing the backend.

### Database

The Prisma schema and related configuration must not be modified during frontend-only tasks.

Do not access production data or run destructive database commands.

### General repository safety

* Read relevant source files before proposing or implementing changes.
* Inspect applicable `AGENTS.md` files before working.
* Preserve existing project conventions when they are sound.
* Do not overwrite unrelated user changes.
* Do not revert changes that you did not introduce.
* Do not commit, push, or rewrite Git history unless explicitly instructed.
* Never commit secrets, credentials, or environment files containing secrets.
* Avoid unrelated refactoring.

## 3. Required Workflow

Work in small, reviewable stages.

For each task:

1. Inspect the relevant implementation and existing conventions.
2. Identify the requirements, dependencies, and affected files.
3. Confirm the API contract before implementing integrations.
4. Implement only the approved scope.
5. Add or update appropriate tests.
6. Run the relevant verification commands.
7. Review the final diff for regressions and unrelated changes.
8. Report the files changed, decisions made, checks performed, results, and remaining limitations.

Do not implement the entire frontend in one pass.

Do not proceed to the next major implementation stage until the current stage has been reviewed and approved.

During reconnaissance-only tasks, make no changes to the repository.

## 4. TypeScript Standards

Use TypeScript throughout the frontend.

Maintain strict type safety.

* Avoid `any`; prefer explicit types, `unknown`, generics, or appropriate type guards.
* Do not suppress type errors merely to make a build pass.
* Do not introduce unnecessary type assertions.
* Handle nullable and optional fields explicitly.
* Model API responses according to the actual backend contract.
* Represent constrained values, such as order and payment statuses, using the actual contract types.
* Keep types reusable where doing so improves consistency.
* Do not duplicate API types unnecessarily across feature modules.

Inspect the existing TypeScript configuration before changing it.

Do not weaken strict compiler settings or disable checks to work around implementation errors.

Where practical, evaluate generating frontend API types from the existing OpenAPI document.

Generated types must reflect the real backend contract. Do not invent schemas or silently maintain conflicting handwritten and generated definitions.

Generated code and type-generation tooling should be introduced only when their maintenance cost and benefits justify them.

## 5. Frontend Architecture

Prefer a feature-based architecture with clear responsibilities.

The following is a starting proposal, not a rigid requirement:

```
client/src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
├── components/
│   ├── ui/
│   ├── layout/
│   └── feedback/
├── features/
│   ├── auth/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── pages/
│   ├── lives/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── pages/
│   ├── products/
│   │   ├── api/
│   │   ├── components/
│   │   └── hooks/
│   └── orders/
│       ├── api/
│       ├── components/
│       └── hooks/
├── lib/
│   ├── api-client.ts
│   └── query-client.ts
├── types/
├── main.tsx
└── index.css
```

Inspect the actual codebase before adopting this structure. Preserve existing files and conventions when appropriate.

Architecture principles:

* Authentication logic belongs with the authentication feature.
* Live-session functionality belongs with the Lives feature.
* Product functionality belongs with the Products feature.
* Order functionality belongs with the Orders feature.
* Reusable UI primitives belong in shared components.
* Shared infrastructure belongs in appropriate application or library modules.
* Components should not contain unrelated business logic or duplicate API configuration.
* Avoid oversized components with too many responsibilities.
* Avoid creating layers, directories, hooks, or abstractions that do not solve a real problem.

The goal is clear responsibility and easy maintenance, not maximum file count.

## 6. Dependency Policy

Inspect the installed dependencies before recommending or adding libraries.

Evaluate the following choices against the existing setup:

* React and TypeScript for the UI.
* Tailwind CSS 4 for styling, if compatible with the existing configuration.
* React Router for navigation.
* TanStack Query for server state.
* Axios or an existing suitable HTTP client for API requests.
* React Hook Form and Zod for forms and validation, where appropriate.
* Vitest and React Testing Library for frontend tests.
* Playwright for browser-level tests when appropriate.
* OpenAPI-based frontend type generation where practical.

These are proposed choices, not permission to install every library listed.

Before adding a dependency:

1. Check whether the capability already exists.
2. Determine whether an existing dependency can satisfy the requirement.
3. Explain the benefit and maintenance cost of the new dependency.
4. Check compatibility with the existing stack.
5. Avoid introducing overlapping libraries.

Do not install, remove, or upgrade dependencies without authorization for the relevant task.

## 7. State Management

Distinguish between different types of state.

### Server state

Data fetched from the backend, such as Lives, products, and orders.

Prefer TanStack Query if it is approved and appropriate for the existing application.

### Form state

Values, validation errors, and submission state associated with forms.

Use React state or an approved form library according to the complexity of the form.

### UI state

Local interface state, such as whether a modal is open or a menu is expanded.

Prefer local React state unless sharing that state is genuinely necessary.

Do not introduce a global state-management library without a concrete requirement.

Do not copy server data into a separate global store without a clear reason.

## 8. Centralized API Client

Establish one shared API client rather than configuring HTTP requests independently throughout the application.

The client should centralize the relevant concerns:

* API base URL and environment configuration.
* Credential handling for cookie-based authentication.
* Consistent response processing.
* Predictable error handling.
* Request timeouts where appropriate.
* Handling of authentication failures.
* Correct handling of JSON and non-JSON responses.

Feature-specific API modules should use the shared client.

Components should not need to know the details of HTTP configuration, session cookies, or raw transport errors.

Inspect the Vite configuration, Express CORS settings, server configuration, and API documentation before deciding how development and production requests should be routed.

Do not hardcode development URLs throughout the application.

Prefer a simple, deliberate deployment arrangement that avoids fragile cross-origin authentication behaviour.

## 9. API Contract and Business Rules

The existing backend implementation and its OpenAPI documentation are the sources of truth.

Before implementing an API integration:

1. Locate the relevant backend route.
2. Inspect request validation and accepted parameters.
3. Inspect the response structure.
4. Determine authentication requirements.
5. Inspect error responses.
6. Check relevant integration tests.
7. Confirm how the frontend should handle the result.

Never invent endpoints, fields, status values, or error formats.

If documentation and implementation disagree, report the discrepancy instead of silently guessing.

If an endpoint is missing, identify the dependency and request approval for a backend change.

The backend remains authoritative for:

* Product prices.
* Order totals.
* Quantity and product validation.
* Inventory or stock rules, where implemented.
* Payment status transitions.
* Creator ownership and authorization.
* Persisted business data.

The frontend may calculate indicative totals for immediate feedback, but those calculations must not replace backend validation.

If prices are represented as integer pesewas by the API, preserve that representation internally and format the value for display in Ghanaian cedis. Verify the actual contract before implementing currency formatting.

## 10. Authentication and Sessions

Creator authentication uses HTTP-only session cookies.

Inspect the actual authentication endpoints and middleware before implementing the authentication flow.

The frontend should account for:

* Successful login.
* Failed login.
* Session restoration after a page refresh.
* Protected routes.
* Expired or invalid sessions.
* Unauthorized API responses.
* Logout and session invalidation.
* Appropriate navigation after authentication changes.

Do not attempt to read the HTTP-only session cookie from JavaScript.

Do not treat client-side route protection as a substitute for backend authorization.

Do not assume the browser will send cookies automatically across origins. Configure requests, development routing, CORS, and cookie behaviour according to the actual environment.

Avoid unnecessary authentication requests, redirect loops, and inconsistent logged-in state.

If the backend does not support a required behaviour, report it instead of simulating it in the frontend.

## 11. UI Behaviour and Accessibility

Every data-driven screen must handle:

1. Loading.
2. Successful results.
3. Empty results.
4. Failed requests.

Provide clear feedback when users submit forms or perform important actions.

* Use readable labels and useful validation messages.
* Make important actions keyboard-accessible.
* Provide visible focus states.
* Maintain readable colour contrast.
* Use semantic HTML.
* Ensure forms can be operated without relying exclusively on visual cues.
* Make layouts usable on mobile screens.
* Confirm destructive or consequential actions when appropriate.
* Prevent accidental duplicate submissions where relevant.
* Provide sensible recovery actions after failures.

Avoid displaying raw technical errors or stack traces to users.

Do not hide failed requests behind empty lists or hardcoded fallback data.

The interface should prioritize the needs of sellers conducting real transactions.

## 12. Frontend Testing

Use the existing test setup where practical.

Add or update tests for new behaviour.

Tests should verify meaningful behaviour rather than implementation details alone.

Important areas include:

* Form validation and submission.
* API success and error handling.
* Authentication and protected navigation.
* Loading, empty, and error states.
* Product management.
* Live-session management.
* Order creation and management.
* Payment-status updates.
* Currency and total formatting.
* Order export.
* Public ordering workflows.

Use appropriate component and integration tests.

Introduce browser-level tests with Playwright at an appropriate stage, especially for critical end-to-end journeys.

Do not introduce unnecessary mocking that causes tests to pass while hiding contract mismatches.

Never modify tests merely to conceal a regression.

Do not claim that a test passed unless it was actually executed and its result observed.

Distinguish clearly between checks that passed, failed, were skipped, or could not be run.

## 13. Styling and User Experience

Use the existing styling system where it is sound.

If Tailwind CSS 4 is selected, follow its actual configuration and conventions.

Keep styling consistent and avoid unnecessary duplication.

Prioritize:

* Clear information hierarchy.
* Predictable navigation.
* Readable data tables and lists.
* Obvious primary actions.
* Useful empty states.
* Clear form errors.
* Responsive layouts.
* Accessible interaction patterns.

Avoid adding elaborate visual effects, unnecessary animation, or a large design system without a product requirement.

Do not prioritize appearance over correctness and usability.

## 14. Environment and Security

Inspect existing environment-variable conventions before changing them.

* Keep secrets on the server.
* Never expose backend credentials in frontend environment variables.
* Treat Vite-exposed environment variables as public.
* Do not commit `.env` files containing secrets.
* Do not log authentication tokens or sensitive customer information.
* Do not bypass server-side authorization.
* Do not trust client-provided prices or order totals.
* Use the established application configuration instead of scattering environment checks across components.

Document any new environment variables and their purpose.

## 15. Implementation Stages

Implement the frontend incrementally, subject to review and approval.

The proposed sequence is:

1. Repository reconnaissance and architecture approval.
2. Frontend engineering foundation and project structure.
3. Shared API client, routing, query configuration, and application shell.
4. Creator login, session restoration, protected routes, and logout.
5. First vertical slice: authenticated creator reaches a dashboard displaying real Lives.
6. Live-session management.
7. Product management.
8. Order management and payment tracking.
9. Order export.
10. Public customer ordering experience.
11. End-to-end verification, responsive checks, and deployment integration.

Adjust the sequence only when the actual repository or API contract provides a clear reason.

The first implementation stage is reconnaissance only. Do not begin implementation before the proposed architecture and staged plan have been reviewed and approved.

The first functional milestone should prove a complete vertical slice rather than merely produce static screens.

## 16. Verification and Reporting

Before completing a task:

* Run the relevant type checks.
* Run relevant tests.
* Run linting if configured.
* Run a production build when appropriate.
* Inspect the final diff.
* Run `git diff --check`.
* Check that unrelated files have not changed.
* Identify any checks that could not be run.

Use the repository's actual package scripts and configuration. Do not assume a command exists before checking.

Report:

1. What was implemented.
2. Which files changed.
3. Important design decisions and why they were made.
4. Commands and tests executed.
5. Actual results.
6. Known limitations and unverified behaviour.
7. Any decisions or API changes requiring approval.

Do not claim the feature is fully verified solely because the build succeeds.

## 17. Definition of Done

A task is complete only when:

* The approved requirements are implemented.
* The implementation follows the actual API contract.
* TypeScript remains appropriately strict.
* Relevant tests have been added or updated.
* Available verification checks have been executed.
* The changes are limited to the approved scope.
* The diff has been reviewed.
* Remaining limitations are documented.

Do not proceed to the next major stage until the current stage is ready for review.
