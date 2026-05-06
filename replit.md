# Creatives Dashboard

A professional media buyer dashboard for managing and analyzing paid traffic creative performance (Meta Ads + affiliate commission model) with automated decision engine and predictability scoring.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at /api)
- `pnpm --filter @workspace/creatives-dashboard run dev` — run the frontend (port 25630, served at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (always fix `lib/api-zod/src/index.ts` after: must only contain `export * from "./generated/api";`)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, Recharts, Wouter, react-hook-form
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/creatives.ts`
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Generated hooks: `lib/api-client-react/src/generated/api.ts`
- Generated Zod schemas: `lib/api-zod/src/generated/api.ts`
- API routes: `artifacts/api-server/src/routes/` (creatives.ts, dashboard.ts)
- Frontend pages: `artifacts/creatives-dashboard/src/pages/`
- Theme: `artifacts/creatives-dashboard/src/index.css`

## Architecture decisions

- Commission computed server-side (5m×$217, 7m×$300, 9m×$380, 12m×$460, 16m×$520, 20m×$650)
- ROAS = commission / spend; CPA = spend / totalSales; both computed at read time (not stored)
- Decision override: daysWithoutSales >= 2 always forces PAUSAR regardless of ROAS
- `hookRate` column kept in DB (`real NOT NULL DEFAULT 0`), omitted from `insertCreativeSchema` and removed from API request body
- Predictability score (0–100) = consistency (0–40) + ROAS quality (0–35) + CPA efficiency (0–25)
- AI analysis is rule-based (no external LLM call) — fast, zero cost, no API key needed
- Orval `schemas` option removed from zod config to prevent duplicate type exports; `lib/api-zod/src/index.ts` must only export `./generated/api`

## Product

- Dashboard overview: 5 KPI cards (Total Spend, Total Commission, Average ROAS, Average CPA, Total Sales)
- Date filter tabs: Hoje / Semana / Mês / Tudo — filters all KPIs, charts, table
- Multi-metric chart: ROAS over time / CPA over time / Sales per day (line + bar charts)
- Decision breakdown panel (ESCALAR / MONITORAR / OTIMIZAR / PAUSAR counts)
- Creatives table: Name, Spend, Commission, ROAS, CPA (color-coded), Sales, Decision, Predictability badge
- Sort by ROAS / CPA / Spend / Commission / Sales / Name
- Add / Edit / Delete creatives via form modal (no hookRate field)
- Creative detail page: full metrics breakdown, predictability progress bar, sales by plan
- "Analyze Creative" button generates a written AI diagnosis (ROAS + CPA + predictability insights)

## Gotchas

- After changing `openapi.yaml`, always run codegen and then fix `lib/api-zod/src/index.ts` if it adds `./generated/api.schemas` or `./generated/types` back
- Do not add `schemas` config back to the zod orval output — it causes duplicate exports
- Routes are registered at `/api/creatives` and `/api/dashboard/*` in the Express app
- `hookRate` is in the DB but excluded from all API surfaces — new rows get default 0

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
