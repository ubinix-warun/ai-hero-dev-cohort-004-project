# Instructor Analytics — per-course analytics tab

## Problem Statement

Instructors on Cadence can see raw enrollment counts on their course list and a
per-student roster per course, but they have **no way to see how a course is
performing as a whole**. They cannot answer basic questions without manually
roster-checking each student: Is the course actually selling? Are students
finishing? Where exactly do they stop watching or stop completing lessons? The
existing course editor (`/instructor/:courseId`) is purely a content-management
surface and offers no performance signal at all.

Two earlier issues (#93, #94) explored analytics at the aggregate
all-courses level. This PRD covers the **per-course** view — the single-course
performance story — which is the prerequisite slice an instructor reaches for
first ("how is *this* course doing?").

## Solution

Add an **Analytics tab** to the existing per-course editor, alongside the
existing Content and Students sections. The tab surfaces five metrics computed
entirely from existing data, with a headline KPI row up top and detail charts
below:

1. **Revenue** (primary) with **enrollment** overlay — dual-axis trend over
   time. For free courses (`price = 0`), the chart auto-switches to
   enrollment-only with a clear "free course" label, so the page never shows
   an empty or all-zero chart.
2. **Course completion rate** — a single binary KPI: enrolled students whose
   `enrollment.completedAt` is not null, shown as "finished / enrolled
   (rate%)".
3. **Lesson drop-off funnel** — step-over-step: of the students who completed
   the prior lesson, what fraction completed *this* one. Annotated with
   absolute N-of-M counts so specific cliff lessons jump out.
4. **Video engagement** — average max watch depth per lesson
   (`MAX(positionSeconds)` of video watch events ÷ video duration), averaged
   across students.
5. **Learner satisfaction** — average rating, review count, and star
   distribution from course reviews.

All metrics come from existing tables. No schema changes.

## User Stories

1. As an instructor, I want an Analytics tab in my course editor, so that I can
   switch from editing content to inspecting performance without leaving the
   course.
2. As an instructor opening the Analytics tab, I want to see a headline row of
   the most important numbers (revenue, enrollments, completion rate) at a
   glance, so that I get an instant pulse check before reading any chart.
3. As an instructor, I want revenue and enrollment shown together over time,
   so that I can tell whether enrollment growth is actually converting into
   money.
4. As an instructor running a free course, I want the revenue chart to
   gracefully become an enrollment chart with a "free course" note, so that I
   don't stare at a meaningless all-zero money chart.
5. As an instructor, I want to pick a time window (7d / 30d / 90d / all) that
   applies to every trend chart on the tab, so that I can zoom in on a recent
   change or zoom out to the full history consistently.
6. As an instructor, I want to see a lesson-by-lesson drop-off funnel that
   compares each lesson against the one before it, so that I can pinpoint the
   exact lesson where students stop continuing.
7. As an instructor, I want each funnel step annotated with an absolute
   "N of M students" count, so that I can tell whether a drop is a real
   content problem or just a small-sample blip.
8. As an instructor, I want to see average video watch depth per lesson, so
   that I can tell whether a drop-off is because the lesson is hard or because
   the video loses people partway through.
9. As an instructor, I want to see my average rating, how many reviews it is
   based on, and the star distribution, so that I have an outcome metric to
   read alongside completion.
10. As an instructor with a brand-new course and no students, I want to see a
    single friendly "no student data yet" message with a way to share the
    course, instead of a broken-looking set of empty charts.
11. As an instructor whose course has enrollments but no reviews yet, I want
    the satisfaction area to say "no reviews yet" in place of the chart, so
    that a missing metric never looks like a bug.
12. As an instructor, I want the analytics data to load only when I click the
    Analytics tab (with a skeleton while it loads), so that editing content is
    not slowed by analytics queries I am not looking at.
13. As an instructor, I want the analytics data cached for my session once
    loaded, so that clicking back to the tab is instant.
14. As an instructor, I want my analytics tab to be inaccessible to anyone
    other than me (the course owner) or an admin, so that other instructors
    cannot see my revenue and student data.
15. As a student, I want any attempt to reach the instructor analytics surface
    to be denied, so that instructor business data stays private.

## Implementation Decisions

### Where the tab lives — navigation & routing

- The Analytics tab is added to the existing per-course editor route as a
  **top-level tab alongside Content and Students** (i.e. `Content | Students |
  Analytics`). It is **not** a separate route. This keeps all course-level
  surfaces grouped and matches the existing per-course tab mental model.
- Authorization reuses the existing per-course gating: the current user must
  have the Instructor or Admin role AND be the course's `instructorId`
  owner. Students and non-owner instructors are denied. This is identical to
  the ownership check already present on the course editor and student roster.

### Data loading — lazy, client-side, session-cached

- Analytics data is **fetched lazily on tab activation**, not in the page
  loader. The editor's existing loader is left untouched (it still loads
  modules/lessons/settings only), so editing performance is unaffected.
