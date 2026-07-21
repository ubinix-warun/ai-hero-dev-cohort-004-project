# Backend Standards

Rules for `app/services/`, `app/db/`, `app/lib/`, and any code that runs in
loaders/actions. Data flow: **loader/action → service → database**.

## Object parameters

Functions with ≥2 params of the same type MUST use an object parameter.

```ts
// BAD
const findEnrollment = (userId: number, courseId: number) => {};
const markLessonComplete = (userId: number, lessonId: number) => {};

// GOOD
const findEnrollment = (opts: { userId: number; courseId: number }) => {};
const markLessonComplete = (opts: { userId: number; lessonId: number }) => {};
```

Canonical reference implementation: `app/services/bookmarkService.ts` (uses
`opts:` throughout).

### Known offenders to convert

- `lib/utils.ts` — `formatDuration(minutes, showHours, showSeconds, padZeros)` (4 booleans, 6 callsites)
- `services/progressService.ts` — `calculateProgress(userId, courseId, includeQuizzes, weightByDuration)`
- `lib/ppp.ts` — `checkPppAccess(coursePrice, coursePppEnabled, purchaseCountry, currentCountry)` (2 `string|null`)
- `enrollmentService.ts` — `findEnrollment`, `isUserEnrolled`, `enrollUser`, `unenrollUser`, `markEnrollmentComplete`
- `progressService.ts` — `getLessonProgress`, `getLessonProgressForCourse`, `markLessonComplete`, `markLessonInProgress`, `resetLessonProgress`, `getCompletedLessonCount`, `isLessonCompleted`, `getNextIncompleteLesson`
- `videoTrackingService.ts` — `logWatchEvent`, `getWatchEvents`, `getLastWatchEvent`, `getWatchEventCount`, `getMaxWatchPosition`, `hasUserWatchedVideo`, `deleteWatchEvents`, `calculateWatchProgress`, `hasUserCompletedVideo`
- `quizService.ts` — `recordAttempt`, `recordAnswer`, `getBestAttempt`, `getLatestAttempt`, `getAttemptsByUser`
- `lessonService.ts` — `swapLessonPositions`, `moveLessonToModule`
- `moduleService.ts` — `moveModuleToPosition`, `swapModulePositions`
- `couponService.ts` — `generateCoupons`, `getCouponsForTeam`
- `reviewService.ts` — `createOrUpdateReview`, `getUserReviewForCourse`
- `purchaseService.ts` — `createTeamPurchase`
- `services/quizScoringService.ts` — `renderQuizResults(score, total, passed, showAnswers, showExplanations)` (5 params, all `any`)

## Types

Prefer existing types over introducing new ad-hoc shapes. There is **no shared
`types/` directory** — types live where they're used.

- **Drizzle-inferred types**: `typeof table.$inferSelect` / `$inferInsert` from
  table definitions in `app/db/schema.ts`.
- **TS enums** (`app/db/schema.ts`): `UserRole`, `CourseStatus`,
  `LessonProgressStatus`, `QuestionType`, `TeamMemberRole`.
- **Result types**: `ParseSuccess<T>` / `ParseFailure` / `ParseResult<T>` in
  `app/lib/validation.ts`.
- **Service result unions**: `RedeemResult` in `app/services/couponService.ts`,
  `CommentWithAuthor` in `app/services/lessonCommentService.ts`.
- **Per-route Zod schemas** in `routes/` — many as discriminated unions
  (`courseEditorActionSchema`, `purchaseActionSchema`, `quizActionSchema`).

### Avoid `any`

`services/quizScoringService.ts` is the main offender — strong refactor target.
If a function needs a type that doesn't exist yet, add it to the relevant
schema file or extract it alongside the closest related type rather than
creating a standalone file.

### Enum naming inconsistency

- `LessonProgressStatus`, `QuestionType` → **snake_case** string values
  (`"not_started"`, `"multiple_choice"`) — persisted in SQLite `text` columns.
- `UserRole`, `CourseStatus`, `TeamMemberRole` → **PascalCase** string values
  matching member names. DB columns are snake_case; JS fields are camelCase.

## Error handling

The codebase follows **"services throw, routes throw `data(...)`, ErrorBoundary
catches"** — documented in `docs/conventions.md`.

### Mandatory patterns

- **Always wrap `JSON.parse` in try/catch.** Unwrapped calls at
  `routes/instructor.$courseId.tsx:307` and `:318` crash on malformed input —
  the Zod schema only validates `.string().min(1)`, not valid JSON.
  Safe pattern is demonstrated in
  `routes/instructor.$courseId.lessons.$lessonId.quiz.tsx:223`.
- **Guard array destructuring of DB inserts.**
  `services/lessonCommentService.ts:81-85`:
  ```ts
  const [inserted] = db.insert(lessonComments).values({…}).returning().all();
  return inserted;  // undefined if insert produces no rows
  ```
  Check `.length` or throw before destructuring.
- **Never silently swallow errors.** `quizScoringService.ts` does
  `console.log(e); return …` — don't replicate. Service functions should either
  propagate errors to the route or return a discriminated union. Canonical
  pattern: `services/couponService.ts` (`RedeemResult`).

### Route loaders/actions

Generally assume happy paths — add try/catch where unhandled exceptions would
leave the user without feedback (e.g. invalid user input reaching a service
call), not as a blanket rule.

## Services conventions

- Each domain has a file in `app/services/` (plain exported functions, no classes).
- Read return rows or `undefined`; `.all()` for lists. Mutations return the
  created/updated row via `.returning().get()`.
- Domain errors thrown as `new Error("...")` — routes translate to
  `data(..., { status })`.
- Server-only: only import services/db from inside a `loader`/`action`.
  Components must not touch the database directly.

## Database conventions

- Schema in `app/db/schema.ts` — all PKs autoincrement integers, FKs use
  `.references()`, booleans use `integer(..., { mode: "boolean" })`, enums use
  `text(...).$type<T>()` paired with the TS enum objects, timestamps are ISO text.
- Migrations in `drizzle/`; run `pnpm reset <commit>` / `pnpm cherry-pick <commit>`
  to jump between lesson checkpoints (don't rewrite history on `live-run-through`).
