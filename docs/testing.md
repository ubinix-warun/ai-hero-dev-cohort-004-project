# Testing

Tests run on **real SQLite in memory** with the same Drizzle migrations as the
production database. See `app/services/enrollmentService.test.ts` for the
canonical example of the full pattern.

## Setup helpers — `app/test/setup.ts`

```ts
import { createTestDb, seedBaseData } from "~/test/setup";
```

- `createTestDb()` opens a fresh `:memory:` SQLite connection, applies all
  migrations from `drizzle/` (same folder as production), and returns a Drizzle
  instance. Each call is **isolated** — no shared state between tests.
- `seedBaseData(testDb)` inserts a minimal fixture set (a student user, an
  instructor user, a category, a published course) and returns their rows. Most
  tests start from this and add only what the case needs.

## The module-mock pattern (this is the part to get right)

Services call `db` by importing it from `~/db`. To make them use your test
database instead, you **mock the entire `~/db` module** with a getter:

```ts
let testDb = createTestDb();
let base = seedBaseData(testDb);

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// IMPORT services AFTER the mock so they capture the mocked db
import { enrollUser, ... } from "./enrollmentService";
```

Rules:

1. `vi.mock(...)` must come **before** the service `import`. ES module imports
   are hoisted, but Vitest replaces the module before the imported bindings are
   resolved as long as the `vi.mock` call textually precedes the dynamic-ish
   import in the file. The convention here is to put all service imports after
   the mock (use static `import ... from` at the bottom, or dynamic `await
   import()`). Following the existing tests avoids subtle ordering bugs.
2. Use a **getter** (`get db() { return testDb; }`) so that when `beforeEach`
   reassigns `testDb`, every service sees the new instance automatically.
3. Create the db **inside** `beforeEach` (not at module top level) so each test
   starts clean.

Full scaffold:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import { enrollUser, unenrollUser, findEnrollment } from "./serviceName";

describe("serviceName", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  it("does the thing", () => {
    const enrollment = enrollUser(base.user.id, base.course.id, false, false);
    expect(enrollment.userId).toBe(base.user.id);
  });
});
```

## Config

`vitest.config.ts` enables `globals: true` (so `describe`/`it`/`expect` are
global — no imports needed) and wires `vite-tsconfig-paths` so `~/...` aliases
resolve. Tests usually live next to their module (`x.test.ts`).

## Notes

- Because the migrations run in the test DB, your service tests exercise the
  **actual schema**, not a faked one — foreign keys, defaults, and `notNull`
  constraints all apply. Service-level `throw` checks and the DB's own
  constraints are both relied on; the existing tests document which layer
  enforces each rule (see the `skipValidation` cases in
  `enrollmentService.test.ts`).
- Don't mock Drizzle operators (`eq`, `and`, `sql`) — they're pure functions,
  import them normally and assert on results.
- There's no HTTP/route layer testing in this repo today; Vitest covers pure
  service logic. If you add route tests you'll need a React Router request
  harness — prefer extending service tests first.
