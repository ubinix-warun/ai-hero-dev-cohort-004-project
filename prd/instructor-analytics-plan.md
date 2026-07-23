# Instructor Analytics — Implementation Plan

Multi-phase build of the per-course **Analytics** tab described in
[`instructor-analytics-prd.md`](./instructor-analytics-prd.md). Every phase is
grounded in the conventions of the existing Cadence codebase (React Router v7,
Drizzle + better-sqlite3, Tailwind/shadcn, vitest).

---

## Codebase conventions this plan follows

| Concern | Convention (verified in code) | Where |
|---|---|---|
| **Schema columns** | snake_case (`price_paid`, `completed_at`, `position_seconds`, `duration_minutes`, `video_url`) | `app/db/schema.ts` |
| **Drizzle tables** | camelCase JS refs: `purchases`, `enrollments`, `lessonProgress`, `videoWatchEvents`, `courseReviews`, `lessons`, `modules`, `courses` | `app/db/schema.ts` |
| **Service style** | `app/services/*.ts`, named exports, positional params, `import { db } from "~/db"`, Drizzle builder (`sql<number>\`count(*)\``, `eq`, `and`, `avg`, `count`) | `enrollmentService.ts`, `reviewService.ts` |
| **Test scaffold** | `createTestDb()` + `seedBaseData(testDb)` from `~/test/setup`; `vi.mock("~/db", () => ({ get db() { return testDb; } }))` **before** the service import; `beforeEach` recreates the db; test file lives next to the service as `*.test.ts` | `enrollmentService.test.ts`, `app/test/setup.ts` |
| **Auth gating** | `getCurrentUserId(request)` → `getUserById` → role check (`Instructor`/`Admin`) → ownership check (`course.instructorId === userId \|\| role === Admin`); reject with `data(msg, { status })` | `instructor.$courseId.tsx` loader |
| **Resource route** | action-only / loader-only route, `parseJsonBody`/`parseFormData` + zod, returns `json(...)` or `throw data(...)` | `api.video-tracking.ts`, `app/lib/validation.ts` |
| **UI** | shadcn primitives in `app/components/ui/` (tabs, card, skeleton, button, input, select); `formatPrice` in `~/lib/utils` | `app/components/ui/`, `app/lib/utils.ts` |
| **Editor tabs** | shadcn `Tabs` w/ `defaultValue`; existing values: `content`, `settings`, `sales-copy`, `students` | `instructor.$courseId.tsx:1178` |

### Key schema facts that affect the metrics

- **No `video_duration_seconds` column.** `lessons` has `durationMinutes` (int, minutes) and `videoUrl`. Video engagement must compute
  `durationSeconds = durationMinutes * 60`. Lessons where `videoUrl` is null are excluded ("lessons without video").
- **Free course** = `courses.price === 0` (price stored in cents).
- **Completion** uses `enrollments.completedAt IS NOT NULL` (binary course-level).
- **Drop-off** uses `lesson_progress.status = 'completed'` (the `LessonProgressStatus.Completed` enum), ordered by `modules.position` then `lessons.position`.
- **Reviews** (`course_reviews`) only store `rating` (int) — no text column, matching the PRD's rating-only satisfaction metric.

---

## Phase 0 — Dependency + shared type

**Goal:** Install the one new runtime dependency and define the payload contract
shared by the service, endpoint, and UI.

**Steps**
1. Install Recharts: `pnpm add recharts`. (Not in `package.json` today; it's the only new dependency. The PRD's chart types — composed area+line, vertical bar, bar — are all covered.)
2. Create `app/types/analytics.ts` exporting the `CourseAnalytics` type exactly as
   specified in the PRD (the service, the endpoint, and the tab all import this
   single source of truth):

```ts
// app/types/analytics.ts
export type TrendPoint = { week: string; value: number };

export type CourseAnalytics = {
  revenue: { currency: "USD"; totalCents: number; points: TrendPoint[] };
  enrollments: { total: number; points: TrendPoint[] };
  isFreeCourse: boolean;
  completion: { finished: number; enrolled: number; ratePct: number };
  dropoff: Array<{
    lessonId: number; lessonTitle: string;
    reached: number; completed: number; stepRatePct: number;
  }>;
  videoEngagement: Array<{
    lessonId: number; lessonTitle: string; avgWatchDepthPct: number;
  }>;
  satisfaction: {
    average: number; count: number;
    distribution: Array<{ stars: number; count: number }>;
  };
};
```

**Acceptance:** `pnpm add` succeeds; type file compiles; no other code changed.

---

## Phase 1 — Analytics service + tests  ⭐ (the test seam)

**Goal:** Implement all five metrics as pure, testable functions. This is the
PRD's sole meaningful test seam, so it's built first and tested thoroughly.

**Files**
- Create `app/services/analyticsService.ts`
- Create `app/services/analyticsService.test.ts`

**Service API** (one function per metric group, positional params, returns/uses
`CourseAnalytics`):

