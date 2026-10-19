# LiveOrder — Product Architecture and UI Design Brief

**Document:** `architecture.md`
**Product:** LiveOrder
**Status:** Initial product and design specification
**Primary audience:** TikTok LIVE sellers
**Initial market:** Ghana
**Currency:** Ghanaian cedi (GHS)
**Primary goal:** Make order management during live-selling sessions simple, reliable, and organized.

---

# 1. Product Overview

## 1.1 What Is LiveOrder?

LiveOrder is a lightweight order-management application designed for small businesses and individual sellers who sell products during TikTok LIVE sessions.

During a typical selling session, a seller may showcase clothing, accessories, beauty products, household items, or other merchandise. Customers express interest in products and provide information needed to complete their purchases.

Managing these orders manually can become difficult. Sellers may have to switch between TikTok comments, direct messages, mobile money notifications, and handwritten notebooks.

LiveOrder provides an organized workspace for managing the operational side of this process.

Sellers can create selling sessions, add products, review customer orders, track payment status, and export order records.

Customers can access a public page for an active Live, browse its products, and submit orders without creating an account.

## 1.2 The Problem

Live sellers frequently need to manage several activities simultaneously:

* Presenting products to viewers.
* Keeping track of products and their prices.
* Recording customer names and phone numbers.
* Capturing delivery locations.
* Recording the quantities and options customers request.
* Checking whether customers have paid.
* Identifying unpaid orders.
* Organizing orders for fulfilment.
* Exporting order records for later processing.

Manual processes make it easier to lose orders, overlook payments, misread customer information, or lose track of product availability.

LiveOrder aims to reduce this operational burden.

## 1.3 Product Vision

Help live sellers spend less time organizing orders and more time selling.

LiveOrder should make order management feel straightforward, even for sellers who are not particularly comfortable with technology.

## 1.4 Product Principles

### Simplicity first

The interface should be understandable without extensive training.

### Operational clarity

The seller should quickly understand which Live is active, which orders have arrived, and which orders have been paid.

### Trustworthy information

Customer information, prices, quantities, and payment statuses must be presented clearly.

### Mobile-friendly by default

The application must work on mobile devices as well as desktop and laptop screens.

### No unnecessary complexity

Avoid features, charts, settings, and abstractions that do not directly help sellers complete their work.

### Honest system state

Never display fake orders, fabricated statistics, or success messages when an operation has failed.

Every dashboard metric and order record should reflect real backend data.

---

# 2. Target Users

## 2.1 Primary User: The Seller

A small-business owner who sells products through TikTok LIVE.

The seller may have limited technical experience and may be working alone or with a small team.

Typical responsibilities include:

* Creating a Live selling session.
* Adding products and prices.
* Reviewing incoming orders.
* Confirming payments.
* Recording customer delivery information.
* Exporting order records.

The seller values speed, clarity, and reliability.

## 2.2 Secondary User: The Customer

A viewer who wants to purchase a product advertised during a Live.

The customer should be able to open a public Live page, inspect available products, select product options where applicable, provide their contact and delivery details, and submit an order.

The customer should not need to register for a LiveOrder account.

The public ordering experience should be simple enough to use from a mobile browser.

---

# 3. Product Scope

## 3.1 Initial Capabilities

The first version should support:

1. Seller access-code authentication.
2. Session restoration after refreshing the page.
3. A seller dashboard.
4. Live session creation and listing.
5. Live session activation and completion.
6. Product management for a Live, including creation, editing, and deletion when no order history references the product.
7. Public access to an active Live.
8. Public product browsing.
9. Customer order submission.
10. Seller order listing.
11. Order and customer information review.
12. Payment-status updates.
13. CSV order export.
14. Clear loading, success, empty, and error states.

## 3.2 Not Currently in Scope

Do not assume the first version supports:

* Automated TikTok integration.
* Automatic reading of TikTok comments.
* Automatic mobile money payment verification.
* Payment gateway integration.
* Automated delivery-provider integration.
* Customer accounts.
* Seller registration or password recovery.
* Multiple employees and role-based permissions.
* Product inventory management.
* Order cancellation or refunds.
* Automated customer notifications.
* Real-time order notifications.
* Advanced analytics and financial reporting.

These may become future capabilities, but the initial UI must not imply they already exist.

## 3.3 Product Reality

LiveOrder currently helps the seller organize the process. It does not automatically retrieve TikTok comments or verify mobile money transactions.

