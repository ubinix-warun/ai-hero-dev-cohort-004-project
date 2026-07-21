# Database

SQLite via `better-sqlite3`, modelled with Drizzle ORM.

## The shared connection

`app/db/index.ts` is the **single** database instance used at runtime:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
```

- Database lives in the repo root as `data.db` (gitignored, along with its
  `-wal`/`-shm` siblings).
- WAL mode + `foreign_keys = ON` are set **both** here and in the test setup —
  keeping them in sync matters because the test DB is a separate connection.

Every service imports `db` from `~/db`. This shared-singleton design is what lets
tests swap in an in-memory database by mocking the module (see
`docs/testing.md`).

## Schema source of truth

All tables and enums live in `app/db/schema.ts`. The Drizzle config
(`drizzle.config.ts`) points at this file and emits migrations to `drizzle/`:

```ts
export default defineConfig({
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: "./data.db" },
});
```

## Schema conventions

| Concern | Convention | Example |
| --- | --- | --- |
| Primary key | auto-increment integer | `id: integer("id").primaryKey({ autoIncrement: true })` |
| Enum column | `text(...).$type<T>()` + TS enum object | `role: text("role").notNull().$type<UserRole>()` |
| Boolean column | `integer(..., { mode: "boolean" })` | `pppEnabled: integer("ppp_enabled", { mode: "boolean" }).notNull().default(true)` |
| Timestamp | ISO text, defaulting to now | `createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString())` |
| Foreign key | `.references(() => table.id)` | `instructorId: integer("instructor_id").notNull().references(() => users.id)` |
| Nullable | type union, no `.notNull()` | `completedAt: text("completed_at")` |

**Do not** use epoch integers or SQLite `datetime` defaults for new columns —
match the existing `text` + ISO-string pattern. TypeScript enums (e.g.
`UserRole`, `CourseStatus`, `LessonProgressStatus`, `QuestionType`,
`TeamMemberRole`) are exported from `app/db/schema.ts` and reused both in schema
definitions and throughout the app.

Price columns are in **cents** (`price: integer("price")`), rendered by
`formatPrice` in `~/lib/utils` (0 → "Free").

## Migrations workflow

After editing `app/db/schema.ts`:

1. `pnpm db:generate` — writes a new `<name>.sql` migration under `drizzle/`
   plus a snapshot in `drizzle/meta/`.
2. `pnpm db:migrate` — applies pending migrations to `data.db`.

Both files are committed. Never hand-edit generated migrations.

If you need a clean slate: `pnpm db:seed` drops every table (plus
`__drizzle_migrations`), recreates them via `migrate()`, and re-inserts fixture
data from `scripts/seed.ts`. Seeding is destructive — it exists to make the dev
DB reproducible for the cohort, not as a migration tool.

## Schema gotchas

- `better-sqlite3` is a **native** module and is listed under
  `onlyBuiltDependencies` in `pnpm-workspace.yaml` — it is rebuilt, not
  downloaded prebuilt. If you see `NODE_MODULE_VERSION` mismatch errors after a
  Node upgrade, the build DB is stale; delete the build (`pnpm rebuild
  better-sqlite3`) rather than hand-editing the schema.
- No ORM-level cascade: orphan cleanup is done in services (e.g. seeding drops
  tables in dependency order).
- Booleans round-trip as `0`/`1` over the driver, but Drizzle presents/accepts
  JS `boolean`s — use JS `boolean`s in app code, never `0`/`1` literals.
