# Frontend Standards

Rules for `app/routes/`, `app/components/`, and anything the user sees. UI flow:
**route loader → component props → render**; mutations flow **form/action →
service → database**.

## Route contract

Every page route that fetches data follows this shape (see
`routes/courses.$slug.tsx`):

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
  // render; client-component hooks here
}
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // isRouteErrorResponse(error) to branch on status
}
```

- Loader data arrives as the `loaderData` prop (no `useLoaderData` call).
- Use `data(value, { status })` from `react-router`; detect with
  `isRouteErrorResponse(error)` in ErrorBoundary.
- Action-only API routes are named `api.<thing>.ts`.

## Validation

Three helpers in `app/lib/validation.ts`:

- **`parseFormData(formData, schema)`** — route actions. Returns
  `{ success: true, data }` or `{ success: false, errors }` (first error per field).
- **`parseParams(params, schema)`** — URL params. Throws
  `data("Invalid parameters", { status: 400 })` on failure.
- **`parseJsonBody(request, schema)`** — JSON API actions. Async; same shape as
  `parseFormData`.

Schemas are plain Zod objects built **inline at the route** (no shared schema
module). Many are discriminated unions (`courseEditorActionSchema`,
`purchaseActionSchema`, `quizActionSchema`).

## Server/client boundary

- `app/services/`, `app/db/`, `app/lib/*.server.ts` → server-only.
- `validation.ts`, `utils.ts`, `ppp.ts` → environment-agnostic.
- Components in `app/components/` are **client components** — never import
  services or `~/db` into them.
- Server-side markdown (`app/lib/markdown.server.ts`) renders in loaders; inject
  into components with `dangerouslySetInnerHTML` inside a
  `prose prose-neutral dark:prose-invert` container. Only render trusted content.

## UI conventions

- **Tailwind v4** via `@tailwindcss/vite` — theme tokens in `app/app.css`
  (no config file).
- **shadcn/ui** `new-york` style; primitives in `app/components/ui/`. Add new
  ones via `npx shadcn add <name>`.
- **Variants** via `class-variance-authority` (`cva`); combine conditional
  classes with `cn()` (clsx + tailwind-merge).
- **Icons** from `lucide-react`.
- Feature components live in `app/components/` (e.g. `star-rating.tsx`,
  `youtube-player.tsx`).

## Styling reference

`.prettierrc`: 2-space indent, 80-col print width, double quotes, trailing
commas (es5), semicolons, always arrow parens. Prettier runs via editor on
save — no CI enforcement.

`~/lib/utils.ts` formatting helpers:
- `formatPrice(cents)` — `null`/`0`/falsy → `"Free"`, else `"$X.XX"`.
- `formatDuration(minutes, showHours, showSeconds, padZeros)` — boolean flags
  (offender for object-param conversion).

## Imports

`tsconfig.json` enables `verbatimModuleSyntax` — use `import type` for type-only
imports. Path alias `~/*` maps to `./app/*` (wired into both TS and Vitest).