A seller can review an order and manually update its payment status using the available application functionality.

The interface must communicate this accurately.

---

# 4. Information Architecture

The application has two distinct experiences.

## 4.1 Seller Application

The private seller workspace contains:

* Dashboard
* Lives
* Live details
* Products
* Orders
* Payment status
* CSV export
* Account/session controls

These screens require seller authentication, except for the login screen.

## 4.2 Public Customer Experience

The public experience contains:

* Public Live page
* Product browsing
* Product option selection
* Order form
* Order submission confirmation
* Recoverable order-submission errors

Customers must not be required to sign in.

Public pages must not expose seller account information or private order records.

## 4.3 Suggested Navigation

### Desktop

Use a compact sidebar with:

* LiveOrder logo
* Dashboard
* Lives
* Account or session menu

When a seller opens a Live, show contextual navigation or tabs for:

* Overview
* Products
* Orders

This avoids unnecessarily crowding the global navigation.

### Mobile

Use a compact navigation pattern suitable for small screens.

The seller should be able to reach Lives and Orders quickly without dealing with a crowded sidebar.

Use bottom navigation or a collapsible navigation menu if it improves usability.

The main task should remain obvious on every screen.

---

# 5. Screen Specifications

## 5.1 Screen A: Seller Login

**Route:** `/login`

### Purpose

Allow a seller to access their private workspace using their access code.

### Required elements

* LiveOrder branding.
* A short, welcoming heading.
* A brief explanation of the application's purpose.
* Access-code input.
* Show/hide access-code control if appropriate.
* Primary sign-in button.
* Loading indicator during submission.
* Inline validation and authentication errors.
* Keyboard-accessible form controls.

### Suggested copy

Heading: "Welcome back"

Supporting text: "Manage your Lives, orders, and payments in one place."

Field label: "Access code"

Primary action: "Continue"

### Behaviour

* Submit the access code to the backend.
* On success, establish the authenticated application state and navigate to the seller workspace.
* On failure, show a clear error without unnecessarily revealing authentication details.
* Prevent accidental repeated submissions while the request is in progress.
* Restore the seller's session when a valid session cookie already exists.
* If an authenticated seller visits `/login`, redirect them to the application.

### Design direction

A simple, professional layout with a focused form.

Avoid unnecessary registration, password-reset, or social-login options because they are not supported by the current backend.

---

## 5.2 Screen B: Seller Dashboard

**Route:** `/`

### Purpose

Give the seller a quick overview and a clear next action.

### Required elements

* Greeting or concise welcome heading.
* Primary action to create a Live.
* Active Live section, if an active Live exists.
* Recent or available Lives.
* Useful order-related summaries when supported by real data.
* Clear empty state for a new seller.
* Loading and error states.

### Suggested layout

**Header**

"Your selling workspace"

Supporting text: "Manage your Lives and keep your orders organized."

Primary button: "Create a Live"

**Active Live card**

Display, when available:

* Live name.
* Live status.
* Number of orders, if real data is available.
* Action to open the Live workspace.
* Action to end the Live when appropriate.

**Recent Lives**

Show a compact list of recent Lives with:

* Name.
* Status.
* Creation date when available.
* Link to details.

### Empty state

When the seller has no Lives:

Heading: "Your first Live starts here"

Text: "Create a Live to organize your products and customer orders."

Button: "Create your first Live"

### Data integrity

Do not display invented sales totals, revenue charts, order counts, or conversion rates.

Only show metrics supported by actual backend responses.

If the current API does not provide a required metric, omit it until the backend supports it.

---

## 5.3 Screen C: Lives Management

**Route:** `/lives`

### Purpose

Allow the seller to view and manage selling sessions.

### Required elements

* Page heading.
* Create Live action.
* List of Lives.
* Status indicators.
* Navigation to each Live's details.
* Empty, loading, and error states.

### Live statuses

* Draft
* Active
* Ended

Use both text and visual treatment to distinguish statuses.

Do not rely on colour alone.

### Create Live interaction

Open a dialog, drawer, or simple form containing:

* Live name.
* Create button.
* Cancel action.

Validate the name and explain errors inline.

### Available operations

The current backend supports:

* Creating a Live.
* Listing the authenticated seller's Lives.
* Activating a draft Live.
* Ending an active Live.

The interface must respect valid status transitions.

Do not show an activation action for a Live that has already ended.

Do not invent editing, deletion, duplication, or reopening capabilities.

---