- On first tab click the client fires a request to a dedicated endpoint and
  renders a skeleton loader until the payload arrives. The result is cached
  for the session so revisits are instant.
- This requires one new **read-only endpoint** (action-only / resource-style
  route) that returns the analytics payload for a course, gated by the same
  ownership check. Existing analytics issues assumed an eager page loader;
  the lazy approach is a deliberate change to avoid running five aggregate
  queries on every editor visit.

### New service: course analytics

- A new service module (analytics service) encapsulates all five metrics,
  following the project convention of plain exported functions in
  `app/services/`, each importing the shared `db` from `~/db`.
- Aggregations use **Drizzle's SQL builder with `GROUP BY`** (e.g. weekly
  buckets for trends, per-lesson counts for the funnel, `MAX(positionSeconds)`
  for video depth). This fits the existing service/test convention and needs
  no new infrastructure; SQLite handles the scale.
- The service exposes a small set of functions, one per metric group, each
  taking the course id and (where relevant) the selected time range as
  positional params, following the project's positional-params convention.

The shape of the payload the endpoint returns (this is the contract between
the service, the endpoint, and the tab — included because it encodes the
decision more precisely than prose):

```ts
type CourseAnalytics = {
  revenue: { currency: "USD"; totalCents: number; points: TrendPoint[] };
  enrollments: { total: number; points: TrendPoint[] };
  isFreeCourse: boolean;                 // derived from course.price === 0
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

### Metric definitions (precise)

- **Revenue** = `SUM(purchases.pricePaid)` grouped by week. Stored/displayed
  in cents via `formatPrice`. The overlay is weekly enrollment count
  (`COUNT(enrollments)` by week). `isFreeCourse` (course price is 0) flips the
  chart to enrollment-only.
- **Completion rate** = `COUNT(enrollments WHERE completedAt IS NOT NULL) /
  COUNT(enrollments) × 100`. Binary course-level completion only — the
  average-progress-per-student definition is intentionally **not** used here;
  the drop-off funnel is the diagnostic that explains the completion number.
- **Drop-off** = step-over-step per lesson ordered by module/position:
  `stepRatePct = completedThisLesson / completedPreviousLesson × 100`, with
  `reached`/`completed` N-of-M counts attached. Lesson 1's denominator is
  total enrolled.
- **Video engagement** = per lesson, per student: `MAX(positionSeconds) of
  video_watch_events / lesson's video duration`; then averaged across
  students. Lessons without video are excluded. Max-position is chosen over
  playback-time accumulation because it is robust regardless of
  play/pause/seek event fidelity and is computable with a single `MAX`
  aggregation.
- **Satisfaction** = `AVG(rating)`, `COUNT(reviews)`, and a 1–5 star
  distribution from `courseReviews`.

### Time handling

- One shared **TimeRangePicker** component (a set of preset chips: 7d, 30d,
  90d, all-time) is reused by every trend chart on the tab so they stay in
  sync. Default window is **90 days** at **weekly** granularity. The selected
  range is passed to the revenue and enrollment queries; completion/drop-off/
  video/satisfaction are all-time snapshots and ignore the range.

### Charts & UI library

- **Recharts** is the charting library. No charting library exists in the
  project today; Recharts fits the React + Tailwind + shadcn stack and covers
  every chart type here (line/area/composed for the dual-axis revenue chart,
  vertical bar for the funnel, bar for video depth). The step-over-step
  funnel is a `BarChart` with `layout="vertical"` — no custom drawing.
- The dual-axis revenue+enrollment chart uses a composed chart (area +
  line). Free courses render a single enrollment chart with a "free course"
  badge instead.
- KPI headline row: **3 primary hero cards** (Revenue, Enrollments,
  Completion Rate) and **2 secondary muted cards** (Avg Rating, Avg Watch
  Depth). Each primary card shows the number plus the selected time range for
  context.
- Components live under `app/components/` and are client components; they
  never import services or `~/db` directly. A new analytics-specific chart
  component set reads from the fetched `CourseAnalytics` payload only.

### Empty & zero states

- A **global gate**: if a course has zero enrollments, the tab shows a single
  full-tab "No student data yet" message with a CTA (e.g. copy course link),
  and renders no charts.
