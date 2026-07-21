---
name: coding-standards
description: Centralizes all Cadence coding standards — object params, types, error handling, naming, and architecture rules. Use when implementing features, conducting code reviews, referencing conventions, or checking that code matches project patterns. Triggers on "standards", "conventions", "review", "refactor", "implement", "pattern", "CLAUDE.md".
---

# Coding Standards

This skill is the single source of truth for Cadence coding conventions. It
replaces the old `CLAUDE.md` instructions — that file now just points here.

## When to read the references

- **Writing or reviewing services, DB access, loaders, actions** → read [backend.md](backend.md)
- **Writing or reviewing routes, components, UI** → read [frontend.md](frontend.md)
- **Both** (most implementation tasks) → read both

## Quick rules (most-often violated)

1. **Object params** — ≥2 params of the same type → use `opts: { ... }`. Canonical
   form for the pervasive 2-ID service signature:
   ```ts
   const findEnrollment = (opts: { userId: number; courseId: number }) => {};
   ```
   Reference impl: `app/services/bookmarkService.ts`.

2. **No `any`** — use Drizzle `$inferSelect`/`$inferInsert`, TS enums, or the
   per-route Zod schemas. `services/quizScoringService.ts` is the main offender.

3. **Wrap `JSON.parse`** — always in try/catch; Zod `.string().min(1)` doesn't
   guarantee valid JSON.

4. **Guard array destructuring** — `const [row] = db.insert(...).returning().all()`
   yields `undefined` if no rows come back. Check length or throw first.

5. **Don't swallow errors** — no `console.log(e); return …`. Services throw,
   routes throw `data(...)`, ErrorBoundary catches. See `docs/conventions.md`.

## Reference documents

- [backend.md](backend.md) — services, DB, types, error handling, object params offender list
- [frontend.md](frontend.md) — routes, components, UI conventions, server/client boundary