## 5.4 Screen D: Live Workspace

**Route:** `/lives/:liveId`

### Purpose

Provide a focused workspace for a specific selling session.

### Header

Display:

* Live name.
* Status badge.
* Relevant status action.
* Navigation back to Lives.

### Main content

Provide three contextual sections:

1. Overview
2. Products
3. Orders

These may be implemented as tabs or separate nested routes.

### Overview section

Display:

* Live name and status.
* Products associated with the Live.
* Order-related information when available.
* Public Live URL or customer-facing access action, when a suitable public URL is established.
* Relevant next actions.

The public customer page should only work when the Live is active.

Do not expose the seller's private workspace through the public URL.

### Status actions

For a draft Live, offer activation.

For an active Live, offer an end-Live action with clear wording.

If ending a Live is consequential, ask for confirmation.

After ending a Live, clearly explain that customers can no longer place new orders through its public ordering page.

The backend remains authoritative about whether an order can be accepted.

---

## 5.5 Screen E: Product Management

**Route:** `/lives/:liveId/products`

### Purpose

Allow the seller to add products to a Live.

### Product information

The current backend supports:

* Product name.
* Price in integer pesewas.
* Optional product option groups stored as an object whose values are arrays of selectable strings.
* A non-negative integer stock quantity. Existing products migrate to zero stock so they are unavailable until a creator sets a quantity.
* One primary product image, stored through the Cloudinary adapter and represented separately by a `ProductImage` record.

Examples of options include:

* Size: S, M, L, XL.
* Colour: Black, White, Blue.
* Other product-specific selections.

The seller interface edits option groups and choices visually and stores them as a JSON object such as `{ "Size": ["S", "M"], "Colour": ["Black", "White"] }`. Choices do not have independent prices or stock. Existing JSON that is already an object of string arrays can be edited directly. Other legacy JSON is preserved on unrelated product edits; a creator must deliberately choose to replace it before it is changed.

Creators can set one stock count for the whole product. Option choices do not represent separately stocked variants. New and migrated products default to zero stock.

Product images are uploaded to the backend as JPEG, PNG, or WebP files up to 5 MB. The server validates MIME type and file signature before sending the image through its storage adapter. Cloudinary API credentials are server-only. `ProductImage` stores the public URL separately from the provider and provider object identifier; the initial UI exposes one primary image while the relation permits more images later.

Storage and database writes cannot be atomic together. Replacing an image stores the new object and commits it as primary before deleting the previous object; failed old-object cleanup leaves a non-primary database record. Product deletion removes image rows with the product before attempting provider cleanup, so a provider outage during deletion can leave an untracked remote asset.

### Add-product form

Include:

* Product name.
* Price in GHS.
* Optional product options.
* Save product button.
* Cancel action.
* Inline validation.
* Submission progress and errors.

### Price entry

Allow sellers to enter familiar cedi amounts, such as `25.00`.

Convert the value correctly before submitting it to the API, which expects integer pesewas.

Never use floating-point arithmetic carelessly for financial calculations.

### Product list

Each product card or row should show:

* Product name.
* Price.
* Configured option groups and choices.
* Current stock, with out-of-stock and low-stock feedback.
* The primary image when present, with a neutral fallback.

On mobile, prefer simple cards. On desktop, a compact table or grid may be appropriate.

Product list, create, update, delete, stock, and image operations are available in the current API. Product deletion is rejected when the product has order history. Image upload is authenticated and accepts JPEG, PNG, and WebP files up to 5 MB.

---

## 5.6 Screen F: Orders Management

**Route:** `/lives/:liveId/orders`

### Purpose

Give the seller a reliable view of customer orders for a specific Live.

### Required order information

Display:

* Customer name.
* Customer phone number.
* Delivery location.
* Order items.
* Quantities.
* Selected product options, when present.
* Total amount.
* Payment status.
* Order date or time, if available.

### Desktop layout

A compact table may be appropriate.

Possible columns:

* Customer
* Items
* Total
* Payment
* Order time
* Action

Keep the most important information visible without requiring excessive horizontal scrolling.

### Mobile layout

Use stacked order cards or a responsive layout.

The seller should be able to identify a customer, understand the order total, and inspect the payment status quickly.

### Filtering and search

Design room for useful filtering, particularly:

* All orders.
* Unpaid orders.
* Paid orders.

Only implement search or filtering using available data. Client-side filtering of the currently loaded order list is acceptable when the list contains the complete relevant dataset.

