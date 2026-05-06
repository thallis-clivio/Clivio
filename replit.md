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
- Commission is **per-user configurable** via `commissionSettingsTable` (GET/PUT `/api/settings/commissions`). Defaults: 2m×R$161,38 / 3m×R$187,38 / 5m×R$241,38 / 7m×R$295,38 / 9m×R$376,38 / 12m×R$484,38 / 16m×R$562,38 / 20m×R$1026,38. `getCommissionRates(userId)` fetches from DB or returns defaults; passed to `withMetrics(row, rates)` and `buildSalesBreakdown(row, rates)` in every route.
- ROAS = commission / spend; CPA = spend / totalSales; both computed at read time (not stored)
- Decision logic (7 states): days>=3 → PAUSAR(semVendas); days>=2+ROAS<3.5 → PAUSAR(semVendas); days>=2+ROAS>=3.5 → MONITORAR(decaindo); days=1+ROAS>=3 → MONITORAR(lucrativo); days=1+ROAS>=2 → MONITORAR(decaindo); days=0+ROAS>=3.5 → ESCALAR; days=0+ROAS>=2 → LUCRATIVO; ROAS>=1 → ATENCAO; else PAUSAR(prejuizo)
- Decision colors (consistent across all pages): 🟢 ESCALAR=green-400, 🔵 LUCRATIVO=blue-400, 🟡 MONITORAR=yellow-400 (ALL sub-reasons), 🟠 ATENÇÃO=orange-400, 🔴 PAUSAR=red-400. No amber, no emerald.
- `hookRate` column kept in DB (`real NOT NULL DEFAULT 0`), omitted from `insertCreativeSchema` and removed from API request body
- `daysWithoutSales` is NOT stored — computed at read time in `withMetrics()` as `Math.max(0, floor((now - (lastSaleAt ?? createdAt)) / 86400000))`. `lastSaleAt` timestamp is updated automatically on every approved Payt postback or simulate sale.
- Desempenho score (0–100): corte direto (days>=3 ou days>=2 com ROAS<3.5) → RUIM capped 30; else ROAS(0–60: >=3.5→60,>=3→55,>=2→50,>=1.5→30,>=1→15) + consistência(0–40: days=0→40,days=1→30,days=2(ROAS>=3.5)→8); ROAS<1 → RUIM cap 20; >=70→EXCELENTE, >=40→BOM, else RUIM
- AI analysis via Claude (`claude-sonnet-4-6`) — `POST /api/creatives/:id/analyze` streams SSE from Anthropic via Replit AI Integrations (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL` + `AI_INTEGRATIONS_ANTHROPIC_API_KEY` auto-provisioned). Frontend uses fetch + ReadableStream; `ClaudeMarkdown` renders **bold** headers and bullet points inline. No conversations DB needed (one-shot analysis).
- Orval `schemas` option removed from zod config to prevent duplicate type exports; `lib/api-zod/src/index.ts` must only export `./generated/api`
- **LTV tracking**: `ltvCommission real NOT NULL DEFAULT 0` on creativesTable + `product_settings` table (userId, mainProductName). Payt webhook: if product name doesn't contain `mainProductName` → LTV sale (adds commission to `ltvCommission`, skips `lastSaleAt`/`salesXm`). GET/PUT `/api/settings/products` endpoint. Simulate endpoint accepts `isLtv: boolean`. ROAS is always front-only.
- **sales2m/sales3m**: Both are in DB and now in OpenAPI spec + `withMetrics()` return. All 8 plans (2m–20m) show in creative-detail "Vendas por Plano" with real rates from `useGetCommissionSettings` (fallback to defaults). Subtotal shown per plan when count > 0.

## Product

- **Landing page** (`/`): Public page with hero + 3 feature cards; redirects signed-in users to `/dashboard`
- **Sign-in** (`/sign-in`): Clerk-hosted, dark theme, "Entrar no Clivio"
- **Sign-up** (`/sign-up`): Clerk-hosted, dark theme, "Criar conta no Clivio"
- **Dashboard** (`/dashboard`): 5 KPI cards, date filter tabs (Hoje/7 dias/15 dias/30 dias/Personalizado), multi-metric chart, performance summary — NO creatives table
- **Central de Criativos** (`/criativos`): ALL creatives (always `dateFilter: "all"`), sort (incl. `daysWithoutSales`) + decision filter (ESCALAR/LUCRATIVO/MONITORAR/ATENCAO/PAUSAR), "Ult. Venda" column, "Adicionar Criativo" button — never filtered by date
- **Relatórios** (`/relatorios`): Date-filtered performance report; 3 KPI summary + **Pódio** (top 3 by commission, gold/silver/bronze) + **Front vs LTV** (commission split front/cross-sell) + **Concentração de Comissão** (80/20 Pareto) + sortable table + CSV export
- **Alertas** (`/alertas`): Real-time actionable alerts from decision engine — PAUSAR / MONITORAR decaindo / ESCALAR sections; stats banner (investimento em risco, comissão potencial)
- **Creative detail** (`/creatives/:id`): Full metrics breakdown, predictability bar, "Analisar com Claude" button streams real-time Claude analysis (Diagnóstico / Pontos críticos / Próximos passos)
- **Configurações** (`/settings`): **Produto Principal** (main product name for LTV classification, DB-persisted) + Per-user commission settings + **URL base do Checkout** (localStorage: `clivio_payt_checkout_url`) — configures base Payt checkout URL so tracking links are auto-generated per creative
- Sidebar grouped: Análise (Visão Geral / Central de Criativos / Relatórios) | Operação (Alertas) | Conta (Configurações)
- Payt postback at `/api/webhooks/payt` (unprotected, validates PAYT_INTEGRATION_KEY); utm_content supports `userId::creativeName` for per-user routing, falls back to global name search for legacy values
- **UTM tracking links**: auto-generated per creative as `{paytUrl}?utm_content={userId}::{creativeName}`; base URL stored in localStorage; copy button on every criativos row + tracking strip on creative detail page; configured in Configurações → Link de Rastreamento Automático

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
