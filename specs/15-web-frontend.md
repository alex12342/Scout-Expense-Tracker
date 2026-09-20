---
description: React SPA — app shell, routing, auth context, API client, pages, and the Trailhead Ledger design system.
status: active
---

# 15 — Web Frontend

Vite 7 + React 19 SPA served by nginx, talking to the Express API over
`/api`. State via @tanstack/react-query; routing via wouter; forms via
react-hook-form + zod.

Code: `artifacts/web/src/`.

## Stack

- React 19.1 (pinned), Vite 7, Tailwind CSS v4 (`@tailwindcss/vite`)
- @tanstack/react-query 5 (server state), wouter 3 (routing)
- react-hook-form + @hookform/resolvers/zod (forms)
- lucide-react (icons), class-variance-authority + clsx + tailwind-merge (UI)

## App structure

```
src/
  main.tsx            # QueryClientProvider + AuthProvider + ToastProvider + <App/>
  App.tsx             # route tree (wouter <Switch>)
  lib/
    api.ts            # fetch client, session storage, typed endpoint methods
    auth.tsx          # AuthProvider / useAuth (login, logout, refresh, user)
    types.ts          # shared TS types mirroring API responses
    money.ts          # cents → dollar formatting (Intl.NumberFormat USD)
    queryClient.ts    # QueryClient defaults
  components/
    AppShell.tsx      # sidebar nav + top bar + mobile drawer
    ui/               # primitives (Button, Card, Dialog, Table, Toast, Input,
                      # Select, Switch, Badge, StatCard, Spinner, EmptyState,
                      # ConfirmDialog, PageHeader)
  pages/              # one file per route
```

## Routing (wouter)

| Path | Page | Purpose |
|---|---|---|
| `/login` | `LoginPage` | username/password → `useAuth().login` |
| `/` | `DashboardPage` | totals, accounts, members, events, dues summary |
| `/scouts` | `ScoutsPage` | roster table, create/edit/delete |
| `/scouts/:id` | `ScoutDetailPage` | profile, ledger, add transaction, apply deposit, convert to leader |
| `/leaders` | `LeadersPage` | roster table, create/edit/delete |
| `/leaders/:id` | `LeaderDetailPage` | profile, ledger, add transaction, apply deposit |
| `/bank-accounts` | `BankAccountsPage` | accounts list, create/delete |
| `/bank-accounts/:id` | `BankAccountDetailPage` | balance, transactions, add expense/reimbursement |
| `/events` | `EventsPage` | events list, create, delete |
| `/events/:id` | `EventDetailPage` | line items, participants, payments/refunds, cost edits, **finalize** |
| `/dues` | `DuesPage` | cycles, entries, generate, add members, payments, bulk ops |
| `/ledger` | `LedgerPage` | filterable ledger, edit/delete manual rows |
| `/reports` | `ReportsPage` | 5 report tabs |
| `/settings` | `SettingsPage` | users, change password, backup export/import |

**Routing invariant (wouter + regexparam)**: `<Route path="/">` compiles to
`/^\/?$/` — **exact match only**, it does not prefix-match subpaths. The
authenticated shell is therefore wrapped in a **pathless fallback**
`<Route>` (matches everything) with `<Route path="/login">` declared before
it. Do **not** write `<Route path="/">` expecting it to catch nested routes —
that renders a blank page for every non-`/` URL with no console error.

## Auth context

- `AuthProvider` (React context): `{user, loading, login, logout, refresh}`.
- Session = JWT in `localStorage` (`tl_token`) + user snapshot (`tl_user`).
- On boot: if a token exists, `GET /auth/me` refreshes the user; failure
  clears the session.
- `api.ts` attaches `Authorization: Bearer <token>`; on **401** it clears the
  session and redirects to `/login`.

## API client

- `api.ts` wraps `fetch` with JSON handling and a typed method per endpoint
  (login, me, changePassword, users CRUD, scouts/leaders CRUD + ledger +
  convert, accounts, ledger, events + finalize, dues full surface, import,
  reports, backup export/import, dashboard).
- Errors: non-2xx throws with the API's `{error}` message when present.
- Money: API speaks cents (`*_cents`); UI formats via `lib/money.ts`
  (USD, tabular numerals).

## Design system (Trailhead Ledger)

- **Fonts**: Bricolage Grotesque (display), Instrument Sans (body),
  IBM Plex Mono (all dollar figures — `font-mono`, tabular).
- **Palette** (CSS custom properties in `styles.css`, Tailwind v4 `@theme`):
  `canvas` (#f4f3eb), `surface` (#fcfbf6), `ink` (#1f2a22), `ink-soft`,
  `muted`, `pine` (#2e5339, primary), `pine-deep`, `pine-soft`, `moss`
  (#5b7b4e), `moss-soft`, `ember` (#c2542b, destructive), `ember-soft`,
  `gold` (#a97f1f), `gold-soft`, `line` (#d9d4c2), `line-soft`.
- **Signature motif**: topographic-contour texture as the background.
- **Motion**: `rise` (card entrance), `fadein`, `contour` (background)
  keyframes; reduced-motion respected.
- **UI primitives** (`components/ui/`): CVA-variant `Button`, `Card`,
  `Dialog` (flat props: `open`, `onClose`, `title`, `description`, `size`;
  exports `DialogFooter`, `CancelButton`), `Table`, `Toast` (provider +
  `useToast`), `ConfirmDialog`, `Input`, `Select`, `Switch`, `Badge`,
  `StatCard`, `Spinner`, `EmptyState`, `PageHeader`.

## Conventions

- Server state is **always** react-query (no manual fetch in components).
- Mutations invalidate the affected queries (`queryClient.invalidateQueries`).
- Money displays use `lib/money.ts` (never ad-hoc `toFixed`).
- Destructive actions go through `ConfirmDialog`.
- All pages are wrapped in `AppShell` (sidebar + top bar) except `/login`.

## Testing

- Build: `pnpm --filter @scout-expense-tracker/web build` (tsc + vite) passes.
- Manual: login → dashboard renders totals; each nav page loads without
  console errors; logout returns to `/login`.
- 401 handling: deleting the stored token + hitting a protected route
  redirects to `/login`.
- Routing: direct load of `/scouts/uuid` renders ScoutDetailPage (not blank).
- Money: a $1,234.56 balance renders as `$1,234.56` in mono font.

## Acceptance Criteria

- [ ] All 14 routes resolve to the correct page, including deep links.
- [ ] Auth gates every page; 401 anywhere returns to login.
- [ ] Every page's data comes from react-query; mutations invalidate.
- [ ] The design system tokens and fonts render consistently (no raw hex in
      components).
- [ ] Destructive actions are confirmed; money is always formatted via
      `lib/money.ts`.

## Open Questions

None.