Do not imply server-side search or pagination if the API does not provide it.

### Empty state

Heading: "No orders yet"

Text: "Orders placed through your public Live page will appear here."

If the Live is not active, explain that customers cannot place new orders until the Live is active.

### Data integrity

Display totals returned by the backend.

The backend calculates authoritative order totals and validates order items.

Do not calculate a replacement total in the UI and treat it as authoritative.

---

## 5.7 Screen G: Order Details

**Proposed route:** `/lives/:liveId/orders/:orderId`

### Purpose

Let the seller inspect an individual order without overwhelming the main orders list.

### Information

* Customer name.
* Phone number.
* Delivery location.
* Ordered products.
* Quantities.
* Selected options.
* Total amount.
* Payment status.
* Order date, if available.

### Actions

The principal action is to mark an eligible unpaid order as paid.

The interface should explain what the action does and reflect the server's response.

### Backend limitation

The current backend provides order listing and payment-status updates but does not provide a dedicated order-detail endpoint.

Determine whether the order can be retrieved safely from the existing order-list response.

Do not create a fake detail screen or assume that a new endpoint exists.

If a dedicated endpoint is needed, document that as backend work.

---

## 5.8 Screen H: Payment Status

Payment status should be prominent in the order list and order details rather than hidden in a separate financial dashboard.

### Statuses

The current order-management operation supports marking an order as paid.

The UI should distinguish:

* Unpaid.
* Paid.

Use readable labels, not colour alone.

### Mark-as-paid interaction

When a seller selects "Mark as paid":

1. Prevent duplicate submissions while the request is in progress.
2. Submit the supported payment-status update.
3. Update the interface using the server response.
4. Show a concise success message.
5. Show an actionable error if the update fails.

The action must be idempotent from the user's perspective.

### Important clarification

Marking an order as paid is a manual record update. It is not automatic mobile money verification.

Do not imply that LiveOrder has verified a transaction directly with a payment provider.

---

## 5.9 Screen I: Export Orders

**Entry point:** Orders workspace

### Purpose

Allow the seller to download order records for record-keeping and fulfilment.

### Required interaction

Provide a clear "Export CSV" action.

When selected:

* Request the export from the backend.
* Download the returned CSV file.
* Show progress where appropriate.
* Explain failures clearly.

### Behaviour

The export should use the backend's existing CSV endpoint.

Do not silently generate a different dataset on the client.

Ensure the interface handles an unsuccessful response without attempting to download an error message as if it were a CSV file.

---

## 5.10 Screen J: Public Live Store

**Route:** `/live/:slug`

**Authentication:** Not required.

### Purpose

Provide a customer-facing page for an active Live.

### Design goals

This is a purchasing experience, not an administration dashboard.

It should be mobile-first, fast, and easy to understand.

### Header

Display:

* LiveOrder branding.
* Live name.
* A clear indication that the customer is viewing products from a selling session.

Avoid suggesting that the page is officially operated by TikTok.

### Product listing

Each product should show:

* Product name.
* Price in GHS.
* Available product options, when present.
* A clear action to select or order the product.

Use simple product cards with readable prices and well-defined interactions.

Show the product's primary image where present and a neutral fallback where it is absent.

### Order composition

Allow customers to select:

* One or more products.
* Quantities.
* Relevant product options.

Display the selected items clearly before submission.

Where the design shows a running subtotal, make it clear that the server determines the authoritative order total.

### Customer details form

Collect:

* Customer name.
* Phone number.
* Delivery location.

Keep the form short and appropriate for mobile use.

Use clear labels and inline validation.

### Submission

On submission:

1. Validate the form.
2. Prevent accidental duplicate submissions.
3. Send the order to the backend.
4. Handle success and failure explicitly.

The customer should not lose their form input unnecessarily when a recoverable request error occurs.

### Inactive or unavailable Live

If the Live is ended, missing, or otherwise unavailable, show a clear explanation and do not offer an order-submission action.

The backend remains responsible for enforcing order eligibility.

---

## 5.11 Screen K: Order Confirmation

**Purpose:** Confirm that a customer order was submitted successfully.

### Required elements

* Success indicator.
* Clear confirmation heading.
* Brief confirmation message.
* Summary of submitted items when the response contains enough information.
* Total amount when reliably available.
* Customer-facing next steps, if applicable.

### Suggested copy

Heading: "Your order has been received"

Supporting text: "Your order details have been submitted successfully."

