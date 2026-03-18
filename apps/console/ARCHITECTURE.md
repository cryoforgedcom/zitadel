# ZITADEL Frontend Architecture Plan

## Target Monorepo Structure (Option B — Everything in One Repo)

```
apps/
├── console/        # Single-instance admin (AGPL-3.0)
├── login/          # Product login, ships in containers (MIT)
├── docs/           # Documentation (Apache 2.0)
├── cloud/          # Cloud app — multi-instance console + admin + billing + cloud login (Source Available)
└── website/        # Marketing site (Source Available)

packages/
├── zitadel-client/  # API client (MIT, exists)
├── zitadel-proto/   # Proto definitions (MIT, exists)
└── zitadel-ui/      # Shared design system (Apache 2.0, new)
```

> [!IMPORTANT]
> `apps/cloud` and `apps/website` are **source-available but not open source** — viewable but not usable without written permission. `packages/zitadel-ui` is Apache 2.0 (matching the contribution license). All other apps follow their existing licenses. See `LICENSING.md`.

---

## Phase 1: Cloud App Skeleton

**Goal**: `apps/cloud` as a real Next.js app that embeds console with multi-instance support.

- [ ] Scaffold `apps/cloud` as a Next.js app with its own `next.config.ts`, `package.json`, `project.json`
- [ ] Import and re-use console page components (not copy — import from `../../console/`)
- [ ] Multi-instance routing: `/instances/{id}/users`, `/instances/{id}/organizations`, etc.
- [ ] Instance switcher in top bar
- [ ] Instance context provider that resolves API target from URL params
- [ ] `pnpm nx dev cloud` runs alongside `pnpm nx dev console-next`

### Solves the Login Build Problem

Instead of nasty Nx build targets to differentiate cloud-login from product-login:
- `apps/login` → clean product login, ships in containers (stays MIT)
- `apps/cloud` → includes its own login routes with cloud customizations (AGPL-3.0)

No build flags, no conditional compilation. Two separate deployable apps.

---

## Phase 2: Shared Design System (`packages/zitadel-ui`)

- [ ] Reconcile `new-website/packages/theme` tokens with console's shadcn tokens
- [ ] Extract shared components: `StatusBadge`, `TablePagination`, `TableSkeleton`, sidebar, top bar
- [ ] Both `apps/console` and `apps/cloud` consume `@zitadel/ui`

---

## Phase 3: Cloud-Specific Features

- [ ] Instance management pages (list, create, status, region, version)
- [ ] Billing & subscription management
- [ ] Usage metrics
- [ ] Cloud signup flow

---

## Phase 4: Debug Page (Vercel Preview Testing)

- [ ] `/debug` route in `apps/cloud` — only when `NEXT_PUBLIC_VERCEL_ENV === "preview"` or `NODE_ENV === "development"`
- [ ] Enter instance URL + PAT → stored in cookie + localStorage
- [ ] Persistent banner showing active test instance
- [ ] Save/switch between multiple test instances

---

## Phase 5: Website Migration

- [ ] Move `new-website/apps/website` into `apps/website/`
- [ ] Consume `@zitadel/ui` for shared tokens and components

---

## Open Questions

1. **Instance API**: Which API provides the list of instances for the cloud instance switcher?
2. **Console import strategy**: Should cloud import console pages directly (`../../console/app/users/page`), or should shared pages be extracted to `packages/`?
3. **Auth for cloud**: Same OIDC flow as console, or separate?
4. **Tailwind version alignment**: Website uses v4, console uses v3
