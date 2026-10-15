# LiveOrder design system

This document defines the shared visual direction for the seller workspace and the public customer storefront. It is a token and interaction guide, not a fixed page mockup. Product work should preserve the system while adapting each screen to its task.

## Product feel

LiveOrder should feel dependable, clear, and approachable for a seller working quickly during a Live. Keep the interface calm and practical. Prioritize readable customer details, obvious next actions, and honest loading, empty, and error states. Do not add decorative charts, invented metrics, or effects that slow common work down.

## Color and theme

The default theme uses a deep green brand accent against warm, pale neutrals. The seller workspace uses the same surface language as the public storefront, while its navigation and controls remain private and management-oriented.

Theme values are implemented as CSS custom properties in `client/src/index.css`, then exposed as Tailwind 4 theme utilities. Change the root tokens there to tune the application globally.

| Purpose | Token family | Use |
|---|---|---|
| Brand | `brand-*` | Primary actions, active navigation, links, and brand marks. |
| Page and surfaces | `canvas`, `surface` | Soft app background and raised content surfaces. |
| Text | `ink`, `ink-muted`, `ink-faint` | Main copy, supporting copy, and low emphasis metadata. |
| Borders | `border` | Dividers and control outlines. |
| Danger | `danger-*` | Errors and destructive actions. |
| Status | `status-good-*`, `status-warn-*`, `status-neutral-*` | Active/paid, pending, and draft/ended states. |

Status always includes readable text; color is supplementary. Avoid hardcoded colors in feature markup when a token exists.

## Typography

Use the system sans-serif stack defined by `--font-ui`. Keep page titles strong and concise, section titles easy to scan, and helper text comfortably readable. Use tabular or aligned figures where lists show repeated prices or totals. Money from the API stays in integer pesewas and is formatted only for display.

## Shape, spacing, and elevation

Use the shared `rounded-control` and `rounded-panel` radii for inputs/actions and content panels. Cards use the shared light shadow and border. Prefer consistent Tailwind spacing steps over one-off pixel values. Use whitespace to separate tasks; avoid nested cards unless they clarify a real hierarchy.

## Interaction and accessibility

- Provide visible `focus-visible` rings on every interactive control.
- Keep touch targets at least 40px high; primary form actions should be larger when space allows.
- Use semantic headings, buttons, links, labels, and live regions.
- Pair status colors with words and error colors with plain language.
- Respect reduced-motion preferences. Motion should clarify state changes, not decorate the interface.
- Destructive actions require an explicit confirmation in the feature where they are introduced.
- Keep loading, empty, error, and success feedback close to the affected content.

## Responsive behavior

Start with a single-column mobile layout, then add desktop density. Keep customer product cards touch-friendly. Use a sidebar for seller navigation at wide sizes and compact top navigation on smaller screens. Avoid horizontal scrolling for essential information; use responsive cards when a desktop table would become unreadable.

## Shared components

Reusable primitives live under `client/src/components/`. Current components include buttons, cards, text fields, status badges, page headings, and request/loading/empty feedback. Add a shared component when a pattern is repeated or has accessibility behavior worth centralizing; keep feature-specific composition inside its feature module.

## Experience boundaries

The seller workspace and customer storefront share tokens and basic primitives only. Seller navigation, account controls, and management actions must never appear in the public customer layout. Public routes must not require a creator session. Customer pages should not imply payment verification or delivery guarantees that the API does not provide.