- Once there is any enrollment, all sections render; each section handles its
  own partial-zero case with a lightweight inline message (e.g. "No reviews
  yet" inside the satisfaction area). This avoids both broken-looking empty
  charts next to real data and misleading zero-flatlines on a new course.

### No schema changes

- All metrics are computed from existing tables: `purchases`,
  `enrollments`, `lessonProgress` / `lesson_progress`, `video_watch_events`,
  `courseReviews` / `course_reviews`, `lessons`, `modules`, `courses`. No new
  tables, columns, or migrations.

## Testing Decisions

### What makes a good test

- Tests assert **external behavior** — the values returned by the analytics
  service functions — not the SQL internals. Given a known set of seeded
  data, the returned aggregates must match hand-computed expectations.
- Every metric is tested across: a zero/no-data case (returns 0 / empty,
  never NaN or a crash), a single-course happy path, and a multi-edge case
  (e.g. a course with enrollments but no reviews; a free course; a lesson
  with no video; a student who completed the course; a funnel cliff).
- The drop-off tests specifically exercise the step-over-step denominator
  (Lesson 1 uses total enrolled; subsequent lessons use the prior lesson's
  completed count) and the N-of-M annotation.
- Tests never mock Drizzle operators (`eq`, `and`, `sql`) — these are pure
  functions; import them normally and assert on results.

### Test seam

- The **sole meaningful test seam is the analytics service**. The endpoint
  and tab are thin pass-throughs. Service-level tests provide the coverage;
  no route/HTTP/React testing is added (consistent with the project, which
  has no route-layer tests today).

### How the tests are structured

- A single `analyticsService.test.ts` next to the service, following the
  canonical pattern documented in `docs/testing.md`:
  - `vitest` with global `describe`/`it`/`expect`.
  - `createTestDb()` (in-memory SQLite, real migrations) +
    `seedBaseData()` (student, instructor, category, published course).
  - `vi.mock("~/db", () => ({ get db() { return testDb; } }))` **before** the
    service import (via a getter so `beforeEach` reassignment propagates).
  - `beforeEach` recreates the db so each test is isolated.
- Additional per-test data (purchases, enrollments, lesson progress, video
  watch events, reviews) is seeded as each case needs it.

### Prior art

- `purchaseService.test.ts` and `enrollmentService.test.ts` — same mock +
  seed scaffold, same positional-param service style.
- `progressService.test.ts` — tests computed progress/funnel-like aggregates
  against known seeded state, the closest analog to drop-off aggregation
  tests.

## Out of Scope

- Aggregate all-courses analytics page / sidebar navigation / cross-course
  comparison table — covered by issue #94, intentionally deferred.
- Quiz pass rate and at-risk-low-quiz-score student table — issue #93
  explored these; deferred here. (Adding them later is a conditional section,
  shown only when the course has quizzes.)
- Coupon / PPP funnel and revenue-by-country — deferred to a pricing
  iteration.
- Time-series granularity beyond the four fixed presets; no custom date
- Real-time / live-updating analytics.
- Export (CSV / PDF) of analytics.
- Charts beyond the stated set (the funnel is a bar chart, not a custom
  SVG funnel).
- Average-student-progress-percentage as the headline completion metric
  (binary course completion is the headline; the funnel is the diagnostic).
- Route/HTTP-level testing.

## Further Notes

- This design was refined through a grilling session that resolved each
  branching decision: per-course (not aggregate) scope; binary course
  completion (not average progress) as the headline with the funnel as its
  diagnostic; step-over-step (not cumulative) funnel; revenue-primary with
  enrollment overlay auto-switching for free courses; weekly/90d default with
  a synced range picker; video engagement + satisfaction as the two
  additional metrics (quiz performance and coupon funnel deferred);
  Recharts; a dedicated Drizzle-GROUP-BY analytics service; a top-level
  Content|Students|Analytics tab with lazy client-side fetch and session
  cache; and a global empty gate with per-section zero states.
- Related prior art in this repo: issue #93 (course-level analytics) and
  issue #94 (aggregate dashboard). This PRD supersedes the per-course portions
  of #93 with the more detailed decisions above (tab-not-route, lazy load,
  binary completion, step-over-step funnel, auto-switch free-course chart,
  Recharts). #94 remains the separate aggregate follow-up.
- `quizScoringService.ts` currently opens a raw `better-sqlite3` connection
  for `getQuizStats`. Any future quiz-metric work should route through the
  shared Drizzle `db` to stay consistent with the project convention and
  remain testable via the `~/db` mock pattern — not introduce a second raw
  connection.
