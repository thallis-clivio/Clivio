# Creatives Dashboard (Clivio)

A professional media buyer dashboard for managing and analyzing paid traffic creative performance (Meta Ads + affiliate commission model) with automated decision engine, predictability scoring, and multi-user authentication.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at /api)
- `pnpm --filter @workspace/creatives-dashboard run dev` — run the frontend (port 25630, served at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (always fix `lib/api-zod/src/index.ts` after: must only contain `export * from "./generated/api";`)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` (auto-provisioned), `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` (auto-provisioned by Clerk setup), `PAYT_INTEGRATION_KEY`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, Recharts, Wouter, react-hook-form, @clerk/react, @clerk/themes
- API: Express 5, @clerk/express (clerkMiddleware + getAuth)
- DB: PostgreSQL + Drizzle ORM
- Auth: Clerk (email/password + Google OAuth) — per-user data isolation via `userId` column
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/creatives.ts`
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Generated hooks: `lib/api-client-react/src/generated/api.ts`
- Generated Zod schemas: `lib/api-zod/src/generated/api.ts`
- API routes: `artifacts/api-server/src/routes/` (creatives.ts, dashboard.ts, webhooks.ts)
- Auth middleware: `artifacts/api-server/src/middlewares/` (requireAuth.ts, clerkProxyMiddleware.ts)
- Frontend pages: `artifacts/creatives-dashboard/src/pages/` (landing.tsx, home.tsx, creative-detail.tsx)
- Theme: `artifacts/creatives-dashboard/src/index.css`

## Architecture decisions

- **Auth**: Clerk with clerkProxyMiddleware mounted before body parsers in app.ts. `requireAuth` middleware on all creatives/dashboard routes; webhooks unprotected (Payt can't send session tokens)
- **Per-user isolation**: `userId text NOT NULL DEFAULT ''` column on creativesTable; all DB queries filter by `eq(creativesTable.userId, userId)`. Webhooks find creatives by name across all users.
- Commission computed server-side in BRL at 54% base Payt rate: 2m×R$161,38 / 3m×R$187,38 / 5m×R$241,38 / 7m×R$295,38 / 9m×R$376,38 / 12m×R$484,38 / 16m×R$562,38 / 20m×R$1026,38
- ROAS = commission / spend; CPA = spend / totalSales; both computed at read time (not stored)
- Decision logic: daysWithoutSales >= 2 → PAUSAR; ROAS >= 2 AND days=0 → ESCALAR; ROAS >= 1 AND (ROAS < 2 OR days=1) → MONITORAR(reason); else PAUSAR
- `hookRate` column kept in DB (`real NOT NULL DEFAULT 0`), omitted from `insertCreativeSchema` and removed from API request body
- Predictability score (0–100) = consistency (0–40) + ROAS quality (0–35) + CPA efficiency (0–25)
- AI analysis is rule-based (no external LLM call) — fast, zero cost, no API key needed
- Orval `schemas` option removed from zod config to prevent duplicate type exports; `lib/api-zod/src/index.ts` must only export `./generated/api`

## Product

- **Landing page** (`/`): Public page with hero + 3 feature cards; redirects signed-in users to `/dashboard`
- **Sign-in** (`/sign-in`): Clerk-hosted, dark theme, "Entrar no Clivio"
- **Sign-up** (`/sign-up`): Clerk-hosted, dark theme, "Criar conta no Clivio"
- **Dashboard** (`/dashboard`): 5 KPI cards, date filter tabs (Hoje/Semana/Mês/Tudo), multi-metric chart, performance summary, creatives table with decisions
- **Creative detail** (`/creatives/:id`): Full metrics breakdown, predictability bar, AI analysis
- Sidebar logout button + user email display
- "Simular Venda" button in dashboard header (no auth required on `/api/webhooks/simulate`)
- Payt postback at `/api/webhooks/payt` (unprotected, validates PAYT_INTEGRATION_KEY); utm_content supports `userId::creativeName` for per-user routing, falls back to global name search for legacy values

## Gotchas

- Clerk proxy path is `/api/__clerk`; clerkProxyMiddleware must be mounted BEFORE body parsers in app.ts
- After changing `openapi.yaml`, always run codegen and then fix `lib/api-zod/src/index.ts`
- Do not add `schemas` config back to the zod orval output — it causes duplicate exports
- Routes at `/api/creatives` and `/api/dashboard/*` all require auth; `/api/webhooks/*` are public
- `hookRate` is in the DB but excluded from all API surfaces — new rows get default 0
- Wouter base path is `import.meta.env.BASE_URL`; Clerk `path` props need the FULL path including basePath

## Pointers

- See `.local/skills/clerk-auth` for Clerk setup reference
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