Do not claim that payment has been received or verified unless the backend explicitly confirms that state.

Do not invent an order number or reference if the response does not provide one.

The screen should be reassuring without making promises about delivery times or payment verification.

---

# 6. Core User Journeys

## 6.1 Seller Journey

1. Seller opens LiveOrder.
2. Application checks whether a valid session exists.
3. If unauthenticated, seller sees the login screen.
4. Seller enters their access code.
5. Application authenticates the seller.
6. Seller lands on the dashboard.
7. Seller creates a Live.
8. Seller adds products.
9. Seller activates the Live.
10. Seller shares the public Live URL with customers.
11. Customers submit orders.
12. Seller reviews orders.
13. Seller records payment status.
14. Seller exports order records.
15. Seller ends the Live when finished.

The sequence is illustrative; the UI should respect actual backend state transitions and requirements.

## 6.2 Customer Journey

1. Customer opens a public Live URL.
2. Customer sees the active Live and its products.
3. Customer selects products, quantities, and options.
4. Customer enters their name, phone number, and delivery location.
5. Customer reviews their selections.
6. Customer submits the order.
7. Application displays a successful confirmation or a recoverable error.

No customer account is required.

## 6.3 Session Restoration

1. Seller refreshes the page or returns to the application.
2. The application requests the current creator session.
3. If the session is valid, the seller remains authenticated.
4. If the session is invalid or expired, the seller is taken to login.
5. Public Live pages remain accessible without seller authentication.

The session cookie is HTTP-only and should not be accessed directly from JavaScript.

---

# 7. Visual Design System

## 7.1 Desired Personality

LiveOrder should feel:

* Clear.
* Dependable.
* Modern.
* Approachable.
* Efficient.
* Professional without being intimidating.

It should feel like a well-made tool for a small business, not an overcomplicated corporate platform.

## 7.2 Colour Direction

Explore a restrained visual palette.

A possible direction:

* Deep charcoal or near-black for primary text.
* A light neutral background.
* White surfaces for cards and forms.
* One strong primary accent for primary actions.
* Green for successful or paid states.
* Amber for attention or unpaid states.
* Red for destructive actions and errors.

These are starting points rather than fixed requirements.

Ensure all combinations provide sufficient contrast and that status is communicated with text as well as colour.

## 7.3 Typography

Use a clean, highly readable sans-serif typeface.

Establish a clear hierarchy between:

* Page headings.
* Section headings.
* Card titles.
* Body text.
* Secondary metadata.
* Form labels.
* Financial values.

Prices and totals should be easy to scan.

## 7.4 Components

Create consistent visual patterns for:

* Buttons.
* Text inputs.
* Form labels and validation messages.
* Cards.
* Tables.
* Status badges.
* Dialogs.
* Tabs.
* Empty states.
* Loading indicators.
* Error messages.
* Toasts or feedback messages.
* Confirmation prompts.

Do not introduce a large component library unless it clearly improves delivery speed and consistency.

## 7.5 Responsive Behaviour

### Mobile

* Single-column layouts where appropriate.
* Comfortable touch targets.
* Minimal horizontal scrolling.
* Short forms.
* Visible primary actions.
* Order cards where dense tables are impractical.

### Desktop

* Compact sidebar or equivalent navigation.
* Wider content area.
* Tables where they improve order scanning.
* Appropriate information density.
* Consistent spacing and alignment.

Design for both environments rather than simply shrinking a desktop mockup.

## 7.6 Accessibility

* Use semantic HTML.
* Associate labels with form controls.
* Support keyboard navigation.
* Make focus states visible.
* Provide meaningful error messages.
* Avoid colour-only status communication.
* Maintain sufficient contrast.
* Ensure dialogs and menus are keyboard-accessible.
* Respect reduced-motion preferences.

---

# 8. Technical Architecture

## 8.1 Existing Technology

### Frontend

* React.
* TypeScript.
* Vite.
* Tailwind CSS 4.
* React Router.
* TanStack Query.
* Native Fetch behind a central API client.
* Vitest and React Testing Library for frontend tests.

### Backend

* Node.js.
* Express 5.
* TypeScript.
* Prisma.
* SQLite.
* Zod validation.
* Cookie-based creator sessions.
* OpenAPI documentation.

The existing repository and installed dependencies remain the source of truth. Do not introduce duplicate libraries or rebuild working infrastructure without a clear reason.

## 8.2 Suggested Frontend Structure

