# Creatives Dashboard

A professional media buyer dashboard for managing and analyzing paid traffic creative performance (Meta Ads + affiliate commission model) with automated decision engine.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at /api)
- `pnpm --filter @workspace/creatives-dashboard run dev` — run the frontend (port 25630, served at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
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
- ROAS = commission / spend; decision engine runs at read time (not stored)
- Decision override: daysWithoutSales >= 2 always forces PAUSAR regardless of ROAS
- Orval `schemas` option removed from zod config to prevent duplicate type exports
- `lib/api-zod/src/index.ts` exports only `./generated/api` (not types subfolder) to avoid TS2308 conflicts
- AI analysis is rule-based (no external LLM call) — fast, zero cost, no API key needed

## Product

- Dashboard overview: Total Spend, Total Commission, Average ROAS, Active Creatives KPI cards
- ROAS bar chart color-coded by decision (green/yellow/orange/red)
- Decision breakdown panel (ESCALAR / MONITORAR / OTIMIZAR / PAUSAR counts)
- Creatives table with filter by decision and sort by ROAS/spend/commission/name
- Add / Edit / Delete creatives via form modal
- Creative detail page with full metrics breakdown
- "Analyze Creative" button generates a written AI diagnosis (explanation + next action)

## Gotchas

- After changing `openapi.yaml`, always run codegen and then fix `lib/api-zod/src/index.ts` if it adds `./generated/types` or `./generated/api.schemas` back
- Do not add `schemas` config back to the zod orval output — it causes duplicate exports
- Routes are registered at `/api/creatives` and `/api/dashboard/*` in the Express app

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
