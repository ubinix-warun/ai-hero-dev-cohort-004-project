# Architecture

Cadence is a server-rendered React Router app. Data flows: **route loader →
service → database**. Mutations flow: **form/action → service → database**.

## Layout

```
app/
  root.tsx              # <html>, dark-mode script, global ErrorBoundary,
                        #   NavigationLoadingBar, <Outlet/>
  routes.ts             # route table (flat file, not folders)
  routes/               # one file per route; "." in filename = URL "/"
    layout.app.tsx      # authenticated app shell (Sidebar + DevUI + <Outlet/>)
    courses.$slug.tsx   # example feature route (loader + action + component)
    api.switch-user.ts  # action-only "backend" routes live here too
  components/
    ui/                 # shadcn/ui primitives (button, card, tabs, …)
    star-rating.tsx     # feature components (app-specific)
  lib/
    session.ts          # cookie auth (server-only)
    validation.ts       # parseFormData / parseParams / parseJsonBody
    utils.ts            # cn, formatPrice (cents), formatDuration
    markdown.server.ts  # marked + shiki → rendered HTML (server-only)
    country.server.ts   # country resolution (server-only)
    ppp.ts              # purchasing-power-parity pricing tiers (server-only)
  services/             # per-domain data-access functions (server-only)
  db/
    schema.ts           # Drizzle schema (tables + exported TS enums)
    index.ts            # shared better-sqlite3 / drizzle instance
  test/setup.ts         # createTestDb + seedBaseData for tests
docs/                   # this folder
scripts/                # seed.ts and ad-hoc admin scripts
drizzle/                # generated migrations + snapshots + journal
```

Convention: feature routes live directly under `app/routes/` (no per-feature
folders). Action-only API routes are named `api.<thing>.ts`.

## Route contract

Every page route that fetches data follows this shape (see
`routes/courses.$slug.tsx` for a full example):

```tsx
import type { Route } from "./+types/courses.$slug";

export function meta({ data }: Route.MetaArgs) { /* ... */ }

export async function loader({ params, request }: Route.LoaderArgs) {
  // resolve params, call services, return a plain object
}

export async function action({ request, params }: Route.ActionArgs) {
  // validate, call a service, return data() or throw data("msg", { status })
}

export function HydrateFallback() { /* skeletons while JS loads (SSR) */ }

export default function Page({ loaderData }: Route.ComponentProps) {
  // render; only client-component hooks here
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // use isRouteErrorResponse(error) to branch on status
}
```

- Loader data arrives as the `loaderData` prop. There is **no** `useLoaderData`
  call — it's injected.
- Use `data(value, { status })` from `react-router` to return/throw typed
  responses (paired with `isRouteErrorResponse` in the ErrorBoundary).
- `meta` is defined per route and receives the loader data.

## Data model (Drizzle, SQLite)

Defined in `app/db/schema.ts`. Tables:

| Table | Purpose |
| --- | --- |
| `users` | students, instructors, admins (`role` = `UserRole`) |
| `categories` | course categories |
| `courses` | owned by an instructor, in a category, has `status` + `price` (cents) |
| `modules` | ordered sections of a course |
| `lessons` | ordered content within a module (markdown `content`, optional video URL) |
| `enrollments` | user ↔ course (with optional `completedAt`) |
| `lesson_progress` | per-user, per-lesson completion status |
| `quizzes` / `quiz_questions` / `quiz_options` / `quiz_attempts` / `quiz_answers` | quizzes and attempts |
| `purchases` | payment records (with PPP `country`) |
| `teams` / `team_members` | team purchasing |
| `coupons` | redeemable team-enrollment codes |
| `video_watch_events` | play/pause/seek/ended tracking |
| `lesson_comments` | discussion on a lesson |
| `course_reviews` | 1–5 star ratings |

All primary keys are auto-increment integers (`integer().primaryKey({
autoIncrement: true })`). Foreign keys use `.references()`. Boolean columns use
`integer(..., { mode: "boolean" })`. Enum columns use `text(...).$type<T>()`
paired with the TS enum objects exported from the schema. Timestamps are ISO
text via `$defaultFn(() => new Date().toISOString())`.

## Services

Each domain has a file in `app/services/` (`courseService.ts`,
`enrollmentService.ts`, `reviewService.ts`, …). Conventions:

- Plain exported **functions**, no classes.
- Each service imports the shared `db` from `~/db` (this is why tests mock
  `~/db` — see `docs/testing.md`).
- Reads return rows or `undefined`; `.all()` for lists. Mutations return the
  created/updated row via `.returning().get()`.
- Domain errors are thrown as `new Error("...")` from the service and surfaced by
  the route's `data(..., { status })`.

## Auth model

Not a real login system. `app/lib/session.ts`:
- `getCurrentUserId(request)` reads `userId` from the `cadence_session` cookie.
- `setCurrentUserId(request, userId)` commits a new cookie — returned as a
  `Set-Cookie` header on a `redirect(...)`.
- `getDevCountry` / `setDevCountry` let you override PPP country per session.

The DevUI panel (bottom-right) and `POST api/switch-user` let you flip between
seeded users. There is no password, no signup security, and the cookie secret
is a hardcoded dev value.

## Server-only vs client

Anything under `app/services/`, `app/db/`, and `app/lib/` files carrying
`.server` (`country.server.ts`, `markdown.server.ts`) run only on the server.
`validation.ts`, `utils.ts`, and `ppp.ts` are environment-agnostic and safe to
import anywhere. When in doubt: **only import services/db from inside a
`loader`/`action`**. Components in `app/components/` are client components and
must not touch the database directly.

## Styling

Tailwind CSS v4 (configured via `@tailwindcss/vite`, no `tailwind.config` file;
theme lives in `app/app.css`), shadcn/ui `new-york` style, classVarianceAuthority
for component variants, `cn()` (clsx + tailwind-merge) for conditional classes.
Icons are `lucide-react`. Markdown content renders with Tailwind Typography
(`prose`) after server-side rendering with Shiki syntax highlighting.