Organize the frontend by application responsibility and product feature.

```text
client/src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
├── components/
│   ├── layout/
│   └── ui/
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── lives/
│   ├── products/
│   ├── orders/
│   └── public-live/
├── lib/
│   ├── api-client.ts
│   └── query-client.ts
├── types/
├── index.css
└── main.tsx
```

This is a proposed structure, not a reason to create empty folders or abstractions without use.

Each feature should own its relevant components, API functions, hooks, validation, and tests as complexity grows.

## 8.3 API Communication

Use a single API client as the boundary between the frontend and backend.

The API client should provide:

* A consistent base URL.
* Cookie credentials where required.
* JSON request support.
* Correct handling of `204 No Content`.
* JSON and non-JSON response handling.
* Consistent error representation.
* Request cancellation where appropriate.
* Reasonable timeout handling.
* File-download support for CSV exports.

Do not scatter raw `fetch` calls across unrelated components.

## 8.4 Development and Production Networking

Use a Vite development proxy if it suits the actual backend setup.

Verify the backend's real listening port and API routes before configuring it.

Ensure cookies work correctly in development.

For production, explicitly define how the frontend reaches the backend and how session cookies and cross-origin requests are configured.

Do not assume the development proxy automatically exists in production.

## 8.5 Server State

Use TanStack Query for server-owned data.

It should handle relevant concerns such as:

* Loading states.
* Query errors.
* Cache invalidation.
* Refetching after mutations.
* Session and Live data retrieval.

Use local React state for temporary UI concerns, such as open dialogs or form selections.

Avoid adding a global state library unless a real requirement emerges.

## 8.6 Authentication

The backend uses an HTTP-only cookie for creator sessions.

The frontend should:

* Authenticate through the access endpoint.
* Restore the session through the current-creator endpoint.
* Protect seller-only routes.
* Redirect unauthenticated sellers to login.
* Clear local authenticated state on logout.
* Handle expired or invalid sessions predictably.

Do not store session tokens in local storage.

## 8.7 Types and API Contracts

Keep frontend types aligned with the actual backend responses and request bodies.

Consider generating TypeScript types from the existing OpenAPI document if the specification supports reliable generation.

Do not create a complex code-generation pipeline unless it provides meaningful value.

Never assume a field or endpoint exists merely because a UI design needs it.

---

# 9. Existing API Capabilities

The current backend provides the following relevant operations.

| Capability              | Endpoint                                  | Access                                     |
| ----------------------- | ----------------------------------------- | ------------------------------------------ |
| Creator login           | `POST /api/v1/creator/access`             | Public                                     |
| Current creator session | `GET /api/v1/creator/me`                  | Authenticated                              |
| Creator logout          | `POST /api/v1/creator/logout`             | Public endpoint; clears the session cookie |
| List Lives              | `GET /api/v1/lives`                       | Authenticated                              |
| Create Live             | `POST /api/v1/lives`                      | Authenticated                              |
| Change Live status      | `PATCH /api/v1/lives/:liveId`             | Authenticated                              |
| Create product          | `POST /api/v1/lives/:liveId/products`     | Authenticated                              |
| List Live products      | `GET /api/v1/lives/:liveId/products`      | Authenticated                              |
| Update product          | `PATCH /api/v1/lives/:liveId/products/:productId` | Authenticated                    |
| Delete product          | `DELETE /api/v1/lives/:liveId/products/:productId` | Authenticated                  |
| Upload/replace image    | `POST /api/v1/lives/:liveId/products/:productId/image` | Authenticated               |
| Remove product image    | `DELETE /api/v1/lives/:liveId/products/:productId/image` | Authenticated               |
| List Live orders        | `GET /api/v1/lives/:liveId/orders`        | Authenticated                              |
| Submit public order     | `POST /api/v1/lives/:liveId/orders`       | Public                                     |
| Mark order paid         | `PATCH /api/v1/orders/:orderId`           | Authenticated                              |
| Export Live orders      | `GET /api/v1/lives/:liveId/orders/export` | Authenticated                              |
| Get public Live         | `GET /api/v1/public/lives/:slug`          | Public                                     |

The backend implementation and OpenAPI specification should be checked before implementation if either changes. Product responses include stock quantity and nullable primary image metadata. Public Live products include stock quantity and an `available` flag.

## 9.1 Important Limitations

The current API does not yet provide:

* Live deletion.
* A dedicated order-detail endpoint.
* Order cancellation or stock restoration.
* Automated payment verification.
* Automated fulfilment.