| Function | Returns | Notes |
|---|---|---|
| `getCourseAnalytics(courseId, range?)` | `CourseAnalytics` | Orchestrator; calls the five below. `range` = `7d`/`30d`/`90d`/`all` (default `90d`). |
| `getRevenue(courseId, range)` | `revenue` + `isFreeCourse` | `SUM(price_paid)` weekly via `GROUP BY` strftime week; overlay enrollment count by week. |
| `getEnrollments(courseId, range)` | `enrollments` | `COUNT(*)` of enrollments by week. |
| `getCompletion(courseId)` | `completion` | `COUNT WHERE completedAt IS NOT NULL / COUNT(*) × 100`. |
| `getDropoff(courseId)` | `dropoff` | Step-over-step; Lesson 1 denominator = total enrolled, later lessons = prior lesson completed count; attach `reached`/`completed`. |
| `getVideoEngagement(courseId)` | `videoEngagement` | Per student `MAX(position_seconds)`, divide by `duration_minutes*60`, average across students; exclude lessons with no `video_url`. |
| `getSatisfaction(courseId)` | `satisfaction` | `AVG(rating)`, `COUNT`, and 1–5 star distribution. |

**Implementation notes**
- All aggregations use Drizzle's SQL builder + `GROUP BY` (e.g. `sql<number>\`count(*)\``, `avg(courseReviews.rating)`), matching `reviewService.ts`/`progressService.ts`.
- Weekly bucketing: `strftime('%Y-W%w', ...)` over `created_at` (timestamps are ISO strings, which SQLite sorts lexicographically — fine for week grouping).
- `isFreeCourse` derived from `courses.price === 0` (read once in the orchestrator).
- Guard every ratio against divide-by-zero → return `0`, never `NaN`.

**Test matrix** (`analyticsService.test.ts`, scaffold per the convention above)
For each metric assert the **returned values** against hand-computed seeded data:
1. **Zero/no-data** — brand-new course: revenue `0`/empty points, completion `0/0 → ratePct 0` (no NaN), empty dropoff/video/satisfaction (`average 0`, `count 0`, empty distribution).
2. **Happy path** — single course with known purchases, enrollments, lesson_progress,
   video_watch_events, course_reviews; assert each aggregate matches the hand-computed number.
3. **Edge cases** — free course (`price = 0`) → `isFreeCourse true`; course with
   enrollments but no reviews → satisfaction `count 0`; lesson with no `video_url`
   → excluded from video engagement; a student with `completedAt set` → counted in
   completion; a funnel "cliff" lesson → correct step-over-step denominator + N-of-M.
4. **Drop-off specifically** — Lesson 1 denominator = total enrolled; Lesson N
   denominator = Lesson N-1 completed count; `reached`/`completed` annotations correct.

**Acceptance:** `pnpm test` green for the new file; all five metrics covered across
zero/happy/edge cases; no Drizzle operators mocked.

---

## Phase 2 — Resource endpoint (auth-gated, read-only)

**Goal:** A thin, read-only endpoint that returns the `CourseAnalytics` payload,
gated by the same ownership check as the editor. The editor loader stays
**untouched** (lazy loading, per PRD).

**File:** create `app/routes/api.analytics.$courseId.ts` (loader-only resource route).

**Behavior**
- `loader({ params, request })`:
  1. `getCurrentUserId(request)` → 401 if missing.
  2. `getUserById` → 403 unless `Instructor`/`Admin`.
  3. Parse `courseId` (number) → 400 if invalid.
  4. Load course; 404 if missing; 403 if `instructorId !== userId && role !== Admin`.
  5. Read optional `?range=` query param (validate against `7d`/`30d`/`90d`/`all`).
  6. Return `json(await getCourseAnalytics(courseId, range))`.
- No `action`, no `meta`, no default export — pure resource route (matches the
  `api.video-tracking.ts` pattern, but loader/GET instead of action/POST).

**Acceptance:** `GET /api/analytics/:courseId` returns the payload for the owner;
non-owner / student / unauthenticated get 401 or 403; invalid id gets 400.

---

## Phase 3 — Analytics tab shell: lazy fetch, skeleton, session cache, empty gate

**Goal:** Add the Analytics tab to the editor and wire the lazy client-side
data flow. No charts yet — just fetch, cache, skeleton, and the global empty gate.

**Files**
- Create `app/components/analytics/AnalyticsTab.tsx` (client component — `"use client"`).
- Edit `app/routes/instructor.$courseId.tsx` to add the tab.

