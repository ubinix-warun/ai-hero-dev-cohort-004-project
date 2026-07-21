# Conventions

## Validation — `app/lib/validation.ts`

Three helpers centralize parsing/validation across the app. All use Zod.

```ts
import { parseFormData, parseParams, parseJsonBody } from "~/lib/validation";
```

- **`parseFormData(formData, schema)`** — for route actions. Converts FormData
  to a plain object, validates, and returns `{ success: true, data }` or
  `{ success: false, errors }` where `errors` is a `Record<string, string>`
  (first error per field), suitable for re-rendering a form with inline errors.
- **`parseParams(params, schema)`** — for URL params in loaders/actions.
  Validates and **throws `data("Invalid parameters", { status: 400 })`** on
  failure (params can't be corrected by the user like a form can).
- **`parseJsonBody(request, schema)`** — for JSON API actions. Async; same
  result shape as `parseFormData`.

Schemas are plain `z.object({ ... })` / `z.coerce.number()` etc. Build them
inline at the route or in a schema module alongside the service.

## Error handling

Throw/return typed responses from routes with `data(value, { init })` from
`react-router`, and detect them in ErrorBoundaries with
`isRouteErrorResponse(error)`. Pattern:

```ts
// in a route action
if (!course) throw data("Course not found", { status: 404 });

// in ErrorBoundary
if (isRouteErrorResponse(error)) {
  // error.status, error.data
}
```

Services throw plain `new Error("message")` for domain problems (duplicate
enrollment, not found). Routes translate those into `data(..., { status })`
responses — don't let raw Error objects leak to the UI.

## Formatting — `.prettierrc`

```json
{
  "useTabs": false,
  "tabWidth": 2,
  "printWidth": 80,
  "singleQuote": false,
  "trailingComma": "es5",
  "semi": true,
  "arrowParens": "always"
}
```

Two formatting helpers in `~/lib/utils.ts`:

- **`formatPrice(cents)`** — `null`/`0`/falsy → `"Free"`, else `"$X.XX"`.
- **`formatDuration(minutes, showHours, showSeconds, padZeros)`** — use the
  boolean flags; not a generic formatter.

Prettier runs via your editor on save; there's no `format` script enforcing it
in CI.

## PPP / country pricing

`app/lib/ppp.ts` defines `COUNTRIES` and tiered price discounts
(`getCountryTierInfo`, `calculatePppPrice`). Country resolution lives in
`app/lib/country.server.ts` and follows a layered fallback:

1. Dev session override (`devCountry` cookie — settable via the DevUI panel).
2. `CF-IPCountry` header (Cloudflare).
3. `ip-api.com` lookup on `X-Forwarded-For`.

Defaults to Tier 1 (no discount) on any failure. Because the dev override
exists, PPP is testable locally without proxies — set your country in the DevUI.

## Server-side Markdown

`app/lib/markdown.server.ts` exports `renderMarkdown(markdown): Promise<string>`.
Uses `marked` + `shiki` with the `github-dark` theme and a fixed set of
highlighted languages. Render in loaders, then inject into the component with
`dangerouslySetInnerHTML` wrapped in a `prose prose-neutral dark:prose-invert`
container (Tailwind Typography). Only render trusted content — sales copy is a
known, controlled string.

## UI conventions

- **Tailwind v4** via `@tailwindcss/vite` — theme tokens live in
  `app/app.css` (no `tailwind.config.{js,ts}` file).
- **shadcn/ui** `new-york` style; primitives in `app/components/ui/`. New ones
  added via the `shadcn` CLI (`npx shadcn add <name>`).
- **Variants** via `class-variance-authority` (`cva`); combine conditional
  classes with `cn()` (clsx + tailwind-merge).
- **Icons** from `lucide-react`.
- Prefer the existing primitives over hand-rolling elements. Feature components
  live directly in `app/components/` (e.g. `star-rating.tsx`, `course-image.tsx`,
  `youtube-player.tsx`).
- Components under `app/components/` are client components — don't import
  services or `~/db` into them.

## Imports

`tsconfig.json` enables `verbatimModuleSyntax`, so use `import type` for
type-only imports. Path alias `~/*` maps to `./app/*` and is wired into both
TypeScript and Vitest.

## Course lifecycle (repo-as-curriculum)

This repo doubles as a course: `pnpm reset <commit>` and `pnpm cherry-pick
<commit>` (via the `ai-hero-cli`) jump between lesson checkpoints. Don't rewrite
history on the `live-run-through` branch or move seed data without checking the
lesson plan.