The frontend must not pretend these capabilities exist.

When a feature requires a missing endpoint, document the requirement and request backend work rather than hiding the limitation behind mock data.

---

# 10. Data and Business Rules

## 10.1 Monetary Values

The backend stores monetary values as integer pesewas.

The UI should display amounts in Ghanaian cedis using consistent locale-aware formatting.

Examples:

* `2500` pesewas represents GHS 25.00.
* `12550` pesewas represents GHS 125.50.

Use safe conversions between user-entered cedi amounts and integer pesewas.

The server calculates authoritative order totals.

The order endpoint uses current product prices and decrements the requested stock atomically with order creation. A conditional stock update inside the database transaction prevents two concurrent requests from purchasing the same remaining units; an insufficient-stock response is `409 INSUFFICIENT_STOCK`. Failed order creation rolls back all stock decrements. Orders consume stock at creation while still PENDING. There is no cancellation lifecycle, so the current API cannot restore stock; payment-status updates never change stock.

Public order creation accepts an optional UUID `Idempotency-Key` header. For requests that include it, the order stores the unique key and a SHA-256 fingerprint of the validated payload. Fingerprinting sorts object keys, preserves item-array order, treats omitted and empty option selections as equivalent, and includes the Live, customer details, product IDs, quantities, and selected options, but no prices. Retrying the same key and payload returns the original order; a different payload with that key receives `409 IDEMPOTENCY_KEY_REUSED`. The key and order are committed in the same transaction as stock changes. Existing clients may omit the header.

The storefront keeps its opaque idempotency key in tab-scoped `sessionStorage` until it receives a successful response. It does not persist customer details; after a refresh the customer re-enters them, and an identical request reuses the key. If the payload differs from a previously committed request, the storefront clears the mismatched key and asks the customer to submit again to begin a new request.

## 10.2 Live Status

The supported status flow is:

`DRAFT → ACTIVE → ENDED`

Do not assume that ended Lives can be reactivated.

## 10.3 Order Submission

The backend accepts customer name, phone number, delivery location, and order items.

Each item includes a product identifier and quantity, with optional selected options.

The server validates the order, determines applicable prices, and calculates the total.

The frontend should help the customer provide valid information, but backend validation remains authoritative.

## 10.4 Product Options

Product option groups are stored as `Record<string, string[]>`; each customer selection is a record from a configured group name to one of its configured choices. Choices are optional, but any submitted choice must belong to that product's current option group. The backend validates selections at order time. Existing legacy JSON that does not match this shape remains preserved until the seller explicitly replaces it; it is not silently mapped or discarded.

## 10.5 Privacy

Customer names, phone numbers, and delivery locations are personal information.

Only show them in appropriate contexts.

Do not expose private customer orders on public pages or include unnecessary customer data in public-facing responses.

Avoid collecting information beyond what the order process requires.

---

# 11. Interaction and Feedback Standards

Every data-driven screen should account for:

1. Initial loading.
2. Successful data retrieval.
3. Empty results.
4. Request failure.
5. Validation failure.
6. Mutation in progress.
7. Successful mutation.
8. Recoverable failure.

Use concise, actionable messages.

Examples:

* "Live created successfully."
* "We couldn't load your orders. Try again."
* "Enter a valid price."
* "Your session has expired. Please sign in again."
* "Order marked as paid."

Do not leave buttons apparently active when an operation is in progress if repeated clicks could create duplicate records.

Use confirmation dialogs for consequential actions where appropriate.

---

# 12. Implementation Roadmap

Build the application incrementally.

## Stage 1: Frontend Foundation

* Establish the frontend structure.
* Configure strict TypeScript.
* Set up routing.
* Configure TanStack Query.
* Build the central API client.
* Configure the development proxy.
* Establish frontend test infrastructure.
* Evaluate OpenAPI type generation.
* Create minimal shared UI primitives only where useful.

No feature screens are required at this stage.

## Stage 2: Authentication

* Login screen.
* Access-code submission.
* Session restoration.
* Protected seller routes.
* Logout.
* Authentication tests.

## Stage 3: First Vertical Slice

* Authenticated application shell.
* Dashboard.
* Real Live listing.
* Create Live flow.
* Loading, error, and empty states.

The goal is a complete, working journey backed by real API data.

## Stage 4: Live Management

* Live details.
* Status transitions.
* Active and ended states.
* Confirmation and feedback.