**`AnalyticsTab.tsx`**
- On mount (first activation), show a `Skeleton` loader (use `~/components/ui/skeleton`,
  matching the PRD's "skeleton while it loads"), then `fetch('/api/analytics/:courseId')`.
- **Session cache:** module-scoped `Map<courseId, CourseAnalytics>` so revisits are
  instant (the tab content is hidden, not unmounted, by Radix — but the cache also
  covers a full remount). Fetch only on a cache miss.
- **Global empty gate:** if `enrollments.total === 0`, render a single full-tab
  "No student data yet" message with a CTA (copy course link) and **no charts**.
- Once data exists, render the KPI row + chart sections (Phase 4 fills these).
- Never imports services or `~/db` — reads only from the fetched payload.

**Editor edits** (`instructor.$courseId.tsx`)
- Add `<TabsTrigger value="analytics">…Analytics</TabsTrigger>` alongside Content /
  Settings / Sales Copy / Students (PRD's "Content | Students | Analytics" mental
  model; preserve the existing Settings & Sales Copy tabs).
- Add `<TabsContent value="analytics">` rendering `<AnalyticsTab courseId={course.id} isFreeCourse={course.price === 0} />`.
- **Do not** add analytics data to the loader — it still returns only
  `{ course, lessonCount, enrollmentCount, students, quizCount }`.

**Acceptance:** Clicking Analytics shows a skeleton then the content; clicking away
and back is instant (no refetch); a zero-enrollment course shows only the "No
student data yet" gate; editor loader/action unchanged.

---

## Phase 4 — Charts + KPI components (Recharts)

**Goal:** Build the visual layer that consumes the `CourseAnalytics` payload.

**Files** — all client components under `app/components/analytics/`:
- `KpiRow.tsx` — 3 primary hero cards (Revenue, Enrollments, Completion Rate) +
  2 secondary muted cards (Avg Rating, Avg Watch Depth). Primary cards show the
  number + selected time range. Revenue uses `formatPrice`.
- `TimeRangePicker.tsx` — preset chips `7d / 30d / 90d / all-time`, default `90d`,
  shared by every trend chart (lift range state into `AnalyticsTab`, pass down).
- `RevenueChart.tsx` — composed area+line dual-axis (revenue + enrollment overlay).
  For free courses (`isFreeCourse`), render enrollment-only with a "Free course" badge.
- `DropoffChart.tsx` — vertical `BarChart` (`layout="vertical"`), step-over-step,
  annotated with "N of M" counts.
- `VideoEngagementChart.tsx` — bar chart of avg watch depth % per lesson.
- `SatisfactionCard.tsx` — average rating, review count, 1–5 star distribution.

**Rules**
- Components read only from props (the `CourseAnalytics` slice for their metric) —
  never import services/`~/db`.
- Recharts `ResponsiveContainer` for sizing; Tailwind for layout/colors.

**Acceptance:** With seeded data, each chart renders correctly; free course flips
the revenue chart to enrollment-only with the badge; switching the range picker
refetches and all trend charts update in sync.

---

## Phase 5 — Empty/zero states, wiring & polish

**Goal:** Per-section zero states, final integration, and verification.

**Steps**
1. **Per-section zero states** (only reached when `enrollments.total > 0`):
   - Satisfaction: if `satisfaction.count === 0`, show "No reviews yet" in place of
     the chart.
   - Video engagement: if all lessons lack video, show an inline message.
   - Each section handles its own partial-zero case (PRD §Empty & zero states).
2. **Empty gate CTA:** wire "copy course link" to copy the public URL
   (`/courses/:slug`) with a `toast` confirmation (sonner, as used elsewhere).
3. **Range state:** ensure `TimeRangePicker` state lives in `AnalyticsTab` and a
   range change triggers a refetch (pass range into the fetch URL `?range=`) and
   re-renders Revenue/Enrollment charts; completion/dropoff/video/satisfaction
   remain all-time snapshots (ignore range).
4. **Verification:**
   - `pnpm test` — full suite green (Phase 1 tests + unchanged prior tests).
   - `pnpm typecheck` — clean (confirms the service/endpoint/UI types line up).
   - Manual: open a course as its owner → Analytics tab works; as a different
     instructor / student → endpoint denies (403); brand-new course → "No student
     data yet".

**Acceptance:** All user stories from the PRD are satisfied end-to-end; no schema
changes; no new tables or migrations; editor performance unaffected.

---

## Out of scope (per PRD, intentionally deferred)

Aggregate all-courses dashboard (#94), quiz pass rate / at-risk table (#93),
coupon/PPP funnel, custom date ranges, real-time updates, CSV/PDF export,
average-student-progress completion metric, and route/HTTP-level testing.

---

## Suggested phase order & checkpoints

| Phase | Deliverable | Checkpoint |
|---|---|---|
| 0 | Recharts + `CourseAnalytics` type | `pnpm add` + typecheck clean |
| 1 | `analyticsService.ts` + tests | `pnpm test` green (core logic done) |
| 2 | `api.analytics.$courseId.ts` endpoint | owner gets payload; others 401/403 |
| 3 | `AnalyticsTab` shell + editor tab | lazy fetch, skeleton, cache, empty gate |
| 4 | Charts + KPI components | visuals render; range picker syncs |
| 5 | Zero states + polish + verify | full `pnpm test` + `pnpm typecheck` + manual |

Phases 1 and 2 are independent of 3–5 and can be built/tested before any UI exists.
