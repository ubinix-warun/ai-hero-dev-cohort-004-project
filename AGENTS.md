# Cadence — course platform

Cadence is a mini-Udemy: a server-rendered course platform where students
enroll in courses, watch video lessons, take quizzes, and leave reviews — and
where instructors and admins manage content.

**Stack:** React Router v7 (SSR) · TypeScript 5.9 · Tailwind CSS 4 + shadcn/ui ·
Drizzle ORM over SQLite (`better-sqlite3`) · Vitest · Vite 7.

## Package manager

This project uses **pnpm** (v9, pinned in `packageManager`). Install with
`pnpm install`. Enable via `corepack enable` if `pnpm` isn't on your PATH.

## Essential commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server at `http://localhost:5173` |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build (`react-router-serve`) |
| `pnpm typecheck` | `react-router typegen` **then** `tsc` (new routes need typegen) |
| `pnpm test` | Run tests (Vitest, single run) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Wipe + seed (`scripts/seed.ts`) |
| `pnpm db:generate` | Generate a new migration from schema changes |

After changing `app/db/schema.ts`, run `db:generate` then `db:migrate`.

## Rules that affect every task

- **Auth is dev-mode cookie sessions, not real auth.** `app/lib/session.ts`
  stores `userId` in a signed cookie (`cadence-dev-secret`). There are no
  passwords — switch users via the `api/switch-user` endpoint or the DevUI
  panel. Treat `getCurrentUserId(request)` as the only identity check.
- **Service files and `~/db` are server-only.** Never import from
  `app/services/*` or `app/db` into a client component. Use them only inside
  route `loader`/`action` functions. (The `.server.ts` / `.server.tsx` suffix is
  used selectively on ambiguous lib files — see `country.server.ts`,
  `markdown.server.ts` — but the service/db server-only rule is positional, not
  suffix-based.)
- **New route? Run `react-router typegen`.** Every route imports its types from
  `./+types/<route-name>` (e.g. `import type { Route } from
  "./+types/courses.$slug"`). These types don't exist until typegen has run, and
  `pnpm typecheck` will fail without them.
- **Enums and timestamps are stored as text.** `UserRole`, `CourseStatus`, etc.
  live in `app/db/schema.ts` as TS objects and persist as `text` columns. All
  timestamps are ISO-8601 strings (`new Date().toISOString()`), NOT epoch
  integers.

## What goes where

Detailed conventions live in `docs/` — read the one that matches your task:

- [`docs/architecture.md`](docs/architecture.md) — app layout, route table, data
  model, the loader/action/component contract.
- [`docs/database.md`](docs/database.md) — Drizzle + `better-sqlite3` setup, the
  shared `db` instance, migration workflow, schema conventions.
- [`docs/testing.md`](docs/testing.md) — the in-memory SQLite + `vi.mock("~/db")`
  test harness, `createTestDb` / `seedBaseData`, the service-import-after-mock
  ordering rule.
- [`docs/conventions.md`](docs/conventions.md) — validation helpers, error
  handling, Prettier + formatting utils, PPP/country pricing, server-side
  Markdown rendering, UI conventions (`cn`, CVA).