## Stage 5: Products and stock

* Add-product form.
* Price conversion.
* Product options as visual group and choice controls.
* Product image upload, replacement, and removal through a provider adapter.
* Stock quantity editing and availability display.
* Product listing, creation, updating, and deletion.

## Stage 6: Orders and Payments

* Order listing.
* Customer information.
* Item and total presentation.
* Payment-status updates.
* Appropriate filtering.
* Order details if supported.

## Stage 7: Export

* CSV download.
* File-response handling.
* Download errors and feedback.

## Stage 8: Public Ordering

* Complete: public Live page, product and option selection, quantities, customer details, stock validation, submission, confirmation, and stock-conflict recovery.

Next, implement seller order listing and manual payment tracking, then CSV export and browser-level critical journey verification.

## Stage 9: Quality and Release Readiness

* Run frontend tests.
* Run backend tests.
* Run type checking and production builds.
* Test authentication and session expiry.
* Test mobile and desktop layouts.
* Test public ordering and seller order management.
* Verify CSV downloads.
* Perform end-to-end tests for critical journeys.
* Check accessibility and keyboard interactions.
* Review the complete diff for unintended changes.

---

# 13. Quality Standards

A feature is not complete merely because its page looks correct.

Before considering a feature done:

* It must use the real API where an endpoint exists.
* Its types must agree with the actual API contract.
* Loading, empty, error, and success states must be considered.
* Forms must validate inputs appropriately.
* Actions must handle failure without losing data unnecessarily.
* Authentication boundaries must be respected.
* The interface must work at mobile and desktop widths.
* Relevant tests must pass.
* No unrelated backend or infrastructure changes should be introduced.
* No fabricated data should be presented as real.

Prefer small, reviewable changes.

Do not build every screen in one large implementation pass.

---

# 14. Design Brief for Google Stitch

Use this document as the source of truth when exploring visual designs.

## Design objective

Design a polished, mobile-responsive web application called LiveOrder for small businesses selling products through TikTok LIVE sessions.

The application helps sellers organize selling sessions, products, customer orders, payment status, and CSV exports.

Customers can browse an active public Live and submit an order without creating an account.

## Visual direction

Create a modern, clean, trustworthy business tool.

Use a restrained colour palette, strong typography, clear spacing, intuitive navigation, and readable financial information.

Prioritize usability over decorative effects.

Avoid generic dashboard clutter, excessive gradients, glassmorphism, unnecessary charts, and overly complicated navigation.

The interface should feel accessible to a small-business owner who may not be highly technical.

## Screens to explore

Design a cohesive experience for:

1. Seller login.
2. Seller dashboard with useful real-data-driven summaries and a clear empty state.
3. Lives list with Draft, Active, and Ended statuses.
4. Create Live form.
5. Live workspace with Overview, Products, and Orders sections.
6. Product creation and product listing.
7. Orders list with customer, item, total, and payment information.
8. Order details and mark-as-paid interaction.
9. CSV export interaction.
10. Public Live storefront with product selection.
11. Customer order form.
12. Order confirmation.
13. Loading, empty, error, and unavailable-Live states.

Use realistic example data for visual exploration, but do not treat those examples as actual production records or assume the backend supports fields that are not specified.

## Responsive requirements

Explore desktop and mobile layouts.

On desktop, optimize for efficient seller workflows and order scanning.

On mobile, optimize for touch interactions, compact navigation, readable forms, and clear product selection.

## Important functional constraints

* Seller authentication uses an access code.
* Customer ordering is public and requires no account.
* Live statuses are Draft, Active, and Ended.
* Prices are displayed in Ghanaian cedis.
* Orders contain customer contact and delivery information.
* Sellers can manually mark orders as paid.
* Orders can be exported as CSV.
* Payment verification is not automated.
* TikTok comments are not automatically imported.
* Stock is tracked once per product; options are not separately inventoried.
* Product image storage uses a replaceable server-side provider adapter.
* Use believable interface examples, but distinguish design placeholders from actual backend capabilities.

## Desired outcome

Produce a consistent visual system and screen designs that can guide incremental React implementation.

Prefer a few well-designed, connected workflows over a large collection of disconnected mockups.

The most important journey to communicate is:

**Seller signs in → creates a Live → adds products → activates the Live → receives customer orders → tracks payment status → exports order records.**

The public customer journey is:

**Customer opens a Live page → selects products → provides contact and delivery details → submits an order → receives confirmation.**
