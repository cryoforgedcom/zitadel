# @zitadel/ui

Shared design system and component library for all ZITADEL frontend applications.

## Consumers

- `apps/console` — Instance admin console
- `apps/login` — Authentication flows
- `apps/docs` — Documentation
- `apps/website` — Marketing website
- `apps/cloud` — Cloud admin portal

## Planned Components

Extracted from `apps/console/components/ui/` once shared across multiple apps:

- **StatusBadge** — Semantic status indicators (active, inactive, destructive, warning)
- **TablePagination** — Paginated table controls
- **TableSkeleton** — Loading skeletons for tables
- **Sidebar, TopBar** — App shell / navigation
- **Badge, Button, Card, Tabs** — Base primitives (shadcn/ui based)

## Design Tokens

Shared color palette, typography, spacing, and dark mode support via CSS custom properties.

## Tech Stack

- React components (TypeScript)
- CSS custom properties for theming
- Built on shadcn/ui primitives
