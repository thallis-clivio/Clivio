# Clivio — Código Fonte Completo

> Stack: React + Vite (frontend), Express 5 (backend), PostgreSQL + Drizzle ORM, Clerk Auth, TypeScript 5.9, pnpm monorepo

## Contexto do Projeto

**Arquivo:** `replit.md`

```markdown
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
- Decision logic: days>=3 → PAUSAR(semVendas); days>=2 AND ROAS<3.5 → PAUSAR(semVendas); days>=2 AND ROAS>=3.5 → MONITORAR(decaindo); ROAS>=2 AND days=0 → ESCALAR; ROAS>=1 → MONITORAR(lucrativo|decaindo); else PAUSAR(prejuizo)
- `hookRate` column kept in DB (`real NOT NULL DEFAULT 0`), omitted from `insertCreativeSchema` and removed from API request body
- Desempenho score (0–100): corte direto (days>=3 ou days>=2 com ROAS<3.5) → RUIM capped 30; else ROAS(0–60: >=3.5→60,>=3→55,>=2→50,>=1.5→30,>=1→15) + consistência(0–40: days=0→40,days=1→30,days=2(ROAS>=3.5)→8); ROAS<1 → RUIM cap 20; >=70→EXCELENTE, >=40→BOM, else RUIM
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

```

---

## DB Schema

**Arquivo:** `lib/db/src/schema/creatives.ts`

```typescript
import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creativesTable = pgTable("creatives", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  date: text("date").notNull(),
  spend: real("spend").notNull(),
  sales2m: integer("sales_2m").notNull().default(0),
  sales3m: integer("sales_3m").notNull().default(0),
  sales5m: integer("sales_5m").notNull().default(0),
  sales7m: integer("sales_7m").notNull().default(0),
  sales9m: integer("sales_9m").notNull().default(0),
  sales12m: integer("sales_12m").notNull().default(0),
  sales16m: integer("sales_16m").notNull().default(0),
  sales20m: integer("sales_20m").notNull().default(0),
  ctr: real("ctr").notNull().default(0),
  // hookRate kept in DB for backward compatibility, defaulted to 0
  hookRate: real("hook_rate").notNull().default(0),
  daysWithoutSales: integer("days_without_sales").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreativeSchema = createInsertSchema(creativesTable).omit({
  id: true,
  createdAt: true,
  hookRate: true,
});

export type InsertCreative = z.infer<typeof insertCreativeSchema>;
export type Creative = typeof creativesTable.$inferSelect;

```

---

## OpenAPI Spec

**Arquivo:** `lib/api-spec/openapi.yaml`

```yaml
openapi: 3.1.0
info:
  # Do not change the title, if the title changes, the import paths will be broken
  title: Api
  version: 0.1.0
  description: API specification for Creatives Performance Dashboard
servers:
  - url: /api
    description: Base API path
tags:
  - name: health
    description: Health operations
  - name: creatives
    description: Creative performance management
  - name: dashboard
    description: Dashboard summary data
  - name: webhooks
    description: Inbound webhook receivers
paths:
  /healthz:
    get:
      operationId: healthCheck
      tags: [health]
      summary: Health check
      description: Returns server health status
      responses:
        "200":
          description: Healthy
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthStatus"

  /creatives:
    get:
      operationId: listCreatives
      tags: [creatives]
      summary: List all creatives
      parameters:
        - name: decision
          in: query
          required: false
          schema:
            type: string
            enum: [ESCALAR, MONITORAR, PAUSAR]
        - name: sortBy
          in: query
          required: false
          schema:
            type: string
            enum: [roas, spend, commission, name, cpa, totalSales]
        - name: sortOrder
          in: query
          required: false
          schema:
            type: string
            enum: [asc, desc]
        - name: dateFilter
          in: query
          required: false
          schema:
            type: string
            enum: [daily, weekly, monthly, all]
      responses:
        "200":
          description: List of creatives with computed metrics
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/CreativeWithMetrics"
    post:
      operationId: createCreative
      tags: [creatives]
      summary: Create a new creative
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateCreativeBody"
      responses:
        "201":
          description: Created creative
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CreativeWithMetrics"
        "400":
          description: Validation error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /creatives/{id}:
    get:
      operationId: getCreative
      tags: [creatives]
      summary: Get a creative by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: Creative with metrics
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CreativeWithMetrics"
        "404":
          description: Not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
    put:
      operationId: updateCreative
      tags: [creatives]
      summary: Update a creative
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateCreativeBody"
      responses:
        "200":
          description: Updated creative
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CreativeWithMetrics"
        "404":
          description: Not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
    delete:
      operationId: deleteCreative
      tags: [creatives]
      summary: Delete a creative
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "204":
          description: Deleted successfully
        "404":
          description: Not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /creatives/{id}/chart:
    get:
      operationId: getCreativeChart
      tags: [creatives]
      summary: Sales over time for a creative (grouped by date, matched by name)
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
        - name: dateFilter
          in: query
          required: false
          schema:
            type: string
            enum: [daily, weekly, monthly, all]
      responses:
        "200":
          description: Sales chart data grouped by date
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ChartDataPoint"
        "404":
          description: Not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /creatives/{id}/analyze:
    post:
      operationId: analyzeCreative
      tags: [creatives]
      summary: AI analysis of a creative's performance
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: Analysis result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AnalysisResult"
        "404":
          description: Not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /dashboard/summary:
    get:
      operationId: getDashboardSummary
      tags: [dashboard]
      summary: Get dashboard KPI summary
      parameters:
        - name: dateFilter
          in: query
          required: false
          schema:
            type: string
            enum: [daily, weekly, monthly, all]
      responses:
        "200":
          description: Dashboard summary
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DashboardSummary"

  /dashboard/decision-breakdown:
    get:
      operationId: getDecisionBreakdown
      tags: [dashboard]
      summary: Count of creatives per decision
      parameters:
        - name: dateFilter
          in: query
          required: false
          schema:
            type: string
            enum: [daily, weekly, monthly, all]
      responses:
        "200":
          description: Decision breakdown counts
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DecisionBreakdown"

  /dashboard/performance-summary:
    get:
      operationId: getPerformanceSummary
      tags: [dashboard]
      summary: Get performance highlights — best ROAS, worst CPA, most sales, decision counts
      parameters:
        - name: dateFilter
          in: query
          required: false
          schema:
            type: string
            enum: [daily, weekly, monthly, all]
      responses:
        "200":
          description: Performance summary
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PerformanceSummary"

  /dashboard/charts:
    get:
      operationId: getDashboardCharts
      tags: [dashboard]
      summary: Get chart data aggregated by date
      parameters:
        - name: dateFilter
          in: query
          required: false
          schema:
            type: string
            enum: [daily, weekly, monthly, all]
      responses:
        "200":
          description: Chart data points by date
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ChartDataPoint"

  /webhooks/payt:
    post:
      operationId: handlePaytWebhook
      tags: [webhooks]
      summary: Receive Payt sale postback and update creative sales
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/PaytWebhookPayload"
      responses:
        "200":
          description: Always returns 200
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WebhookResponse"

  /webhooks/simulate:
    post:
      operationId: simulateSale
      tags: [webhooks]
      summary: Simulate a sale for testing purposes (no auth required)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/SimulateSaleBody"
      responses:
        "200":
          description: Simulation result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WebhookResponse"

components:
  schemas:
    HealthStatus:
      type: object
      properties:
        status:
          type: string
      required:
        - status

    ErrorResponse:
      type: object
      properties:
        error:
          type: string
      required:
        - error

    CreateCreativeBody:
      type: object
      properties:
        name:
          type: string
        date:
          type: string
        spend:
          type: number
        sales5m:
          type: integer
        sales7m:
          type: integer
        sales9m:
          type: integer
        sales12m:
          type: integer
        sales16m:
          type: integer
        sales20m:
          type: integer
        ctr:
          type: number
        daysWithoutSales:
          type: integer
      required:
        - name
        - date
        - spend
        - sales5m
        - sales7m
        - sales9m
        - sales12m
        - sales16m
        - sales20m
        - daysWithoutSales

    CreativeWithMetrics:
      allOf:
        - $ref: "#/components/schemas/CreateCreativeBody"
        - type: object
          properties:
            id:
              type: integer
            commission:
              type: number
            roas:
              type: number
            cpa:
              type: number
            totalSales:
              type: integer
            predictabilityScore:
              type: number
            predictabilityLabel:
              type: string
              enum: [EXCELENTE, BOM, RUIM]
            decision:
              type: string
              enum: [ESCALAR, MONITORAR, PAUSAR]
            monitorarReason:
              type: string
              nullable: true
              enum: [lucrativo, decaindo]
            pausarReason:
              type: string
              nullable: true
              enum: [semVendas, prejuizo]
          required:
            - id
            - commission
            - roas
            - cpa
            - totalSales
            - predictabilityScore
            - predictabilityLabel
            - decision

    DashboardSummary:
      type: object
      properties:
        totalSpend:
          type: number
        totalCommission:
          type: number
        averageRoas:
          type: number
        averageCpa:
          type: number
        totalSales:
          type: integer
        totalCreatives:
          type: integer
        topCreativeByRoas:
          $ref: "#/components/schemas/CreativeWithMetrics"
      required:
        - totalSpend
        - totalCommission
        - averageRoas
        - averageCpa
        - totalSales
        - totalCreatives

    DecisionBreakdown:
      type: object
      properties:
        ESCALAR:
          type: integer
        MONITORAR:
          type: integer
        PAUSAR:
          type: integer
      required:
        - ESCALAR
        - MONITORAR
        - PAUSAR

    PerformanceSummary:
      type: object
      properties:
        bestRoas:
          type: object
          nullable: true
          properties:
            name:
              type: string
            roas:
              type: number
            commission:
              type: number
          required: [name, roas, commission]
        worstCpa:
          type: object
          nullable: true
          properties:
            name:
              type: string
            cpa:
              type: number
            spend:
              type: number
            totalSales:
              type: integer
          required: [name, cpa, spend, totalSales]
        mostSales:
          type: object
          nullable: true
          properties:
            name:
              type: string
            totalSales:
              type: integer
            roas:
              type: number
          required: [name, totalSales, roas]
        decisions:
          type: object
          properties:
            ESCALAR:
              type: integer
            MONITORAR:
              type: integer
            PAUSAR:
              type: integer
          required: [ESCALAR, MONITORAR, PAUSAR]
        totalCreatives:
          type: integer
      required:
        - decisions
        - totalCreatives

    ChartDataPoint:
      type: object
      properties:
        date:
          type: string
        roas:
          type: number
        cpa:
          type: number
        totalSales:
          type: integer
        spend:
          type: number
        commission:
          type: number
      required:
        - date
        - roas
        - cpa
        - totalSales
        - spend
        - commission

    AnalysisResult:
      type: object
      properties:
        creativeId:
          type: integer
        decision:
          type: string
        explanation:
          type: string
        nextAction:
          type: string
        metrics:
          type: object
          properties:
            roas:
              type: number
            commission:
              type: number
            spend:
              type: number
            cpa:
              type: number
            ctr:
              type: number
            totalSales:
              type: integer
            predictabilityScore:
              type: number
            predictabilityLabel:
              type: string
      required:
        - creativeId
        - decision
        - explanation
        - nextAction
        - metrics

    SimulateSaleBody:
      type: object
      properties:
        utmContent:
          type: string
          description: >
            utm_content value in `userId::creativeName` format (mirrors the real Payt webhook).
            When provided, `creativeName` and `userId` are ignored.
        creativeName:
          type: string
          description: Creative name (used when utmContent is not provided)
        plan:
          type: string
          enum: ["2m", "3m", "5m", "7m", "9m", "12m", "16m", "20m"]
        cancelled:
          type: boolean
        userId:
          type: string
          description: >
            Optional Clerk userId to scope the lookup when using creativeName directly.
            Ignored when utmContent is provided.
      required:
        - plan

    PaytWebhookPayload:
      type: object
      properties:
        integration_key:
          type: string
        transaction_id:
          type: string
        status:
          type: string
        type:
          type: string
        test:
          type: boolean
        utm_content:
          type: string
      required:
        - status

    WebhookResponse:
      type: object
      properties:
        ok:
          type: boolean
        reason:
          type: string
        creativeId:
          type: integer
        planField:
          type: string
        delta:
          type: integer
      required:
        - ok

```

---

## Zod Schemas (gerado)

**Arquivo:** `lib/api-zod/src/generated/api.ts`

```typescript
/**
 * Generated by orval v8.5.3 🍺
 * Do not edit manually.
 * Api
 * API specification for Creatives Performance Dashboard
 * OpenAPI spec version: 0.1.0
 */
import * as zod from "zod";

/**
 * Returns server health status
 * @summary Health check
 */
export const HealthCheckResponse = zod.object({
  status: zod.string(),
});

/**
 * @summary List all creatives
 */
export const ListCreativesQueryParams = zod.object({
  decision: zod.enum(["ESCALAR", "MONITORAR", "PAUSAR"]).optional(),
  sortBy: zod
    .enum(["roas", "spend", "commission", "name", "cpa", "totalSales"])
    .optional(),
  sortOrder: zod.enum(["asc", "desc"]).optional(),
  dateFilter: zod.enum(["daily", "weekly", "monthly", "all"]).optional(),
});

export const ListCreativesResponseItem = zod
  .object({
    name: zod.string(),
    date: zod.string(),
    spend: zod.number(),
    sales5m: zod.number(),
    sales7m: zod.number(),
    sales9m: zod.number(),
    sales12m: zod.number(),
    sales16m: zod.number(),
    sales20m: zod.number(),
    ctr: zod.number().optional(),
    daysWithoutSales: zod.number(),
  })
  .and(
    zod.object({
      id: zod.number(),
      commission: zod.number(),
      roas: zod.number(),
      cpa: zod.number(),
      totalSales: zod.number(),
      predictabilityScore: zod.number(),
      predictabilityLabel: zod.enum(["EXCELENTE", "BOM", "RUIM"]),
      decision: zod.enum(["ESCALAR", "MONITORAR", "PAUSAR"]),
      monitorarReason: zod.enum(["lucrativo", "decaindo"]).nullish(),
      pausarReason: zod.enum(["semVendas", "prejuizo"]).nullish(),
    }),
  );
export const ListCreativesResponse = zod.array(ListCreativesResponseItem);

/**
 * @summary Create a new creative
 */
export const CreateCreativeBody = zod.object({
  name: zod.string(),
  date: zod.string(),
  spend: zod.number(),
  sales5m: zod.number(),
  sales7m: zod.number(),
  sales9m: zod.number(),
  sales12m: zod.number(),
  sales16m: zod.number(),
  sales20m: zod.number(),
  ctr: zod.number().optional(),
  daysWithoutSales: zod.number(),
});

/**
 * @summary Get a creative by ID
 */
export const GetCreativeParams = zod.object({
  id: zod.coerce.number(),
});

export const GetCreativeResponse = zod
  .object({
    name: zod.string(),
    date: zod.string(),
    spend: zod.number(),
    sales5m: zod.number(),
    sales7m: zod.number(),
    sales9m: zod.number(),
    sales12m: zod.number(),
    sales16m: zod.number(),
    sales20m: zod.number(),
    ctr: zod.number().optional(),
    daysWithoutSales: zod.number(),
  })
  .and(
    zod.object({
      id: zod.number(),
      commission: zod.number(),
      roas: zod.number(),
      cpa: zod.number(),
      totalSales: zod.number(),
      predictabilityScore: zod.number(),
      predictabilityLabel: zod.enum(["EXCELENTE", "BOM", "RUIM"]),
      decision: zod.enum(["ESCALAR", "MONITORAR", "PAUSAR"]),
      monitorarReason: zod.enum(["lucrativo", "decaindo"]).nullish(),
      pausarReason: zod.enum(["semVendas", "prejuizo"]).nullish(),
    }),
  );

/**
 * @summary Update a creative
 */
export const UpdateCreativeParams = zod.object({
  id: zod.coerce.number(),
});

export const UpdateCreativeBody = zod.object({
  name: zod.string(),
  date: zod.string(),
  spend: zod.number(),
  sales5m: zod.number(),
  sales7m: zod.number(),
  sales9m: zod.number(),
  sales12m: zod.number(),
  sales16m: zod.number(),
  sales20m: zod.number(),
  ctr: zod.number().optional(),
  daysWithoutSales: zod.number(),
});

export const UpdateCreativeResponse = zod
  .object({
    name: zod.string(),
    date: zod.string(),
    spend: zod.number(),
    sales5m: zod.number(),
    sales7m: zod.number(),
    sales9m: zod.number(),
    sales12m: zod.number(),
    sales16m: zod.number(),
    sales20m: zod.number(),
    ctr: zod.number().optional(),
    daysWithoutSales: zod.number(),
  })
  .and(
    zod.object({
      id: zod.number(),
      commission: zod.number(),
      roas: zod.number(),
      cpa: zod.number(),
      totalSales: zod.number(),
      predictabilityScore: zod.number(),
      predictabilityLabel: zod.enum(["EXCELENTE", "BOM", "RUIM"]),
      decision: zod.enum(["ESCALAR", "MONITORAR", "PAUSAR"]),
      monitorarReason: zod.enum(["lucrativo", "decaindo"]).nullish(),
      pausarReason: zod.enum(["semVendas", "prejuizo"]).nullish(),
    }),
  );

/**
 * @summary Delete a creative
 */
export const DeleteCreativeParams = zod.object({
  id: zod.coerce.number(),
});

/**
 * @summary Sales over time for a creative (grouped by date, matched by name)
 */
export const GetCreativeChartParams = zod.object({
  id: zod.coerce.number(),
});

export const GetCreativeChartQueryParams = zod.object({
  dateFilter: zod.enum(["daily", "weekly", "monthly", "all"]).optional(),
});

export const GetCreativeChartResponseItem = zod.object({
  date: zod.string(),
  roas: zod.number(),
  cpa: zod.number(),
  totalSales: zod.number(),
  spend: zod.number(),
  commission: zod.number(),
});
export const GetCreativeChartResponse = zod.array(GetCreativeChartResponseItem);

/**
 * @summary AI analysis of a creative's performance
 */
export const AnalyzeCreativeParams = zod.object({
  id: zod.coerce.number(),
});

export const AnalyzeCreativeResponse = zod.object({
  creativeId: zod.number(),
  decision: zod.string(),
  explanation: zod.string(),
  nextAction: zod.string(),
  metrics: zod.object({
    roas: zod.number().optional(),
    commission: zod.number().optional(),
    spend: zod.number().optional(),
    cpa: zod.number().optional(),
    ctr: zod.number().optional(),
    totalSales: zod.number().optional(),
    predictabilityScore: zod.number().optional(),
    predictabilityLabel: zod.string().optional(),
  }),
});

/**
 * @summary Get dashboard KPI summary
 */
export const GetDashboardSummaryQueryParams = zod.object({
  dateFilter: zod.enum(["daily", "weekly", "monthly", "all"]).optional(),
});

export const GetDashboardSummaryResponse = zod.object({
  totalSpend: zod.number(),
  totalCommission: zod.number(),
  averageRoas: zod.number(),
  averageCpa: zod.number(),
  totalSales: zod.number(),
  totalCreatives: zod.number(),
  topCreativeByRoas: zod
    .object({
      name: zod.string(),
      date: zod.string(),
      spend: zod.number(),
      sales5m: zod.number(),
      sales7m: zod.number(),
      sales9m: zod.number(),
      sales12m: zod.number(),
      sales16m: zod.number(),
      sales20m: zod.number(),
      ctr: zod.number().optional(),
      daysWithoutSales: zod.number(),
    })
    .and(
      zod.object({
        id: zod.number(),
        commission: zod.number(),
        roas: zod.number(),
        cpa: zod.number(),
        totalSales: zod.number(),
        predictabilityScore: zod.number(),
        predictabilityLabel: zod.enum(["EXCELENTE", "BOM", "RUIM"]),
        decision: zod.enum(["ESCALAR", "MONITORAR", "PAUSAR"]),
        monitorarReason: zod.enum(["lucrativo", "decaindo"]).nullish(),
        pausarReason: zod.enum(["semVendas", "prejuizo"]).nullish(),
      }),
    )
    .optional(),
});

/**
 * @summary Count of creatives per decision
 */
export const GetDecisionBreakdownQueryParams = zod.object({
  dateFilter: zod.enum(["daily", "weekly", "monthly", "all"]).optional(),
});

export const GetDecisionBreakdownResponse = zod.object({
  ESCALAR: zod.number(),
  MONITORAR: zod.number(),
  PAUSAR: zod.number(),
});

/**
 * @summary Get performance highlights — best ROAS, worst CPA, most sales, decision counts
 */
export const GetPerformanceSummaryQueryParams = zod.object({
  dateFilter: zod.enum(["daily", "weekly", "monthly", "all"]).optional(),
});

export const GetPerformanceSummaryResponse = zod.object({
  bestRoas: zod
    .object({
      name: zod.string(),
      roas: zod.number(),
      commission: zod.number(),
    })
    .nullish(),
  worstCpa: zod
    .object({
      name: zod.string(),
      cpa: zod.number(),
      spend: zod.number(),
      totalSales: zod.number(),
    })
    .nullish(),
  mostSales: zod
    .object({
      name: zod.string(),
      totalSales: zod.number(),
      roas: zod.number(),
    })
    .nullish(),
  decisions: zod.object({
    ESCALAR: zod.number(),
    MONITORAR: zod.number(),
    PAUSAR: zod.number(),
  }),
  totalCreatives: zod.number(),
});

/**
 * @summary Get chart data aggregated by date
 */
export const GetDashboardChartsQueryParams = zod.object({
  dateFilter: zod.enum(["daily", "weekly", "monthly", "all"]).optional(),
});

export const GetDashboardChartsResponseItem = zod.object({
  date: zod.string(),
  roas: zod.number(),
  cpa: zod.number(),
  totalSales: zod.number(),
  spend: zod.number(),
  commission: zod.number(),
});
export const GetDashboardChartsResponse = zod.array(
  GetDashboardChartsResponseItem,
);

/**
 * @summary Receive Payt sale postback and update creative sales
 */
export const HandlePaytWebhookBody = zod.object({
  integration_key: zod.string().optional(),
  transaction_id: zod.string().optional(),
  status: zod.string(),
  type: zod.string().optional(),
  test: zod.boolean().optional(),
  utm_content: zod.string().optional(),
});

export const HandlePaytWebhookResponse = zod.object({
  ok: zod.boolean(),
  reason: zod.string().optional(),
  creativeId: zod.number().optional(),
  planField: zod.string().optional(),
  delta: zod.number().optional(),
});

/**
 * @summary Simulate a sale for testing purposes (no auth required)
 */
export const SimulateSaleBody = zod.object({
  utmContent: zod
    .string()
    .optional()
    .describe(
      "utm_content value in `userId::creativeName` format (mirrors the real Payt webhook). When provided, `creativeName` and `userId` are ignored.\n",
    ),
  creativeName: zod
    .string()
    .optional()
    .describe("Creative name (used when utmContent is not provided)"),
  plan: zod.enum(["2m", "3m", "5m", "7m", "9m", "12m", "16m", "20m"]),
  cancelled: zod.boolean().optional(),
  userId: zod
    .string()
    .optional()
    .describe(
      "Optional Clerk userId to scope the lookup when using creativeName directly. Ignored when utmContent is provided.\n",
    ),
});

export const SimulateSaleResponse = zod.object({
  ok: zod.boolean(),
  reason: zod.string().optional(),
  creativeId: zod.number().optional(),
  planField: zod.string().optional(),
  delta: zod.number().optional(),
});

```

---

## React Query Hooks (gerado)

**Arquivo:** `lib/api-client-react/src/generated/api.ts`

```typescript
/**
 * Generated by orval v8.5.3 🍺
 * Do not edit manually.
 * Api
 * API specification for Creatives Performance Dashboard
 * OpenAPI spec version: 0.1.0
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MutationFunction,
  QueryFunction,
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";

import type {
  AnalysisResult,
  ChartDataPoint,
  CreateCreativeBody,
  CreativeWithMetrics,
  DashboardSummary,
  DecisionBreakdown,
  ErrorResponse,
  GetCreativeChartParams,
  GetDashboardChartsParams,
  GetDashboardSummaryParams,
  GetDecisionBreakdownParams,
  GetPerformanceSummaryParams,
  HealthStatus,
  ListCreativesParams,
  PaytWebhookPayload,
  PerformanceSummary,
  SimulateSaleBody,
  WebhookResponse,
} from "./api.schemas";

import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;

type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;

type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

/**
 * Returns server health status
 * @summary Health check
 */
export const getHealthCheckUrl = () => {
  return `/api/healthz`;
};

export const healthCheck = async (
  options?: RequestInit,
): Promise<HealthStatus> => {
  return customFetch<HealthStatus>(getHealthCheckUrl(), {
    ...options,
    method: "GET",
  });
};

export const getHealthCheckQueryKey = () => {
  return [`/api/healthz`] as const;
};

export const getHealthCheckQueryOptions = <
  TData = Awaited<ReturnType<typeof healthCheck>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof healthCheck>>,
    TError,
    TData
  >;
  request?: SecondParameter<typeof customFetch>;
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};

  const queryKey = queryOptions?.queryKey ?? getHealthCheckQueryKey();

  const queryFn: QueryFunction<Awaited<ReturnType<typeof healthCheck>>> = ({
    signal,
  }) => healthCheck({ signal, ...requestOptions });

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof healthCheck>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export type HealthCheckQueryResult = NonNullable<
  Awaited<ReturnType<typeof healthCheck>>
>;
export type HealthCheckQueryError = ErrorType<unknown>;

/**
 * @summary Health check
 */

export function useHealthCheck<
  TData = Awaited<ReturnType<typeof healthCheck>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof healthCheck>>,
    TError,
    TData
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getHealthCheckQueryOptions(options);

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };

  return { ...query, queryKey: queryOptions.queryKey };
}

/**
 * @summary List all creatives
 */
export const getListCreativesUrl = (params?: ListCreativesParams) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? "null" : value.toString());
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0
    ? `/api/creatives?${stringifiedParams}`
    : `/api/creatives`;
};

export const listCreatives = async (
  params?: ListCreativesParams,
  options?: RequestInit,
): Promise<CreativeWithMetrics[]> => {
  return customFetch<CreativeWithMetrics[]>(getListCreativesUrl(params), {
    ...options,
    method: "GET",
  });
};

export const getListCreativesQueryKey = (params?: ListCreativesParams) => {
  return [`/api/creatives`, ...(params ? [params] : [])] as const;
};

export const getListCreativesQueryOptions = <
  TData = Awaited<ReturnType<typeof listCreatives>>,
  TError = ErrorType<unknown>,
>(
  params?: ListCreativesParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof listCreatives>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};

  const queryKey = queryOptions?.queryKey ?? getListCreativesQueryKey(params);

  const queryFn: QueryFunction<Awaited<ReturnType<typeof listCreatives>>> = ({
    signal,
  }) => listCreatives(params, { signal, ...requestOptions });

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof listCreatives>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export type ListCreativesQueryResult = NonNullable<
  Awaited<ReturnType<typeof listCreatives>>
>;
export type ListCreativesQueryError = ErrorType<unknown>;

/**
 * @summary List all creatives
 */

export function useListCreatives<
  TData = Awaited<ReturnType<typeof listCreatives>>,
  TError = ErrorType<unknown>,
>(
  params?: ListCreativesParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof listCreatives>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getListCreativesQueryOptions(params, options);

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };

  return { ...query, queryKey: queryOptions.queryKey };
}

/**
 * @summary Create a new creative
 */
export const getCreateCreativeUrl = () => {
  return `/api/creatives`;
};

export const createCreative = async (
  createCreativeBody: CreateCreativeBody,
  options?: RequestInit,
): Promise<CreativeWithMetrics> => {
  return customFetch<CreativeWithMetrics>(getCreateCreativeUrl(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(createCreativeBody),
  });
};

export const getCreateCreativeMutationOptions = <
  TError = ErrorType<ErrorResponse>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof createCreative>>,
    TError,
    { data: BodyType<CreateCreativeBody> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof createCreative>>,
  TError,
  { data: BodyType<CreateCreativeBody> },
  TContext
> => {
  const mutationKey = ["createCreative"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation &&
      "mutationKey" in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof createCreative>>,
    { data: BodyType<CreateCreativeBody> }
  > = (props) => {
    const { data } = props ?? {};

    return createCreative(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export type CreateCreativeMutationResult = NonNullable<
  Awaited<ReturnType<typeof createCreative>>
>;
export type CreateCreativeMutationBody = BodyType<CreateCreativeBody>;
export type CreateCreativeMutationError = ErrorType<ErrorResponse>;

/**
 * @summary Create a new creative
 */
export const useCreateCreative = <
  TError = ErrorType<ErrorResponse>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof createCreative>>,
    TError,
    { data: BodyType<CreateCreativeBody> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<
  Awaited<ReturnType<typeof createCreative>>,
  TError,
  { data: BodyType<CreateCreativeBody> },
  TContext
> => {
  return useMutation(getCreateCreativeMutationOptions(options));
};

/**
 * @summary Get a creative by ID
 */
export const getGetCreativeUrl = (id: number) => {
  return `/api/creatives/${id}`;
};

export const getCreative = async (
  id: number,
  options?: RequestInit,
): Promise<CreativeWithMetrics> => {
  return customFetch<CreativeWithMetrics>(getGetCreativeUrl(id), {
    ...options,
    method: "GET",
  });
};

export const getGetCreativeQueryKey = (id: number) => {
  return [`/api/creatives/${id}`] as const;
};

export const getGetCreativeQueryOptions = <
  TData = Awaited<ReturnType<typeof getCreative>>,
  TError = ErrorType<ErrorResponse>,
>(
  id: number,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getCreative>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};

  const queryKey = queryOptions?.queryKey ?? getGetCreativeQueryKey(id);

  const queryFn: QueryFunction<Awaited<ReturnType<typeof getCreative>>> = ({
    signal,
  }) => getCreative(id, { signal, ...requestOptions });

  return {
    queryKey,
    queryFn,
    enabled: !!id,
    ...queryOptions,
  } as UseQueryOptions<
    Awaited<ReturnType<typeof getCreative>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export type GetCreativeQueryResult = NonNullable<
  Awaited<ReturnType<typeof getCreative>>
>;
export type GetCreativeQueryError = ErrorType<ErrorResponse>;

/**
 * @summary Get a creative by ID
 */

export function useGetCreative<
  TData = Awaited<ReturnType<typeof getCreative>>,
  TError = ErrorType<ErrorResponse>,
>(
  id: number,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getCreative>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetCreativeQueryOptions(id, options);

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };

  return { ...query, queryKey: queryOptions.queryKey };
}

/**
 * @summary Update a creative
 */
export const getUpdateCreativeUrl = (id: number) => {
  return `/api/creatives/${id}`;
};

export const updateCreative = async (
  id: number,
  createCreativeBody: CreateCreativeBody,
  options?: RequestInit,
): Promise<CreativeWithMetrics> => {
  return customFetch<CreativeWithMetrics>(getUpdateCreativeUrl(id), {
    ...options,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(createCreativeBody),
  });
};

export const getUpdateCreativeMutationOptions = <
  TError = ErrorType<ErrorResponse>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof updateCreative>>,
    TError,
    { id: number; data: BodyType<CreateCreativeBody> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof updateCreative>>,
  TError,
  { id: number; data: BodyType<CreateCreativeBody> },
  TContext
> => {
  const mutationKey = ["updateCreative"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation &&
      "mutationKey" in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof updateCreative>>,
    { id: number; data: BodyType<CreateCreativeBody> }
  > = (props) => {
    const { id, data } = props ?? {};

    return updateCreative(id, data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export type UpdateCreativeMutationResult = NonNullable<
  Awaited<ReturnType<typeof updateCreative>>
>;
export type UpdateCreativeMutationBody = BodyType<CreateCreativeBody>;
export type UpdateCreativeMutationError = ErrorType<ErrorResponse>;

/**
 * @summary Update a creative
 */
export const useUpdateCreative = <
  TError = ErrorType<ErrorResponse>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof updateCreative>>,
    TError,
    { id: number; data: BodyType<CreateCreativeBody> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<
  Awaited<ReturnType<typeof updateCreative>>,
  TError,
  { id: number; data: BodyType<CreateCreativeBody> },
  TContext
> => {
  return useMutation(getUpdateCreativeMutationOptions(options));
};

/**
 * @summary Delete a creative
 */
export const getDeleteCreativeUrl = (id: number) => {
  return `/api/creatives/${id}`;
};

export const deleteCreative = async (
  id: number,
  options?: RequestInit,
): Promise<void> => {
  return customFetch<void>(getDeleteCreativeUrl(id), {
    ...options,
    method: "DELETE",
  });
};

export const getDeleteCreativeMutationOptions = <
  TError = ErrorType<ErrorResponse>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof deleteCreative>>,
    TError,
    { id: number },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof deleteCreative>>,
  TError,
  { id: number },
  TContext
> => {
  const mutationKey = ["deleteCreative"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation &&
      "mutationKey" in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof deleteCreative>>,
    { id: number }
  > = (props) => {
    const { id } = props ?? {};

    return deleteCreative(id, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export type DeleteCreativeMutationResult = NonNullable<
  Awaited<ReturnType<typeof deleteCreative>>
>;

export type DeleteCreativeMutationError = ErrorType<ErrorResponse>;

/**
 * @summary Delete a creative
 */
export const useDeleteCreative = <
  TError = ErrorType<ErrorResponse>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof deleteCreative>>,
    TError,
    { id: number },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<
  Awaited<ReturnType<typeof deleteCreative>>,
  TError,
  { id: number },
  TContext
> => {
  return useMutation(getDeleteCreativeMutationOptions(options));
};

/**
 * @summary Sales over time for a creative (grouped by date, matched by name)
 */
export const getGetCreativeChartUrl = (
  id: number,
  params?: GetCreativeChartParams,
) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? "null" : value.toString());
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0
    ? `/api/creatives/${id}/chart?${stringifiedParams}`
    : `/api/creatives/${id}/chart`;
};

export const getCreativeChart = async (
  id: number,
  params?: GetCreativeChartParams,
  options?: RequestInit,
): Promise<ChartDataPoint[]> => {
  return customFetch<ChartDataPoint[]>(getGetCreativeChartUrl(id, params), {
    ...options,
    method: "GET",
  });
};

export const getGetCreativeChartQueryKey = (
  id: number,
  params?: GetCreativeChartParams,
) => {
  return [`/api/creatives/${id}/chart`, ...(params ? [params] : [])] as const;
};

export const getGetCreativeChartQueryOptions = <
  TData = Awaited<ReturnType<typeof getCreativeChart>>,
  TError = ErrorType<ErrorResponse>,
>(
  id: number,
  params?: GetCreativeChartParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getCreativeChart>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};

  const queryKey =
    queryOptions?.queryKey ?? getGetCreativeChartQueryKey(id, params);

  const queryFn: QueryFunction<
    Awaited<ReturnType<typeof getCreativeChart>>
  > = ({ signal }) =>
    getCreativeChart(id, params, { signal, ...requestOptions });

  return {
    queryKey,
    queryFn,
    enabled: !!id,
    ...queryOptions,
  } as UseQueryOptions<
    Awaited<ReturnType<typeof getCreativeChart>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export type GetCreativeChartQueryResult = NonNullable<
  Awaited<ReturnType<typeof getCreativeChart>>
>;
export type GetCreativeChartQueryError = ErrorType<ErrorResponse>;

/**
 * @summary Sales over time for a creative (grouped by date, matched by name)
 */

export function useGetCreativeChart<
  TData = Awaited<ReturnType<typeof getCreativeChart>>,
  TError = ErrorType<ErrorResponse>,
>(
  id: number,
  params?: GetCreativeChartParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getCreativeChart>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetCreativeChartQueryOptions(id, params, options);

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };

  return { ...query, queryKey: queryOptions.queryKey };
}

/**
 * @summary AI analysis of a creative's performance
 */
export const getAnalyzeCreativeUrl = (id: number) => {
  return `/api/creatives/${id}/analyze`;
};

export const analyzeCreative = async (
  id: number,
  options?: RequestInit,
): Promise<AnalysisResult> => {
  return customFetch<AnalysisResult>(getAnalyzeCreativeUrl(id), {
    ...options,
    method: "POST",
  });
};

export const getAnalyzeCreativeMutationOptions = <
  TError = ErrorType<ErrorResponse>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof analyzeCreative>>,
    TError,
    { id: number },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof analyzeCreative>>,
  TError,
  { id: number },
  TContext
> => {
  const mutationKey = ["analyzeCreative"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation &&
      "mutationKey" in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof analyzeCreative>>,
    { id: number }
  > = (props) => {
    const { id } = props ?? {};

    return analyzeCreative(id, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export type AnalyzeCreativeMutationResult = NonNullable<
  Awaited<ReturnType<typeof analyzeCreative>>
>;

export type AnalyzeCreativeMutationError = ErrorType<ErrorResponse>;

/**
 * @summary AI analysis of a creative's performance
 */
export const useAnalyzeCreative = <
  TError = ErrorType<ErrorResponse>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof analyzeCreative>>,
    TError,
    { id: number },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<
  Awaited<ReturnType<typeof analyzeCreative>>,
  TError,
  { id: number },
  TContext
> => {
  return useMutation(getAnalyzeCreativeMutationOptions(options));
};

/**
 * @summary Get dashboard KPI summary
 */
export const getGetDashboardSummaryUrl = (
  params?: GetDashboardSummaryParams,
) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? "null" : value.toString());
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0
    ? `/api/dashboard/summary?${stringifiedParams}`
    : `/api/dashboard/summary`;
};

export const getDashboardSummary = async (
  params?: GetDashboardSummaryParams,
  options?: RequestInit,
): Promise<DashboardSummary> => {
  return customFetch<DashboardSummary>(getGetDashboardSummaryUrl(params), {
    ...options,
    method: "GET",
  });
};

export const getGetDashboardSummaryQueryKey = (
  params?: GetDashboardSummaryParams,
) => {
  return [`/api/dashboard/summary`, ...(params ? [params] : [])] as const;
};

export const getGetDashboardSummaryQueryOptions = <
  TData = Awaited<ReturnType<typeof getDashboardSummary>>,
  TError = ErrorType<unknown>,
>(
  params?: GetDashboardSummaryParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getDashboardSummary>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};

  const queryKey =
    queryOptions?.queryKey ?? getGetDashboardSummaryQueryKey(params);

  const queryFn: QueryFunction<
    Awaited<ReturnType<typeof getDashboardSummary>>
  > = ({ signal }) =>
    getDashboardSummary(params, { signal, ...requestOptions });

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getDashboardSummary>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export type GetDashboardSummaryQueryResult = NonNullable<
  Awaited<ReturnType<typeof getDashboardSummary>>
>;
export type GetDashboardSummaryQueryError = ErrorType<unknown>;

/**
 * @summary Get dashboard KPI summary
 */

export function useGetDashboardSummary<
  TData = Awaited<ReturnType<typeof getDashboardSummary>>,
  TError = ErrorType<unknown>,
>(
  params?: GetDashboardSummaryParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getDashboardSummary>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetDashboardSummaryQueryOptions(params, options);

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };

  return { ...query, queryKey: queryOptions.queryKey };
}

/**
 * @summary Count of creatives per decision
 */
export const getGetDecisionBreakdownUrl = (
  params?: GetDecisionBreakdownParams,
) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? "null" : value.toString());
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0
    ? `/api/dashboard/decision-breakdown?${stringifiedParams}`
    : `/api/dashboard/decision-breakdown`;
};

export const getDecisionBreakdown = async (
  params?: GetDecisionBreakdownParams,
  options?: RequestInit,
): Promise<DecisionBreakdown> => {
  return customFetch<DecisionBreakdown>(getGetDecisionBreakdownUrl(params), {
    ...options,
    method: "GET",
  });
};

export const getGetDecisionBreakdownQueryKey = (
  params?: GetDecisionBreakdownParams,
) => {
  return [
    `/api/dashboard/decision-breakdown`,
    ...(params ? [params] : []),
  ] as const;
};

export const getGetDecisionBreakdownQueryOptions = <
  TData = Awaited<ReturnType<typeof getDecisionBreakdown>>,
  TError = ErrorType<unknown>,
>(
  params?: GetDecisionBreakdownParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getDecisionBreakdown>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};

  const queryKey =
    queryOptions?.queryKey ?? getGetDecisionBreakdownQueryKey(params);

  const queryFn: QueryFunction<
    Awaited<ReturnType<typeof getDecisionBreakdown>>
  > = ({ signal }) =>
    getDecisionBreakdown(params, { signal, ...requestOptions });

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getDecisionBreakdown>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export type GetDecisionBreakdownQueryResult = NonNullable<
  Awaited<ReturnType<typeof getDecisionBreakdown>>
>;
export type GetDecisionBreakdownQueryError = ErrorType<unknown>;

/**
 * @summary Count of creatives per decision
 */

export function useGetDecisionBreakdown<
  TData = Awaited<ReturnType<typeof getDecisionBreakdown>>,
  TError = ErrorType<unknown>,
>(
  params?: GetDecisionBreakdownParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getDecisionBreakdown>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetDecisionBreakdownQueryOptions(params, options);

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };

  return { ...query, queryKey: queryOptions.queryKey };
}

/**
 * @summary Get performance highlights — best ROAS, worst CPA, most sales, decision counts
 */
export const getGetPerformanceSummaryUrl = (
  params?: GetPerformanceSummaryParams,
) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? "null" : value.toString());
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0
    ? `/api/dashboard/performance-summary?${stringifiedParams}`
    : `/api/dashboard/performance-summary`;
};

export const getPerformanceSummary = async (
  params?: GetPerformanceSummaryParams,
  options?: RequestInit,
): Promise<PerformanceSummary> => {
  return customFetch<PerformanceSummary>(getGetPerformanceSummaryUrl(params), {
    ...options,
    method: "GET",
  });
};

export const getGetPerformanceSummaryQueryKey = (
  params?: GetPerformanceSummaryParams,
) => {
  return [
    `/api/dashboard/performance-summary`,
    ...(params ? [params] : []),
  ] as const;
};

export const getGetPerformanceSummaryQueryOptions = <
  TData = Awaited<ReturnType<typeof getPerformanceSummary>>,
  TError = ErrorType<unknown>,
>(
  params?: GetPerformanceSummaryParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getPerformanceSummary>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};

  const queryKey =
    queryOptions?.queryKey ?? getGetPerformanceSummaryQueryKey(params);

  const queryFn: QueryFunction<
    Awaited<ReturnType<typeof getPerformanceSummary>>
  > = ({ signal }) =>
    getPerformanceSummary(params, { signal, ...requestOptions });

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getPerformanceSummary>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export type GetPerformanceSummaryQueryResult = NonNullable<
  Awaited<ReturnType<typeof getPerformanceSummary>>
>;
export type GetPerformanceSummaryQueryError = ErrorType<unknown>;

/**
 * @summary Get performance highlights — best ROAS, worst CPA, most sales, decision counts
 */

export function useGetPerformanceSummary<
  TData = Awaited<ReturnType<typeof getPerformanceSummary>>,
  TError = ErrorType<unknown>,
>(
  params?: GetPerformanceSummaryParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getPerformanceSummary>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetPerformanceSummaryQueryOptions(params, options);

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };

  return { ...query, queryKey: queryOptions.queryKey };
}

/**
 * @summary Get chart data aggregated by date
 */
export const getGetDashboardChartsUrl = (params?: GetDashboardChartsParams) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? "null" : value.toString());
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0
    ? `/api/dashboard/charts?${stringifiedParams}`
    : `/api/dashboard/charts`;
};

export const getDashboardCharts = async (
  params?: GetDashboardChartsParams,
  options?: RequestInit,
): Promise<ChartDataPoint[]> => {
  return customFetch<ChartDataPoint[]>(getGetDashboardChartsUrl(params), {
    ...options,
    method: "GET",
  });
};

export const getGetDashboardChartsQueryKey = (
  params?: GetDashboardChartsParams,
) => {
  return [`/api/dashboard/charts`, ...(params ? [params] : [])] as const;
};

export const getGetDashboardChartsQueryOptions = <
  TData = Awaited<ReturnType<typeof getDashboardCharts>>,
  TError = ErrorType<unknown>,
>(
  params?: GetDashboardChartsParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getDashboardCharts>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};

  const queryKey =
    queryOptions?.queryKey ?? getGetDashboardChartsQueryKey(params);

  const queryFn: QueryFunction<
    Awaited<ReturnType<typeof getDashboardCharts>>
  > = ({ signal }) => getDashboardCharts(params, { signal, ...requestOptions });

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getDashboardCharts>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export type GetDashboardChartsQueryResult = NonNullable<
  Awaited<ReturnType<typeof getDashboardCharts>>
>;
export type GetDashboardChartsQueryError = ErrorType<unknown>;

/**
 * @summary Get chart data aggregated by date
 */

export function useGetDashboardCharts<
  TData = Awaited<ReturnType<typeof getDashboardCharts>>,
  TError = ErrorType<unknown>,
>(
  params?: GetDashboardChartsParams,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getDashboardCharts>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetDashboardChartsQueryOptions(params, options);

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };

  return { ...query, queryKey: queryOptions.queryKey };
}

/**
 * @summary Receive Payt sale postback and update creative sales
 */
export const getHandlePaytWebhookUrl = () => {
  return `/api/webhooks/payt`;
};

export const handlePaytWebhook = async (
  paytWebhookPayload: PaytWebhookPayload,
  options?: RequestInit,
): Promise<WebhookResponse> => {
  return customFetch<WebhookResponse>(getHandlePaytWebhookUrl(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(paytWebhookPayload),
  });
};

export const getHandlePaytWebhookMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof handlePaytWebhook>>,
    TError,
    { data: BodyType<PaytWebhookPayload> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof handlePaytWebhook>>,
  TError,
  { data: BodyType<PaytWebhookPayload> },
  TContext
> => {
  const mutationKey = ["handlePaytWebhook"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation &&
      "mutationKey" in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof handlePaytWebhook>>,
    { data: BodyType<PaytWebhookPayload> }
  > = (props) => {
    const { data } = props ?? {};

    return handlePaytWebhook(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export type HandlePaytWebhookMutationResult = NonNullable<
  Awaited<ReturnType<typeof handlePaytWebhook>>
>;
export type HandlePaytWebhookMutationBody = BodyType<PaytWebhookPayload>;
export type HandlePaytWebhookMutationError = ErrorType<unknown>;

/**
 * @summary Receive Payt sale postback and update creative sales
 */
export const useHandlePaytWebhook = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof handlePaytWebhook>>,
    TError,
    { data: BodyType<PaytWebhookPayload> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<
  Awaited<ReturnType<typeof handlePaytWebhook>>,
  TError,
  { data: BodyType<PaytWebhookPayload> },
  TContext
> => {
  return useMutation(getHandlePaytWebhookMutationOptions(options));
};

/**
 * @summary Simulate a sale for testing purposes (no auth required)
 */
export const getSimulateSaleUrl = () => {
  return `/api/webhooks/simulate`;
};

export const simulateSale = async (
  simulateSaleBody: SimulateSaleBody,
  options?: RequestInit,
): Promise<WebhookResponse> => {
  return customFetch<WebhookResponse>(getSimulateSaleUrl(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(simulateSaleBody),
  });
};

export const getSimulateSaleMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof simulateSale>>,
    TError,
    { data: BodyType<SimulateSaleBody> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof simulateSale>>,
  TError,
  { data: BodyType<SimulateSaleBody> },
  TContext
> => {
  const mutationKey = ["simulateSale"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation &&
      "mutationKey" in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof simulateSale>>,
    { data: BodyType<SimulateSaleBody> }
  > = (props) => {
    const { data } = props ?? {};

    return simulateSale(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export type SimulateSaleMutationResult = NonNullable<
  Awaited<ReturnType<typeof simulateSale>>
>;
export type SimulateSaleMutationBody = BodyType<SimulateSaleBody>;
export type SimulateSaleMutationError = ErrorType<unknown>;

/**
 * @summary Simulate a sale for testing purposes (no auth required)
 */
export const useSimulateSale = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof simulateSale>>,
    TError,
    { data: BodyType<SimulateSaleBody> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<
  Awaited<ReturnType<typeof simulateSale>>,
  TError,
  { data: BodyType<SimulateSaleBody> },
  TContext
> => {
  return useMutation(getSimulateSaleMutationOptions(options));
};

```

---

## Backend — app.ts

**Arquivo:** `artifacts/api-server/src/app.ts`

```typescript
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;

```

---

## Backend — routes/creatives.ts

**Arquivo:** `artifacts/api-server/src/routes/creatives.ts`

```typescript
import { Router } from "express";
import { db, creativesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateCreativeBody,
  ListCreativesQueryParams,
  GetCreativeParams,
  UpdateCreativeBody,
  UpdateCreativeParams,
  DeleteCreativeParams,
  AnalyzeCreativeParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// Commission values (BRL) at 54% base rate — Rosa Oriental / Payt affiliate table
const COMMISSION_RATES = {
  sales2m: 161.38,
  sales3m: 187.38,
  sales5m: 241.38,
  sales7m: 295.38,
  sales9m: 376.38,
  sales12m: 484.38,
  sales16m: 562.38,
  sales20m: 1026.38,
} as const;

function computeCommission(c: {
  sales2m: number; sales3m: number; sales5m: number; sales7m: number;
  sales9m: number; sales12m: number; sales16m: number; sales20m: number;
}): number {
  return (
    c.sales2m * 161.38 + c.sales3m * 187.38 +
    c.sales5m * 241.38 + c.sales7m * 295.38 + c.sales9m * 376.38 +
    c.sales12m * 484.38 + c.sales16m * 562.38 + c.sales20m * 1026.38
  );
}

function computeTotalSales(c: {
  sales2m: number; sales3m: number; sales5m: number; sales7m: number;
  sales9m: number; sales12m: number; sales16m: number; sales20m: number;
}): number {
  return c.sales2m + c.sales3m + c.sales5m + c.sales7m + c.sales9m + c.sales12m + c.sales16m + c.sales20m;
}

function computeDecision(roas: number, _cpa: number, daysWithoutSales: number): {
  decision: "ESCALAR" | "MONITORAR" | "PAUSAR";
  monitorarReason: "lucrativo" | "decaindo" | null;
  pausarReason: "semVendas" | "prejuizo" | null;
} {
  // Corte por dias sem venda — independente do ROAS:
  // 3+ dias = corte sempre; 2 dias = corte exceto ROAS >= 3.5 (ganha 1 dia extra)
  if (daysWithoutSales >= 3) return { decision: "PAUSAR", monitorarReason: null, pausarReason: "semVendas" };
  if (daysWithoutSales >= 2 && roas < 3.5) return { decision: "PAUSAR", monitorarReason: null, pausarReason: "semVendas" };
  if (daysWithoutSales >= 2 && roas >= 3.5) return { decision: "MONITORAR", monitorarReason: "decaindo", pausarReason: null };

  if (roas >= 2 && daysWithoutSales === 0) return { decision: "ESCALAR", monitorarReason: null, pausarReason: null };
  if (roas >= 1) {
    const reason = daysWithoutSales === 1 ? "decaindo" : "lucrativo";
    return { decision: "MONITORAR", monitorarReason: reason, pausarReason: null };
  }
  return { decision: "PAUSAR", monitorarReason: null, pausarReason: "prejuizo" };
}

// Desempenho score — regra de corte por dias sem venda:
// 3+ dias = corte sempre; 2 dias = corte se ROAS < 3.5 (ROAS alto ganha 1 dia extra)
// CPA cresce a cada dia parado → criativo "sobrevivendo", prestes a morrer
function computePredictability(
  roas: number,
  _cpa: number,
  daysWithoutSales: number,
  totalSales: number
): { score: number; label: "EXCELENTE" | "BOM" | "RUIM" } {
  if (totalSales === 0) return { score: 0, label: "RUIM" };

  // Casos de corte direto → RUIM (mesmo com ROAS alto)
  const isCut = daysWithoutSales >= 3 || (daysWithoutSales >= 2 && roas < 3.5);
  if (isCut) {
    const partialRoas = roas >= 2 ? 50 : roas >= 1.5 ? 30 : roas >= 1 ? 15 : 0;
    return { score: Math.min(partialRoas, 30), label: "RUIM" };
  }

  // ROAS component (0–60 pts) — principal driver no modelo x1
  let roasScore = 0;
  if (roas >= 3.5) roasScore = 60;
  else if (roas >= 3) roasScore = 55;
  else if (roas >= 2) roasScore = 50;
  else if (roas >= 1.5) roasScore = 30;
  else if (roas >= 1) roasScore = 15;

  // Consistência (0–40 pts)
  // 2 dias sem venda com ROAS >= 3.5: tolerado mas sinal de alerta (max 8 pts → fica em BOM)
  let consistencyScore = 0;
  if (daysWithoutSales === 0) consistencyScore = 40;
  else if (daysWithoutSales === 1) consistencyScore = 30;
  else if (daysWithoutSales === 2) consistencyScore = 8; // só chegou aqui se ROAS >= 3.5

  const score = Math.min(100, roasScore + consistencyScore);

  // ROAS < 1 = prejuízo, sempre RUIM
  if (roas < 1) return { score: Math.min(score, 20), label: "RUIM" };

  const label = score >= 70 ? "EXCELENTE" : score >= 40 ? "BOM" : "RUIM";
  return { score, label };
}

function filterByDateRange(date: string, dateFilter?: string): boolean {
  if (!dateFilter || dateFilter === "all") return true;
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const d = new Date(date + "T00:00:00");
  if (dateFilter === "daily") {
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }
  if (dateFilter === "weekly") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    return d >= cutoff;
  }
  if (dateFilter === "monthly") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 15);
    return d >= cutoff;
  }
  return true;
}

function withMetrics(c: typeof creativesTable.$inferSelect) {
  const commission = computeCommission(c);
  const totalSales = computeTotalSales(c);
  const roas = c.spend > 0 ? Math.round((commission / c.spend) * 100) / 100 : 0;
  const cpa = totalSales > 0 ? Math.round((c.spend / totalSales) * 100) / 100 : 0;
  const { decision, monitorarReason, pausarReason } = computeDecision(roas, cpa, c.daysWithoutSales);
  const { score: predictabilityScore, label: predictabilityLabel } = computePredictability(roas, cpa, c.daysWithoutSales, totalSales);
  return {
    id: c.id,
    name: c.name,
    date: c.date,
    spend: c.spend,
    sales5m: c.sales5m,
    sales7m: c.sales7m,
    sales9m: c.sales9m,
    sales12m: c.sales12m,
    sales16m: c.sales16m,
    sales20m: c.sales20m,
    ctr: c.ctr,
    daysWithoutSales: c.daysWithoutSales,
    commission: Math.round(commission * 100) / 100,
    roas,
    cpa,
    totalSales,
    predictabilityScore,
    predictabilityLabel,
    decision,
    monitorarReason,
    pausarReason,
  };
}

// GET /creatives
router.get("/creatives", requireAuth, async (req, res) => {
  const parseResult = ListCreativesQueryParams.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const userId = (req as typeof req & { userId: string }).userId;
  const { decision, sortBy, sortOrder, dateFilter } = parseResult.data;
  const rows = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));
  let results = rows
    .filter(r => filterByDateRange(r.date, dateFilter))
    .map(withMetrics);

  if (decision) results = results.filter(c => c.decision === decision);

  if (sortBy) {
    const order = sortOrder === "asc" ? 1 : -1;
    results.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] as number | string;
      const bVal = b[sortBy as keyof typeof b] as number | string;
      if (typeof aVal === "string" && typeof bVal === "string") return aVal.localeCompare(bVal) * order;
      return ((aVal as number) - (bVal as number)) * order;
    });
  }

  res.json(results);
});

// POST /creatives
router.post("/creatives", requireAuth, async (req, res) => {
  const parseResult = CreateCreativeBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.message });
    return;
  }

  const userId = (req as typeof req & { userId: string }).userId;
  const data = parseResult.data;
  const [created] = await db.insert(creativesTable).values({
    userId,
    name: data.name,
    date: data.date,
    spend: data.spend,
    sales5m: data.sales5m,
    sales7m: data.sales7m,
    sales9m: data.sales9m,
    sales12m: data.sales12m,
    sales16m: data.sales16m,
    sales20m: data.sales20m,
    ctr: data.ctr,
    hookRate: 0,
    daysWithoutSales: data.daysWithoutSales,
  }).returning();

  res.status(201).json(withMetrics(created));
});

// GET /creatives/:id
router.get("/creatives/:id", requireAuth, async (req, res) => {
  const parseResult = GetCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const userId = (req as typeof req & { userId: string }).userId;
  const [row] = await db.select().from(creativesTable).where(
    and(eq(creativesTable.id, parseResult.data.id), eq(creativesTable.userId, userId))
  );
  if (!row) { res.status(404).json({ error: "Criativo não encontrado" }); return; }

  res.json(withMetrics(row));
});

// PUT /creatives/:id
router.put("/creatives/:id", requireAuth, async (req, res) => {
  const paramsResult = UpdateCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!paramsResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const bodyResult = UpdateCreativeBody.safeParse(req.body);
  if (!bodyResult.success) { res.status(400).json({ error: bodyResult.error.message }); return; }

  const userId = (req as typeof req & { userId: string }).userId;
  const data = bodyResult.data;
  const [updated] = await db.update(creativesTable).set({
    name: data.name,
    date: data.date,
    spend: data.spend,
    sales5m: data.sales5m,
    sales7m: data.sales7m,
    sales9m: data.sales9m,
    sales12m: data.sales12m,
    sales16m: data.sales16m,
    sales20m: data.sales20m,
    ctr: data.ctr,
    daysWithoutSales: data.daysWithoutSales,
  }).where(and(eq(creativesTable.id, paramsResult.data.id), eq(creativesTable.userId, userId))).returning();

  if (!updated) { res.status(404).json({ error: "Criativo não encontrado" }); return; }
  res.json(withMetrics(updated));
});

// DELETE /creatives/:id
router.delete("/creatives/:id", requireAuth, async (req, res) => {
  const parseResult = DeleteCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const userId = (req as typeof req & { userId: string }).userId;
  const [deleted] = await db.delete(creativesTable).where(
    and(eq(creativesTable.id, parseResult.data.id), eq(creativesTable.userId, userId))
  ).returning();
  if (!deleted) { res.status(404).json({ error: "Criativo não encontrado" }); return; }

  res.status(204).send();
});

function generateSyntheticHistory(
  baseDate: string,
  decision: "ESCALAR" | "MONITORAR" | "PAUSAR",
  monitorarReason: "lucrativo" | "decaindo" | null,
  daysWithoutSales: number,
  totalSales: number,
): Array<{ date: string; totalSales: number; roas: number; cpa: number; spend: number; commission: number }> {
  let pattern: number[];

  if (decision === "ESCALAR") {
    // Growing trend — starts slow, accelerates
    const t = Math.max(1, totalSales);
    pattern = [0, 1, 1, Math.floor(t * 0.5), Math.ceil(t * 0.7), Math.ceil(t * 0.9), t];
  } else if (decision === "PAUSAR") {
    // Declining then flat-zero for the last daysWithoutSales days
    const zeros = Math.min(daysWithoutSales, 4);
    const active = 7 - zeros;
    const rising = [2, 3, 2, 3, 2, 1, 1].slice(0, active);
    pattern = [...rising, ...Array(zeros).fill(0)];
    while (pattern.length < 7) pattern.unshift(2);
    pattern = pattern.slice(-7);
  } else if (monitorarReason === "decaindo") {
    // Was strong, then the last day drops to 0
    const t = Math.max(2, totalSales);
    pattern = [t, t + 1, t, t + 1, t + 1, t, 0];
  } else {
    // MONITORAR lucrativo — moderate, consistent, below 2x threshold
    const t = Math.max(1, totalSales);
    pattern = [0, 1, t, 1, t, t, t];
  }

  // Always anchor to today so all creatives share the same 30/04 → today window
  const end = new Date();
  end.setUTCHours(12, 0, 0, 0);
  return pattern.map((sales, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    return {
      date: d.toISOString().split("T")[0],
      totalSales: sales,
      roas: 0, cpa: 0, spend: 0, commission: 0,
    };
  });
}

// GET /creatives/:id/chart
router.get("/creatives/:id/chart", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const userId = (req as typeof req & { userId: string }).userId;
  const [base] = await db.select().from(creativesTable).where(
    and(eq(creativesTable.id, id), eq(creativesTable.userId, userId))
  );
  if (!base) { res.status(404).json({ error: "Criativo não encontrado" }); return; }

  const dateFilter = req.query.dateFilter as string | undefined;
  const all = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));

  // All rows with the same creative name, filtered by date range
  const rows = all.filter(r => r.name === base.name && filterByDateRange(r.date, dateFilter));
  const byDate: Record<string, number> = {};
  for (const r of rows) {
    const sales = computeTotalSales(r);
    byDate[r.date] = (byDate[r.date] ?? 0) + sales;
  }

  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalSales]) => ({ date, totalSales, roas: 0, cpa: 0, spend: 0, commission: 0 }));

  // If only 1 data point exists, generate a 7-day synthetic narrative history
  if (chartData.length <= 1) {
    const m = withMetrics(base);
    res.json(generateSyntheticHistory(base.date, m.decision, m.monitorarReason, base.daysWithoutSales, m.totalSales));
    return;
  }

  res.json(chartData);
});

const PLAN_LABELS: { key: keyof typeof COMMISSION_RATES; label: string; rate: number }[] = [
  { key: "sales5m",  label: "5 meses",  rate: 217 },
  { key: "sales7m",  label: "7 meses",  rate: 300 },
  { key: "sales9m",  label: "9 meses",  rate: 380 },
  { key: "sales12m", label: "12 meses", rate: 460 },
  { key: "sales16m", label: "16 meses", rate: 520 },
  { key: "sales20m", label: "20 meses", rate: 650 },
];

function fmtBRL(v: number) {
  return `R$${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildSalesBreakdown(row: typeof creativesTable.$inferSelect): { text: string; commission: number } {
  const lines: string[] = [];
  let total = 0;
  for (const p of PLAN_LABELS) {
    const qty = row[p.key] as number;
    if (qty > 0) {
      const sub = qty * p.rate;
      total += sub;
      lines.push(`${qty}× Plano ${p.label} (${fmtBRL(p.rate)}) = ${fmtBRL(sub)}`);
    }
  }
  return {
    text: lines.length > 0 ? lines.join(" | ") : "Nenhuma venda registrada",
    commission: total,
  };
}

// POST /creatives/:id/analyze
router.post("/creatives/:id/analyze", requireAuth, async (req, res) => {
  const parseResult = AnalyzeCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const userId = (req as typeof req & { userId: string }).userId;
  const [row] = await db.select().from(creativesTable).where(
    and(eq(creativesTable.id, parseResult.data.id), eq(creativesTable.userId, userId))
  );
  if (!row) { res.status(404).json({ error: "Criativo não encontrado" }); return; }

  const m = withMetrics(row);
  const { decision, roas, cpa, commission, spend, ctr, totalSales, daysWithoutSales, predictabilityScore, predictabilityLabel } = m;

  const { text: breakdownText } = buildSalesBreakdown(row);

  // Verified math strings
  const commissionCalc = totalSales > 0
    ? `Comissão: ${breakdownText} → Total ${fmtBRL(commission)}`
    : "Comissão: R$0,00 (sem vendas)";
  const roasCalc = `ROAS = ${fmtBRL(commission)} ÷ ${fmtBRL(spend)} = ${roas.toFixed(2)}x`;
  const cpaCalc = totalSales > 0
    ? `CPA = ${fmtBRL(spend)} ÷ ${totalSales} venda(s) = ${fmtBRL(cpa)}`
    : "CPA = incalculável (sem vendas)";

  const prevText = predictabilityScore > 80
    ? `Previsibilidade ${predictabilityScore}/100 — alta confiança para escalar.`
    : predictabilityScore >= 50
    ? `Previsibilidade moderada (${predictabilityScore}/100) — monitore antes de aumentar orçamento.`
    : `Previsibilidade baixa (${predictabilityScore}/100) — padrão de conversões instável.`;

  const cpaQual = totalSales === 0 ? ""
    : cpa < 200 ? `CPA excelente (${fmtBRL(cpa)}) — custo de aquisição muito eficiente.`
    : cpa < 350 ? `CPA aceitável (${fmtBRL(cpa)}) — há espaço para otimizar.`
    : `CPA elevado (${fmtBRL(cpa)}) — margem comprimida.`;

  const { monitorarReason } = m;
  let explanation = "";
  let nextAction = "";

  switch (decision) {
    case "ESCALAR":
      explanation = `"${row.name}" está com desempenho excepcional.\n\n${commissionCalc}\n${roasCalc}\n${cpaCalc}\n\n${cpaQual} ${prevText}`;
      nextAction = `Aumente o orçamento em 20–30% e monitore as próximas 48h. Considere duplicar este criativo para novos públicos enquanto o original continua escalando.`;
      break;
    case "MONITORAR":
      if (monitorarReason === "decaindo") {
        explanation = `"${row.name}" era um criativo forte, mas está sem conversões há ${daysWithoutSales} dia(s) — sinal de queda.\n\n${commissionCalc}\n${roasCalc}\n${cpaCalc}\n\n${cpaQual} ${prevText}`;
        nextAction = `Não aumente o orçamento agora. Monitore as próximas 24h. Se o dia seguinte também não converter, pause. Verifique segmentação, frequência e fadiga do criativo.`;
      } else {
        explanation = `"${row.name}" está operando no positivo, mas abaixo do limiar de escala (ROAS mínimo 2x).\n\n${commissionCalc}\n${roasCalc}\n${cpaCalc}\n\n${cpaQual} ${prevText}`;
        nextAction = `Mantenha o orçamento atual e observe por mais 48h. Se o ROAS ultrapassar 2x sem interrupção de conversões, escale. Teste variações de copy ou público para destravar o potencial.`;
      }
      break;
    case "PAUSAR":
    default:
      if (daysWithoutSales >= 2) {
        explanation = `"${row.name}" está sem conversões há ${daysWithoutSales} dias consecutivos — regra automática de parada ativada.\n\n${commissionCalc}\n${roasCalc}\n\n${prevText}`;
        nextAction = `Pause imediatamente. Analise os últimos públicos que converteram. Reformule o criativo com novo hook e relance para lookalike frio.`;
      } else {
        explanation = `"${row.name}" está gerando prejuízo — comissão abaixo do investimento.\n\n${commissionCalc}\n${roasCalc}\n${cpaCalc}\n\n${cpaQual} ${prevText}`;
        nextAction = `Pause imediatamente para estancar o prejuízo. Faça post-mortem: hook fraco? Público errado? Oferta desalinhada? Registre os aprendizados e relance com ângulo completamente diferente.`;
      }
      break;
  }

  res.json({
    creativeId: row.id,
    decision,
    explanation,
    nextAction,
    metrics: { roas, commission, spend, cpa, ctr, totalSales, predictabilityScore, predictabilityLabel },
  });
});

export { withMetrics, filterByDateRange, computeCommission, computeTotalSales, generateSyntheticHistory };
export default router;

```

---

## Backend — routes/dashboard.ts

**Arquivo:** `artifacts/api-server/src/routes/dashboard.ts`

```typescript
import { Router } from "express";
import { db, creativesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { withMetrics, filterByDateRange, generateSyntheticHistory } from "./creatives";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /dashboard/summary
router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const dateFilter = req.query.dateFilter as string | undefined;
  const rows = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));

  const filtered = rows.filter(r => filterByDateRange(r.date, dateFilter));

  if (filtered.length === 0) {
    res.json({ totalSpend: 0, totalCommission: 0, averageRoas: 0, averageCpa: 0, totalSales: 0, totalCreatives: 0 });
    return;
  }

  const results = filtered.map(withMetrics);
  const totalSpend = results.reduce((s, c) => s + c.spend, 0);
  const totalCommission = results.reduce((s, c) => s + c.commission, 0);
  const totalSales = results.reduce((s, c) => s + c.totalSales, 0);
  const averageRoas = totalSpend > 0 ? Math.round((totalCommission / totalSpend) * 100) / 100 : 0;
  const averageCpa = totalSales > 0 ? Math.round((totalSpend / totalSales) * 100) / 100 : 0;

  const topCreativeByRoas = results.reduce((best, c) => c.roas > best.roas ? c : best);

  res.json({
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalCommission: Math.round(totalCommission * 100) / 100,
    averageRoas,
    averageCpa,
    totalSales,
    totalCreatives: results.length,
    topCreativeByRoas,
  });
});

// GET /dashboard/decision-breakdown
router.get("/dashboard/decision-breakdown", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const dateFilter = req.query.dateFilter as string | undefined;
  const rows = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));

  const filtered = rows.filter(r => filterByDateRange(r.date, dateFilter));
  const results = filtered.map(withMetrics);

  const breakdown = { ESCALAR: 0, MONITORAR: 0, PAUSAR: 0 };
  for (const c of results) breakdown[c.decision]++;

  res.json(breakdown);
});

// GET /dashboard/performance-summary
router.get("/dashboard/performance-summary", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const dateFilter = req.query.dateFilter as string | undefined;
  const rows = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));

  const filtered = rows.filter(r => filterByDateRange(r.date, dateFilter));

  if (filtered.length === 0) {
    res.json({
      bestRoas: null,
      worstCpa: null,
      mostSales: null,
      decisions: { ESCALAR: 0, MONITORAR: 0, PAUSAR: 0 },
      totalCreatives: 0,
    });
    return;
  }

  const results = filtered.map(withMetrics);

  const bestRoasCreative = results.reduce((best, c) => c.roas > best.roas ? c : best);
  const withSales = results.filter(c => c.totalSales > 0);
  const worstCpaCreative = withSales.length > 0
    ? withSales.reduce((worst, c) => c.cpa > worst.cpa ? c : worst)
    : null;
  const mostSalesCreative = results.reduce((best, c) => c.totalSales > best.totalSales ? c : best);

  const decisions = { ESCALAR: 0, MONITORAR: 0, PAUSAR: 0 };
  for (const c of results) decisions[c.decision]++;

  res.json({
    bestRoas: { name: bestRoasCreative.name, roas: bestRoasCreative.roas, commission: bestRoasCreative.commission },
    worstCpa: worstCpaCreative
      ? { name: worstCpaCreative.name, cpa: worstCpaCreative.cpa, spend: worstCpaCreative.spend, totalSales: worstCpaCreative.totalSales }
      : null,
    mostSales: { name: mostSalesCreative.name, totalSales: mostSalesCreative.totalSales, roas: mostSalesCreative.roas },
    decisions,
    totalCreatives: results.length,
  });
});

// GET /dashboard/charts
router.get("/dashboard/charts", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const dateFilter = req.query.dateFilter as string | undefined;
  const rows = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));

  // For the dashboard chart always use all creatives (date filter just changes the window)
  const results = rows.map(withMetrics);

  const byDate: Record<string, { totalSales: number }> = {};

  for (const c of results) {
    if (!byDate[c.date]) byDate[c.date] = { totalSales: 0 };
    byDate[c.date].totalSales += c.totalSales;
  }

  const uniqueDates = Object.keys(byDate);

  // If only 1 date point (all creatives added on same day), generate a 7-day synthetic aggregate
  if (uniqueDates.length <= 1) {
    const syntheticByDate: Record<string, number> = {};
    for (const c of results) {
      const history = generateSyntheticHistory(c.date, c.decision, c.monitorarReason, c.daysWithoutSales, c.totalSales);
      for (const point of history) {
        syntheticByDate[point.date] = (syntheticByDate[point.date] ?? 0) + point.totalSales;
      }
    }
    const chartData = Object.entries(syntheticByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, totalSales]) => ({ date, totalSales, roas: 0, cpa: 0, spend: 0, commission: 0 }));
    res.json(chartData);
    return;
  }

  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      totalSales: d.totalSales,
      roas: 0, cpa: 0, spend: 0, commission: 0,
    }));

  res.json(chartData);
});

export default router;

```

---

## Backend — routes/webhooks.ts

**Arquivo:** `artifacts/api-server/src/routes/webhooks.ts`

```typescript
import { Router } from "express";
import { db, creativesTable } from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";

const router = Router();

const PLAN_FIELDS = {
  "2m": "sales2m",
  "3m": "sales3m",
  "5m": "sales5m",
  "7m": "sales7m",
  "9m": "sales9m",
  "12m": "sales12m",
  "16m": "sales16m",
  "20m": "sales20m",
} as const;

type PlanField = typeof PLAN_FIELDS[keyof typeof PLAN_FIELDS];

function detectPlanField(productName: string): PlanField {
  const lower = productName.toLowerCase();
  for (const [key, field] of Object.entries(PLAN_FIELDS)) {
    if (lower.includes(key)) return field as PlanField;
  }
  return "sales5m";
}

function extractUtmContent(payload: Record<string, unknown>): string | null {
  if (typeof payload.utm_content === "string") return payload.utm_content;
  const tracking = payload.tracking as Record<string, unknown> | undefined;
  if (tracking && typeof tracking.utm_content === "string") return tracking.utm_content;
  const utms = payload.utms as Record<string, unknown> | undefined;
  if (utms && typeof utms.utm_content === "string") return utms.utm_content;
  return null;
}

function extractProductName(payload: Record<string, unknown>): string {
  const offer = payload.offer as Record<string, unknown> | undefined;
  if (offer && typeof offer.name === "string") return offer.name;
  const product = payload.product as Record<string, unknown> | undefined;
  if (product && typeof product.name === "string") return product.name;
  return "";
}

// POST /webhooks/payt
router.post("/webhooks/payt", async (req, res) => {
  const payload = req.body as Record<string, unknown>;

  const integrationKey = process.env.PAYT_INTEGRATION_KEY;
  const isDev = process.env.NODE_ENV === "development";
  if (!integrationKey && !isDev) {
    req.log.error("payt webhook: PAYT_INTEGRATION_KEY not configured in production");
    res.status(200).json({ ok: false, reason: "not_configured" });
    return;
  }
  if (integrationKey && payload.integration_key !== integrationKey) {
    res.status(200).json({ ok: false, reason: "invalid_key" });
    return;
  }

  if (payload.test === true) {
    res.status(200).json({ ok: true, reason: "test_ignored" });
    return;
  }

  const status = payload.status as string | undefined;
  const isApproved = status === "collected" || status === "paid" || status === "approved";
  const isCancelled = status === "cancelled" || status === "refunded" || status === "chargeback";

  if (!isApproved && !isCancelled) {
    res.status(200).json({ ok: true, reason: "status_ignored" });
    return;
  }

  const utmContent = extractUtmContent(payload);
  if (!utmContent) {
    req.log.warn({ status }, "payt webhook: utm_content not found");
    res.status(200).json({ ok: false, reason: "utm_content_missing" });
    return;
  }

  // Support scoped format "userId::creativeName" for per-user isolation.
  // Falls back to global name search for backward compatibility with legacy setups.
  let creative: typeof creativesTable.$inferSelect | undefined;
  if (utmContent.includes("::")) {
    const sepIdx = utmContent.indexOf("::");
    const scopedUserId = utmContent.slice(0, sepIdx);
    const creativeName = utmContent.slice(sepIdx + 2);
    const rows = await db.select().from(creativesTable).where(
      and(eq(creativesTable.userId, scopedUserId), eq(creativesTable.name, creativeName))
    );
    creative = rows[0];
    req.log.info({ scopedUserId, creativeName }, "payt webhook: scoped utm_content lookup");
  } else {
    const rows = await db.select().from(creativesTable);
    creative = rows.find(r => r.name.toLowerCase() === utmContent.toLowerCase());
    req.log.info({ utmContent }, "payt webhook: global name lookup (set utm_content to userId::creativeName for scoped routing)");
  }

  if (!creative) {
    req.log.warn({ utmContent }, "payt webhook: creative not found");
    res.status(200).json({ ok: false, reason: "creative_not_found", utmContent });
    return;
  }

  const productName = extractProductName(payload);
  const planField = detectPlanField(productName);
  const delta = isApproved ? 1 : -1;

  await db.update(creativesTable)
    .set({ [planField]: sql`GREATEST(${creativesTable[planField as keyof typeof creativesTable]} + ${delta}, 0)` })
    .where(sql`id = ${creative.id}`);

  req.log.info({ creativeId: creative.id, planField, delta, status }, "payt webhook processed");
  res.status(200).json({ ok: true, creativeId: creative.id, planField, delta });
});

// POST /webhooks/simulate — test endpoint, no auth required
// Accepts either:
//   utmContent: "userId::creativeName"  (mirrors the real Payt webhook format — preferred)
//   creativeName + optional userId       (legacy separate-field form — still supported)
router.post("/webhooks/simulate", async (req, res) => {
  const { utmContent, creativeName, plan, cancelled, userId } = req.body as {
    utmContent?: string;
    creativeName?: string;
    plan: string;
    cancelled?: boolean;
    userId?: string;
  };

  if (!plan) {
    res.status(200).json({ ok: false, reason: "missing_fields" });
    return;
  }

  let creative: typeof creativesTable.$inferSelect | undefined;

  if (utmContent) {
    // Parse the same userId::creativeName format as the real Payt webhook.
    if (utmContent.includes("::")) {
      const sepIdx = utmContent.indexOf("::");
      const scopedUserId = utmContent.slice(0, sepIdx);
      const scopedName = utmContent.slice(sepIdx + 2);
      const rows = await db.select().from(creativesTable).where(
        and(eq(creativesTable.userId, scopedUserId), eq(creativesTable.name, scopedName))
      );
      creative = rows[0];
      req.log.info({ scopedUserId, scopedName }, "simulate: scoped utmContent lookup");
    } else {
      // Legacy plain-name utmContent — global search (same fallback as production webhook)
      const rows = await db.select().from(creativesTable);
      creative = rows.find(r => r.name.toLowerCase() === utmContent.toLowerCase());
      req.log.info({ utmContent }, "simulate: global name lookup (set utmContent to userId::creativeName for scoped routing)");
    }
  } else if (creativeName) {
    if (userId) {
      const rows = await db.select().from(creativesTable).where(
        and(eq(creativesTable.userId, userId), eq(creativesTable.name, creativeName))
      );
      creative = rows[0];
    } else {
      const rows = await db.select().from(creativesTable);
      creative = rows.find(r => r.name.toLowerCase() === creativeName.toLowerCase());
    }
  } else {
    res.status(200).json({ ok: false, reason: "missing_fields" });
    return;
  }

  if (!creative) {
    res.status(200).json({ ok: false, reason: "creative_not_found", utmContent: utmContent ?? creativeName });
    return;
  }

  const planField = PLAN_FIELDS[plan as keyof typeof PLAN_FIELDS] ?? "sales5m";
  const delta = cancelled ? -1 : 1;

  await db.update(creativesTable)
    .set({ [planField]: sql`GREATEST(${creativesTable[planField as keyof typeof creativesTable]} + ${delta}, 0)` })
    .where(sql`id = ${creative.id}`);

  req.log.info({ creativeId: creative.id, planField, delta }, "simulate webhook processed");
  res.status(200).json({ ok: true, creativeId: creative.id, planField, delta });
});

export default router;

```

---

## Backend — middlewares/requireAuth.ts

**Arquivo:** `artifacts/api-server/src/middlewares/requireAuth.ts`

```typescript
import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }
  (req as Request & { userId: string }).userId = userId;
  next();
}

```

---

## Backend — middlewares/clerkProxyMiddleware.ts

**Arquivo:** `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`

```typescript
/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * AUTH CONFIGURATION: To manage users, enable/disable login providers
 * (Google, GitHub, etc.), change app branding, or configure OAuth credentials,
 * use the Auth pane in the workspace toolbar. There is no external Clerk
 * dashboard — all auth configuration is done through the Auth pane.
 *
 * IMPORTANT:
 * - Only active in production (Clerk proxying doesn't work for dev instances)
 * - Must be mounted BEFORE express.json() middleware
 *
 * Usage in app.ts:
 *   import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import type { RequestHandler } from "express";
import type { IncomingHttpHeaders } from "http";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

/**
 * Returns the first effective public hostname for the given request,
 * preferring x-forwarded-host over the Host header so callers behind a
 * proxy see the original client-facing host.
 *
 * x-forwarded-host can take three shapes:
 *   - undefined (no proxy involved)
 *   - a single string (one proxy hop)
 *   - a comma-delimited string when an upstream appended rather than
 *     replaced the header (Node folds duplicate headers this way), or a
 *     string[] in some Express typings
 * In the multi-value case, the leftmost value is the original client-
 * facing host. Take that one in all forms. Exported so that app.ts
 * (clerkMiddleware callback) and this proxy middleware agree on which
 * hostname is canonical — otherwise multi-domain/custom-domain flows
 * break.
 */
export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = raw?.split(",")[0]?.trim();
  return firstHop || req.headers.host?.trim() || undefined;
}

export function clerkProxyMiddleware(): RequestHandler {
  // Only run proxy in production — Clerk proxying doesn't work for dev instances
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = getClerkProxyHost(req) || "";
        const proxyUrl = `${protocol}://${host}${CLERK_PROXY_PATH}`;

        proxyReq.setHeader("Clerk-Proxy-Url", proxyUrl);
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);

        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }
      },
    },
  }) as RequestHandler;
}

```

---

## Frontend — main.tsx

**Arquivo:** `artifacts/creatives-dashboard/src/main.tsx`

```typescript
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

```

---

## Frontend — App.tsx

**Arquivo:** `artifacts/creatives-dashboard/src/App.tsx`

```typescript
import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Landing from "@/pages/landing";
import CreativeDetail from "@/pages/creative-detail";
import Settings from "@/pages/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#a78bfa",
    colorForeground: "#fafafa",
    colorMutedForeground: "#a1a1aa",
    colorDanger: "#f87171",
    colorBackground: "#09090b",
    colorInput: "#18181b",
    colorInputForeground: "#fafafa",
    colorNeutral: "#3f3f46",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#09090b] border border-[#27272a] rounded-xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#fafafa] font-bold text-2xl",
    headerSubtitle: "text-[#a1a1aa] text-sm",
    socialButtonsBlockButtonText: "text-[#fafafa]",
    formFieldLabel: "text-[#a1a1aa] text-sm",
    footerActionLink: "text-[#a78bfa] hover:text-[#c4b5fd]",
    footerActionText: "text-[#71717a]",
    dividerText: "text-[#52525b]",
    identityPreviewEditButton: "text-[#a78bfa]",
    formFieldSuccessText: "text-[#4ade80]",
    alertText: "text-[#fafafa]",
    logoBox: "flex justify-center mb-2",
    logoImage: "h-10",
    socialButtonsBlockButton: "bg-[#18181b] border border-[#3f3f46] hover:bg-[#27272a] text-[#fafafa]",
    formButtonPrimary: "bg-[#a78bfa] hover:bg-[#9061f9] text-white font-semibold",
    formFieldInput: "bg-[#18181b] border-[#3f3f46] text-[#fafafa] focus:border-[#a78bfa]",
    footerAction: "border-t border-[#27272a]",
    dividerLine: "bg-[#27272a]",
    alert: "bg-[#18181b] border border-[#3f3f46]",
    otpCodeFieldInput: "bg-[#18181b] border-[#3f3f46] text-[#fafafa]",
    formFieldRow: "gap-3",
    main: "gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={`${basePath}/dashboard`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/dashboard`}
      />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function DashboardRoute() {
  return (
    <>
      <Show when="signed-in">
        <Home />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function CreativeDetailRoute() {
  return (
    <>
      <Show when="signed-in">
        <CreativeDetail />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function SettingsRoute() {
  return (
    <>
      <Show when="signed-in">
        <Settings />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/dashboard" component={DashboardRoute} />
      <Route path="/creatives/:id" component={CreativeDetailRoute} />
      <Route path="/settings" component={SettingsRoute} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/dashboard`}
      signUpFallbackRedirectUrl={`${basePath}/dashboard`}
      localization={{
        signIn: {
          start: {
            title: "Entrar no Clivio",
            subtitle: "Acesse seu painel de criativos",
          },
        },
        signUp: {
          start: {
            title: "Criar conta no Clivio",
            subtitle: "Comece a monitorar seus criativos",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <AppRouter />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;

```

---

## Frontend — pages/landing.tsx

**Arquivo:** `artifacts/creatives-dashboard/src/pages/landing.tsx`

```typescript
import { Link } from "wouter";
import { BarChart3, TrendingUp, Zap, ShieldCheck } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-primary">Clivio</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/sign-up"
            className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Criar conta
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full border border-primary/20">
            <Zap className="h-3.5 w-3.5" />
            Painel de criativos Meta Ads
          </div>

          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Decisões de mídia{" "}
            <span className="text-primary">em tempo real</span>
          </h2>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Monitore ROAS, CPA e comissões de afiliado em um único painel. O motor de decisão classifica automaticamente cada criativo: Escalar, Monitorar ou Pausar.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-md hover:bg-primary/90 transition-colors text-sm"
            >
              Começar agora
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center gap-2 border border-border text-foreground font-medium px-6 py-3 rounded-md hover:bg-accent transition-colors text-sm"
            >
              Já tenho conta
            </Link>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
          <div className="bg-card border border-border rounded-xl p-6 text-left space-y-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Motor de decisão</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ESCALAR, MONITORAR ou PAUSAR — decisão automática baseada em ROAS e dias sem vendas.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 text-left space-y-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Previsibilidade</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Score 0–100 que mede consistência de conversões, qualidade de ROAS e eficiência de CPA.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 text-left space-y-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Dados por usuário</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cada conta vê apenas seus próprios criativos. Compartilhe o acesso com segurança.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Clivio — Painel de performance para media buyers
        </p>
      </footer>
    </div>
  );
}

```

---

## Frontend — pages/home.tsx

**Arquivo:** `artifacts/creatives-dashboard/src/pages/home.tsx`

```typescript
import { useState, useMemo } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCreatives, getListCreativesQueryKey,
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetPerformanceSummary, getGetPerformanceSummaryQueryKey,
  useGetDashboardCharts, getGetDashboardChartsQueryKey,
  useSimulateSale,
} from "@workspace/api-client-react";
import {
  ListCreativesParams, CreativeWithMetricsDecision,
  ListCreativesSortBy, ListCreativesSortOrder,
  PerformanceSummary, SimulateSaleBodyPlan,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRoas, formatDate } from "@/lib/format";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Plus, ArrowRight, ArrowDown, ArrowUp, Activity, DollarSign, Target, TrendingUp, TrendingDown, ShoppingBag, ShoppingCart, ChevronsUpDown, Rocket, Ban, FlaskConical, CheckCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreativeForm } from "@/components/creative-form";
import { Skeleton } from "@/components/ui/skeleton";

type DateFilter = "weekly" | "daily" | "monthly" | "all";

function getDecisionColor(decision: string, monitorarReason?: string | null) {
  switch (decision) {
    case "ESCALAR": return "bg-green-500/20 text-green-500 hover:bg-green-500/30";
    case "MONITORAR":
      return monitorarReason === "decaindo"
        ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
        : "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30";
    case "PAUSAR": return "bg-red-500/20 text-red-500 hover:bg-red-500/30";
    default: return "bg-gray-500/20 text-gray-500";
  }
}

function getMonitorarLabel(reason?: string | null) {
  if (reason === "decaindo") return "Decaindo";
  if (reason === "lucrativo") return "Lucrativo";
  return null;
}

function getPausarLabel(reason?: string | null) {
  if (reason === "semVendas") return "Sem Vendas";
  if (reason === "prejuizo") return "Prejuízo";
  return null;
}

function getPredictabilityColor(label: string) {
  if (label === "EXCELENTE") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (label === "BOM") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

function getPredictabilityShort(label: string) {
  if (label === "EXCELENTE") return "Excelente";
  if (label === "BOM") return "Bom";
  return "Ruim";
}

function getCpaColor(cpa: number, totalSales: number) {
  if (totalSales === 0) return "text-muted-foreground";
  if (cpa < 150) return "text-green-400";
  if (cpa < 300) return "text-yellow-400";
  return "text-red-400";
}

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  daily: "Hoje",
  weekly: "Últimos 7 dias",
  monthly: "Últimos 15 dias",
  all: "Últimos 30 dias",
};

const SORTABLE_COLS: { key: ListCreativesSortBy; label: string }[] = [
  { key: "spend", label: "Gasto" },
  { key: "commission", label: "Comissão" },
  { key: "roas", label: "ROAS" },
  { key: "cpa", label: "CPA" },
  { key: "totalSales", label: "Vendas" },
];

function SortableHead({
  col, sortBy, sortOrder, onSort, className,
}: {
  col: ListCreativesSortBy;
  sortBy: ListCreativesSortBy;
  sortOrder: ListCreativesSortOrder;
  onSort: (col: ListCreativesSortBy) => void;
  className?: string;
}) {
  const active = sortBy === col;
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1 justify-end w-full">
        {SORTABLE_COLS.find(c => c.key === col)?.label}
        {active
          ? sortOrder === "asc"
            ? <ArrowUp className="w-3 h-3 text-primary" />
            : <ArrowDown className="w-3 h-3 text-primary" />
          : <ChevronsUpDown className="w-3 h-3 opacity-30" />
        }
      </span>
    </TableHead>
  );
}

function StatRow({ icon, label, name, main, sub, colorBg, colorText }: {
  icon: React.ReactNode;
  label: string;
  name: string;
  main: string;
  sub: string;
  colorBg: string;
  colorText: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
      <div className={`mt-0.5 w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${colorBg}`}>
        <span className={colorText}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</div>
        <div className="text-sm font-semibold text-foreground truncate">{name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-base font-bold tabular-nums leading-none ${colorText}`}>{main}</span>
          <span className="text-xs text-muted-foreground">{sub}</span>
        </div>
      </div>
    </div>
  );
}

function PerformanceSummaryPanel({ data, isLoading }: { data?: PerformanceSummary; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        <div className="grid grid-cols-2 gap-2 pt-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      </div>
    );
  }

  if (!data || data.totalCreatives === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Nenhum criativo no período.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.bestRoas && (
        <StatRow
          icon={<TrendingUp className="w-4 h-4" />}
          label="Melhor ROAS"
          name={data.bestRoas.name}
          main={`${data.bestRoas.roas.toFixed(2)}x`}
          sub={`comissão ${formatCurrency(data.bestRoas.commission)}`}
          colorBg="bg-green-500/20"
          colorText="text-green-400"
        />
      )}
      {data.worstCpa && (
        <StatRow
          icon={<TrendingDown className="w-4 h-4" />}
          label="Pior CPA"
          name={data.worstCpa.name}
          main={formatCurrency(data.worstCpa.cpa)}
          sub={`${data.worstCpa.totalSales} vendas · gasto ${formatCurrency(data.worstCpa.spend)}`}
          colorBg="bg-red-500/20"
          colorText="text-red-400"
        />
      )}
      {data.mostSales && (
        <StatRow
          icon={<ShoppingBag className="w-4 h-4" />}
          label="Mais Vendas"
          name={data.mostSales.name}
          main={`${data.mostSales.totalSales} vendas`}
          sub={`ROAS ${data.mostSales.roas.toFixed(2)}x`}
          colorBg="bg-blue-500/20"
          colorText="text-blue-400"
        />
      )}

      <div className="pt-1 border-t border-border mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 mt-2">
          Situação dos Criativos
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <span className="text-2xl font-bold tabular-nums text-green-400">{data.decisions.ESCALAR}</span>
            <span className="text-[10px] text-green-600 font-semibold mt-0.5">ESCALAR</span>
          </div>
          <div className="flex flex-col items-center p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <span className="text-2xl font-bold tabular-nums text-yellow-400">{data.decisions.MONITORAR}</span>
            <span className="text-[10px] text-yellow-600 font-semibold mt-0.5">MONITOR.</span>
          </div>
          <div className="flex flex-col items-center p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="text-2xl font-bold tabular-nums text-red-400">{data.decisions.PAUSAR}</span>
            <span className="text-[10px] text-red-600 font-semibold mt-0.5">PAUSAR</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useUser();
  const [dateFilter, setDateFilter] = useState<DateFilter>("weekly");
  const [decisionFilter, setDecisionFilter] = useState<CreativeWithMetricsDecision | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<ListCreativesSortBy>("roas");
  const [sortOrder, setSortOrder] = useState<ListCreativesSortOrder>("desc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [simCreative, setSimCreative] = useState("");
  const [simPlan, setSimPlan] = useState<SimulateSaleBodyPlan>("7m");
  const [simResult, setSimResult] = useState<"success" | "error" | null>(null);

  const queryClient = useQueryClient();
  const simulateMutation = useSimulateSale({
    mutation: {
      onSuccess: (data) => {
        if (data.ok) {
          setSimResult("success");
          queryClient.invalidateQueries();
        } else {
          setSimResult("error");
        }
      },
      onError: () => setSimResult("error"),
    },
  });

  function handleSort(col: ListCreativesSortBy) {
    if (sortBy === col) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
  }

  const creativeParams: ListCreativesParams = useMemo(() => {
    const p: ListCreativesParams = { sortBy, sortOrder, dateFilter };
    if (decisionFilter !== "ALL") p.decision = decisionFilter as CreativeWithMetricsDecision;
    return p;
  }, [decisionFilter, sortBy, sortOrder, dateFilter]);

  const dashParams = useMemo(() => ({ dateFilter }), [dateFilter]);

  const { data: creatives, isLoading: isCreativesLoading } = useListCreatives(creativeParams, {
    query: { queryKey: getListCreativesQueryKey(creativeParams) }
  });
  const { data: allCreatives } = useListCreatives({ dateFilter: "all" }, {
    query: { queryKey: getListCreativesQueryKey({ dateFilter: "all" }) }
  });
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary(dashParams, {
    query: { queryKey: getGetDashboardSummaryQueryKey(dashParams) }
  });
  const { data: performanceSummary, isLoading: isPerformanceLoading } = useGetPerformanceSummary(dashParams, {
    query: { queryKey: getGetPerformanceSummaryQueryKey(dashParams) }
  });
  const { data: chartData, isLoading: isChartLoading } = useGetDashboardCharts(dashParams, {
    query: { queryKey: getGetDashboardChartsQueryKey(dashParams) }
  });

  const formattedChartData = useMemo(() => {
    if (!chartData) return [];
    return chartData.map(d => ({ ...d, dateLabel: formatDate(d.date) }));
  }, [chartData]);

  return (
    <Layout>
      <div className="flex-1 p-6 space-y-6">

        {/* Header + Date Filter */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Visão Geral</h2>
            <p className="text-muted-foreground">Métricas de desempenho de todos os criativos ativos.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["daily", "weekly", "monthly", "all"] as DateFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    dateFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid={`button-date-${f}`}
                >
                  {DATE_FILTER_LABELS[f]}
                </button>
              ))}
            </div>
            <Dialog open={isSimulateOpen} onOpenChange={(open) => {
              setIsSimulateOpen(open);
              if (!open) { setSimResult(null); setSimCreative(""); setSimPlan("7m"); }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-dashed border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300">
                  <FlaskConical className="w-4 h-4" />
                  Simular Venda
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[420px] border-border">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-yellow-400" />
                    Simular Venda (Teste)
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Simula uma venda recebida via postback da Payt. Use para verificar se o webhook está funcionando corretamente.
                  </p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Criativo</label>
                    <Select value={simCreative} onValueChange={setSimCreative}>
                      <SelectTrigger className="border-border">
                        <SelectValue placeholder="Selecione o criativo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allCreatives?.map(c => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Plano</label>
                    <Select value={simPlan} onValueChange={(v) => setSimPlan(v as SimulateSaleBodyPlan)}>
                      <SelectTrigger className="border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["5m", "7m", "9m", "12m", "16m", "20m"] as const).map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {simResult === "success" && (
                    <div className="flex items-center gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      Venda simulada com sucesso! O dashboard foi atualizado.
                    </div>
                  )}
                  {simResult === "error" && (
                    <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm">
                      <XCircle className="w-4 h-4 shrink-0" />
                      Criativo não encontrado. Verifique o nome exato.
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      className="flex-1"
                      disabled={!simCreative || simulateMutation.isPending}
                      onClick={() => {
                        setSimResult(null);
                        simulateMutation.mutate({ data: { utmContent: user?.id ? `${user.id}::${simCreative}` : simCreative, plan: simPlan } });
                      }}
                    >
                      {simulateMutation.isPending ? "Simulando..." : "Simular +1 Venda"}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                      disabled={!simCreative || simulateMutation.isPending}
                      onClick={() => {
                        setSimResult(null);
                        simulateMutation.mutate({ data: { utmContent: user?.id ? `${user.id}::${simCreative}` : simCreative, plan: simPlan, cancelled: true } });
                      }}
                    >
                      −1 (Cancelar)
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" data-testid="button-add-creative">
                  <Plus className="w-4 h-4" />
                  Adicionar Criativo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-border">
                <DialogHeader>
                  <DialogTitle>Novo Criativo</DialogTitle>
                </DialogHeader>
                <CreativeForm onSuccess={() => setIsCreateOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Gasto Total</CardTitle>
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-24" /> : (
                <div className="text-xl font-bold tabular-nums text-foreground" data-testid="text-total-spend">{formatCurrency(summary?.totalSpend ?? 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Comissão Total</CardTitle>
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-24" /> : (
                <div className="text-xl font-bold tabular-nums text-foreground" data-testid="text-total-commission">{formatCurrency(summary?.totalCommission ?? 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">ROAS Médio</CardTitle>
              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-20" /> : (
                <div className="text-xl font-bold tabular-nums text-primary" data-testid="text-average-roas">{formatRoas(summary?.averageRoas ?? 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">CPA Médio</CardTitle>
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-24" /> : (
                <div className={`text-xl font-bold tabular-nums ${getCpaColor(summary?.averageCpa ?? 0, summary?.totalSales ?? 0)}`} data-testid="text-average-cpa">
                  {(summary?.totalSales ?? 0) === 0 ? "—" : formatCurrency(summary?.averageCpa ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total de Vendas</CardTitle>
              <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-16" /> : (
                <div className="text-xl font-bold tabular-nums text-foreground" data-testid="text-total-sales">{summary?.totalSales ?? 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart + Performance Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/50 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                {isChartLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : formattedChartData.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                    Nenhum dado para o período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={formattedChartData} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                        formatter={(v: number) => [v, "Vendas Totais"]}
                        labelFormatter={label => `Data: ${label}`}
                      />
                      <Line
                        dataKey="totalSales"
                        stroke="hsl(142 71% 45%)"
                        strokeWidth={2.5}
                        dot={{ fill: "hsl(142 71% 45%)", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">Resumo de Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <PerformanceSummaryPanel data={performanceSummary} isLoading={isPerformanceLoading} />
            </CardContent>
          </Card>
        </div>

        {/* Creatives Table */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Biblioteca de Criativos</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={decisionFilter} onValueChange={v => setDecisionFilter(v as any)}>
                <SelectTrigger className="w-[155px]">
                  <SelectValue placeholder="Decisão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as Decisões</SelectItem>
                  <SelectItem value="ESCALAR">Escalar</SelectItem>
                  <SelectItem value="MONITORAR">Monitorar</SelectItem>
                  <SelectItem value="PAUSAR">Pausar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort("name" as ListCreativesSortBy)}
                  >
                    <span className="inline-flex items-center gap-1">
                      Criativo
                      {sortBy === "name"
                        ? sortOrder === "asc"
                          ? <ArrowUp className="w-3 h-3 text-primary" />
                          : <ArrowDown className="w-3 h-3 text-primary" />
                        : <ChevronsUpDown className="w-3 h-3 opacity-30" />
                      }
                    </span>
                  </TableHead>
                  <SortableHead col="spend" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <SortableHead col="commission" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <SortableHead col="roas" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <SortableHead col="cpa" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <SortableHead col="totalSales" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <TableHead>Decisão</TableHead>
                  <TableHead>Previsibilidade</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isCreativesLoading ? (
                  [1, 2, 3].map(i => (
                    <TableRow key={i} className="border-border">
                      {[...Array(9)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : creatives?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      Nenhum criativo encontrado. Adicione um para começar.
                    </TableCell>
                  </TableRow>
                ) : (
                  creatives?.map(creative => (
                    <TableRow key={creative.id} className="border-border hover:bg-muted/50 group" data-testid={`row-creative-${creative.id}`}>
                      <TableCell className="font-medium">
                        <div data-testid={`text-name-${creative.id}`}>{creative.name}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(creative.date)}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(creative.spend)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(creative.commission)}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatRoas(creative.roas)}</TableCell>
                      <TableCell className={`text-right text-sm tabular-nums font-semibold ${getCpaColor(creative.cpa, creative.totalSales)}`}>
                        {creative.totalSales === 0 ? <span className="text-muted-foreground">—</span> : formatCurrency(creative.cpa)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{creative.totalSales}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className={`text-xs inline-flex items-center gap-1 ${getDecisionColor(creative.decision, creative.monitorarReason)}`}>
                            {creative.decision === "ESCALAR" && <Rocket className="w-2.5 h-2.5" />}
                            {creative.decision === "MONITORAR" && (
                              creative.monitorarReason === "decaindo"
                                ? <TrendingDown className="w-2.5 h-2.5" />
                                : <Activity className="w-2.5 h-2.5" />
                            )}
                            {creative.decision === "PAUSAR" && (
                              creative.pausarReason === "semVendas"
                                ? <Ban className="w-2.5 h-2.5" />
                                : <TrendingDown className="w-2.5 h-2.5" />
                            )}
                            {creative.decision}
                          </Badge>
                          {creative.decision === "ESCALAR" && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-400">
                              <Rocket className="w-2.5 h-2.5" />
                              Acelerando
                            </span>
                          )}
                          {creative.decision === "MONITORAR" && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${creative.monitorarReason === "decaindo" ? "text-orange-400" : "text-yellow-400"}`}>
                              {creative.monitorarReason === "decaindo"
                                ? <TrendingDown className="w-2.5 h-2.5" />
                                : <Activity className="w-2.5 h-2.5" />
                              }
                              {getMonitorarLabel(creative.monitorarReason)}
                            </span>
                          )}
                          {creative.decision === "PAUSAR" && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-400">
                              {creative.pausarReason === "semVendas"
                                ? <Ban className="w-2.5 h-2.5" />
                                : <TrendingDown className="w-2.5 h-2.5" />
                              }
                              {getPausarLabel(creative.pausarReason)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs border ${getPredictabilityColor(creative.predictabilityLabel)}`}>
                          {getPredictabilityShort(creative.predictabilityLabel)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/creatives/${creative.id}`}>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-view-${creative.id}`}>
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

```

---

## Frontend — pages/creative-detail.tsx

**Arquivo:** `artifacts/creatives-dashboard/src/pages/creative-detail.tsx`

```typescript
import { useParams, Link, useLocation } from "wouter";
import {
  useGetCreative, getGetCreativeQueryKey,
  useDeleteCreative, useAnalyzeCreative,
  useGetCreativeChart, getGetCreativeChartQueryKey,
  getListCreativesQueryKey, getGetDashboardSummaryQueryKey,
  getGetPerformanceSummaryQueryKey, getGetDashboardChartsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatRoas, formatDate } from "@/lib/format";
import { ArrowLeft, Trash2, Edit, BrainCircuit, LineChart as LineIcon, AlertTriangle, Gauge, TrendingDown, Activity, Rocket, Ban } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreativeForm } from "@/components/creative-form";
import { useState, useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

type DateFilter = "all" | "daily" | "weekly" | "monthly";

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all: "Tudo",
  daily: "Hoje",
  weekly: "Semana",
  monthly: "Mês",
};

function getDecisionColor(decision: string, monitorarReason?: string | null) {
  switch (decision) {
    case "ESCALAR": return "bg-green-500/20 text-green-500 border-green-500/30";
    case "MONITORAR":
      return monitorarReason === "decaindo"
        ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
        : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "PAUSAR": return "bg-red-500/20 text-red-500 border-red-500/30";
    default: return "bg-gray-500/20 text-gray-500 border-gray-500/30";
  }
}

function getPausarLabel(reason?: string | null) {
  if (reason === "semVendas") return "Sem Vendas";
  if (reason === "prejuizo") return "Prejuízo";
  return null;
}

function getPredictabilityColor(label: string) {
  if (label === "EXCELENTE") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (label === "BOM") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

function getCpaColor(cpa: number, totalSales: number) {
  if (totalSales === 0) return "text-muted-foreground";
  if (cpa < 150) return "text-green-400";
  if (cpa < 300) return "text-yellow-400";
  return "text-red-400";
}

export default function CreativeDetail() {
  const { id } = useParams<{ id: string }>();
  const creativeId = parseInt(id || "0", 10);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [chartDateFilter, setChartDateFilter] = useState<DateFilter>("all");

  const { data: creative, isLoading } = useGetCreative(creativeId, {
    query: { queryKey: getGetCreativeQueryKey(creativeId), enabled: !!creativeId }
  });

  const chartParams = useMemo(() => ({ dateFilter: chartDateFilter }), [chartDateFilter]);
  const { data: chartData, isLoading: isChartLoading } = useGetCreativeChart(creativeId, chartParams, {
    query: { queryKey: getGetCreativeChartQueryKey(creativeId, chartParams), enabled: !!creativeId }
  });

  const formattedChartData = useMemo(() => {
    if (!chartData) return [];
    return chartData.map(d => ({ ...d, dateLabel: formatDate(d.date) }));
  }, [chartData]);

  const deleteCreative = useDeleteCreative();
  const analyzeCreative = useAnalyzeCreative();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListCreativesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPerformanceSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardChartsQueryKey() });
  }

  const handleDelete = () => {
    if (confirm("Tem certeza que deseja excluir este criativo?")) {
      deleteCreative.mutate({ id: creativeId }, {
        onSuccess: () => {
          toast({ title: "Criativo excluído" });
          invalidateAll();
          setLocation("/");
        },
        onError: () => toast({ title: "Erro ao excluir", variant: "destructive" })
      });
    }
  };

  const handleAnalyze = () => {
    analyzeCreative.mutate({ id: creativeId }, {
      onSuccess: () => toast({ title: "Análise concluída" }),
      onError: () => toast({ title: "Falha na análise", variant: "destructive" })
    });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-[400px]" />
            <Skeleton className="h-[400px] md:col-span-2" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!creative) {
    return (
      <Layout>
        <div className="p-6 flex flex-col items-center justify-center min-h-[50vh]">
          <h2 className="text-2xl font-bold mb-4">Criativo não encontrado</h2>
          <Link href="/"><Button>Voltar ao Painel</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="icon" className="shrink-0" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h2 className="text-3xl font-bold tracking-tight" data-testid="text-creative-name">{creative.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-muted-foreground text-sm">{formatDate(creative.date)}</span>
                <div className="flex flex-col gap-0.5">
                  <Badge variant="outline" className={`font-mono border text-xs inline-flex items-center gap-1 ${getDecisionColor(creative.decision, creative.monitorarReason)}`} data-testid="badge-decision">
                    {creative.decision === "ESCALAR" && <Rocket className="w-3 h-3" />}
                    {creative.decision === "MONITORAR" && (
                      creative.monitorarReason === "decaindo"
                        ? <TrendingDown className="w-3 h-3" />
                        : <Activity className="w-3 h-3" />
                    )}
                    {creative.decision === "PAUSAR" && (
                      creative.pausarReason === "semVendas"
                        ? <Ban className="w-3 h-3" />
                        : <TrendingDown className="w-3 h-3" />
                    )}
                    {creative.decision}
                  </Badge>
                  {creative.decision === "ESCALAR" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-400">
                      <Rocket className="w-2.5 h-2.5" />
                      Acelerando
                    </span>
                  )}
                  {creative.decision === "MONITORAR" && creative.monitorarReason && (
                    <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${creative.monitorarReason === "decaindo" ? "text-orange-400" : "text-yellow-400"}`}>
                      {creative.monitorarReason === "decaindo"
                        ? <TrendingDown className="w-2.5 h-2.5" />
                        : <Activity className="w-2.5 h-2.5" />
                      }
                      {creative.monitorarReason === "decaindo" ? "Decaindo" : "Lucrativo"}
                    </span>
                  )}
                  {creative.decision === "PAUSAR" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-400">
                      {creative.pausarReason === "semVendas"
                        ? <Ban className="w-2.5 h-2.5" />
                        : <TrendingDown className="w-2.5 h-2.5" />
                      }
                      {getPausarLabel(creative.pausarReason)}
                    </span>
                  )}
                </div>
                <Badge variant="outline" className={`border text-xs ${getPredictabilityColor(creative.predictabilityLabel)}`} data-testid="badge-predictability">
                  {creative.predictabilityLabel}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={handleAnalyze} disabled={analyzeCreative.isPending} data-testid="button-analyze">
              <BrainCircuit className={`w-4 h-4 ${analyzeCreative.isPending ? "animate-pulse text-primary" : ""}`} />
              {analyzeCreative.isPending ? "Analisando..." : "Analisar Criativo"}
            </Button>
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-edit"><Edit className="w-4 h-4" /></Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-border">
                <DialogHeader><DialogTitle>Editar Criativo</DialogTitle></DialogHeader>
                <CreativeForm initialData={creative} onSuccess={() => { setIsEditOpen(false); queryClient.invalidateQueries({ queryKey: getGetCreativeQueryKey(creativeId) }); invalidateAll(); }} />
              </DialogContent>
            </Dialog>
            <Button variant="destructive" size="icon" onClick={handleDelete} disabled={deleteCreative.isPending} data-testid="button-delete">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* AI Analysis */}
        {analyzeCreative.data && (
          <Alert className="border-primary bg-primary/5" data-testid="alert-analysis">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <AlertTitle className="font-bold tracking-widest uppercase text-primary">Relatório de Inteligência</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <div className="space-y-2">
                {analyzeCreative.data.explanation.split("\n\n").map((block, bi) => (
                  <div key={bi}>
                    {block.split("\n").map((line, li) => {
                      const isMath = line.startsWith("Comissão:") || line.startsWith("ROAS") || line.startsWith("CPA");
                      return isMath ? (
                        <div key={li} className="font-mono text-xs bg-background/60 border border-border/60 rounded px-2 py-1 mt-1 text-foreground/90 leading-relaxed">
                          {line}
                        </div>
                      ) : (
                        <p key={li} className="text-foreground text-sm leading-relaxed">{line}</p>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="bg-background/50 p-3 rounded-md border border-border">
                <strong className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Ação Recomendada</strong>
                <span className="text-sm">{analyzeCreative.data.nextAction}</span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* KPI Column */}
          <div className="space-y-4">
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Desempenho</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">ROAS</div>
                  <div className="text-4xl font-bold tabular-nums text-primary" data-testid="text-roas">{formatRoas(creative.roas)}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Gasto</div>
                    <div className="text-lg font-bold tabular-nums" data-testid="text-spend">{formatCurrency(creative.spend)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Comissão</div>
                    <div className="text-lg font-bold tabular-nums" data-testid="text-commission">{formatCurrency(creative.commission)}</div>
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Total Vendas</div>
                    <div className="text-lg font-bold tabular-nums">{creative.totalSales}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">CPA</div>
                    <div className={`text-lg font-bold tabular-nums ${getCpaColor(creative.cpa, creative.totalSales)}`} data-testid="text-cpa">
                      {creative.totalSales === 0 ? "—" : formatCurrency(creative.cpa)}
                    </div>
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Dias sem Venda</div>
                  <div className={`text-base font-semibold tabular-nums ${creative.daysWithoutSales >= 2 ? "text-red-400" : creative.daysWithoutSales === 1 ? "text-yellow-400" : "text-green-400"}`}>
                    {creative.daysWithoutSales}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Predictability Card */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Gauge className="w-3.5 h-3.5" />
                  Desempenho
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-semibold ${getPredictabilityColor(creative.predictabilityLabel).includes("green") ? "text-green-400" : getPredictabilityColor(creative.predictabilityLabel).includes("yellow") ? "text-yellow-400" : "text-red-400"}`}>
                    {creative.predictabilityLabel}
                  </span>
                  <span className="text-2xl font-bold tabular-nums">{creative.predictabilityScore}<span className="text-sm text-muted-foreground">/100</span></span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${creative.predictabilityScore > 80 ? "bg-green-500" : creative.predictabilityScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${creative.predictabilityScore}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {creative.daysWithoutSales > 0 && (
              <Alert className="border-orange-500/50 bg-orange-500/10 text-orange-500">
                <AlertTriangle className="h-4 w-4 stroke-orange-500" />
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>
                  Este criativo está sem vendas há <strong>{creative.daysWithoutSales} dia(s)</strong>.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Sales Over Time + Breakdown */}
          <div className="md:col-span-2 space-y-4">

            {/* Sales chart card */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    Vendas por Dia (este criativo)
                  </CardTitle>
                  <div className="flex rounded-md border border-border overflow-hidden">
                    {(["all", "daily", "weekly", "monthly"] as DateFilter[]).map(f => (
                      <button
                        key={f}
                        onClick={() => setChartDateFilter(f)}
                        className={`px-3 py-1 text-xs font-medium transition-colors ${
                          chartDateFilter === f
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {DATE_FILTER_LABELS[f]}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full">
                  {isChartLoading ? (
                    <Skeleton className="w-full h-full" />
                  ) : formattedChartData.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      Nenhum dado para o período selecionado.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={formattedChartData} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                          formatter={(v: number) => [v, "Vendas"]}
                          labelFormatter={label => `Data: ${label}`}
                        />
                        <Line
                          dataKey="totalSales"
                          stroke="hsl(142 71% 45%)"
                          strokeWidth={2.5}
                          dot={{ fill: "hsl(142 71% 45%)", r: 4, strokeWidth: 0 }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Sales by plan */}
            <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-4 border-b border-border">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <LineIcon className="w-4 h-4" />
                Vendas por Plano
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {(
                  [
                    { label: "Plano 5m", value: creative.sales5m, rate: "R$217" },
                    { label: "Plano 7m", value: creative.sales7m, rate: "R$300" },
                    { label: "Plano 9m", value: creative.sales9m, rate: "R$380" },
                    { label: "Plano 12m", value: creative.sales12m, rate: "R$460" },
                    { label: "Plano 16m", value: creative.sales16m, rate: "R$520" },
                    { label: "Plano 20m", value: creative.sales20m, rate: "R$650" },
                  ]
                ).map(plan => (
                  <div key={plan.label} className="bg-background p-4 rounded-lg border border-border">
                    <div className="text-xs text-muted-foreground mb-2">{plan.label}</div>
                    <div className="flex items-end justify-between">
                      <div className="text-3xl font-bold tabular-nums">{plan.value}</div>
                      <div className="text-xs text-muted-foreground pb-1">@ {plan.rate}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-lg border border-border bg-background/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total de Vendas</span>
                  <span className="text-xl font-bold tabular-nums">{creative.totalSales}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-muted-foreground">CPA (Custo por Aquisição)</span>
                  <span className={`text-xl font-bold tabular-nums ${getCpaColor(creative.cpa, creative.totalSales)}`}>
                    {creative.totalSales === 0 ? "—" : formatCurrency(creative.cpa)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </Layout>
  );
}

```

---

## Frontend — pages/settings.tsx

**Arquivo:** `artifacts/creatives-dashboard/src/pages/settings.tsx`

```typescript
import { useState } from "react";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, Webhook, Link2, Info, AlertTriangle, ChevronRight } from "lucide-react";

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors border border-primary/20"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {label ?? (copied ? "Copiado!" : "Copiar")}
    </button>
  );
}

function CodeBlock({ value, label }: { value: string; label?: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-4 py-3 font-mono text-sm break-all">
      <span className="flex-1 text-foreground">{value}</span>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-none w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary mt-0.5">
        {number}
      </div>
      <div className="flex-1 pb-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
        <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useUser();

  const origin = window.location.origin;
  const webhookUrl = `${origin}/api/webhooks/payt`;
  const userId = user?.id ?? "carregando...";
  const exampleCreative = "criativo-1";
  const utmExample = `${userId}::${exampleCreative}`;

  return (
    <Layout>
      <div className="flex-1 p-6 md:p-8 max-w-3xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Integração com Payt e configuração de postback</p>
        </div>

        {/* Webhook URL */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">URL do Postback</CardTitle>
            </div>
            <CardDescription>Cole esta URL no campo de postback da Payt para receber notificações de venda automaticamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock value={webhookUrl} />
          </CardContent>
        </Card>

        {/* User ID */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Seu ID de usuário</CardTitle>
            </div>
            <CardDescription>Use este ID para vincular as vendas da Payt aos seus criativos. Veja como no guia abaixo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CodeBlock value={userId} />
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-none" />
              <span>Não compartilhe este ID publicamente. Ele é usado para separar seus dados dos dados de outros usuários.</span>
            </div>
          </CardContent>
        </Card>

        {/* Step-by-step guide */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Como configurar o rastreamento</CardTitle>
            </div>
            <CardDescription>Passo a passo para vincular seus criativos às vendas via postback da Payt.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/40">
              <Step number={1} title="Crie um criativo no Clivio">
                <p>Vá ao Painel e clique em <span className="text-foreground font-medium">+ Novo criativo</span>. Dê um nome simples, sem espaços ou caracteres especiais.</p>
                <p>Exemplo de nome: <code className="bg-muted px-1 py-0.5 rounded text-foreground">rosa-oriental-v1</code></p>
              </Step>

              <Step number={2} title='Configure o utm_content no link do criativo'>
                <p>
                  No link de afiliado da Payt, adicione o parâmetro <code className="bg-muted px-1 py-0.5 rounded text-foreground">utm_content</code> no formato:
                </p>
                <div className="mt-2">
                  <CodeBlock value={utmExample} />
                </div>
                <p className="mt-2">
                  O formato é <code className="bg-muted px-1 py-0.5 rounded text-foreground">seuID::nomeDoCreativo</code> — exatamente como está acima, com dois dois-pontos no meio.
                </p>
              </Step>

              <Step number={3} title="Configure o postback na Payt">
                <p>Acesse sua conta na Payt e vá em <span className="text-foreground font-medium">Configurações → Integrações → Postback</span>.</p>
                <p>Cole a URL abaixo no campo de postback:</p>
                <div className="mt-2">
                  <CodeBlock value={webhookUrl} />
                </div>
                <div className="mt-2">Selecione os eventos <Badge variant="outline" className="text-xs">Aprovado</Badge> e <Badge variant="outline" className="text-xs">Cancelado / Reembolso</Badge> para que o painel receba tanto vendas confirmadas quanto cancelamentos.</div>
              </Step>

              <Step number={4} title="Teste a integração">
                <p>Depois de configurar, volte ao Painel e use o botão <span className="text-foreground font-medium">Simular Venda</span> para verificar se o criativo está recebendo dados corretamente.</p>
                <p>Você também pode fazer uma compra de teste pela Payt — o painel atualizará automaticamente.</p>
              </Step>
            </div>

            {/* Summary diagram */}
            <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground space-y-2">
              <p className="text-foreground font-medium text-xs uppercase tracking-wide mb-3">Fluxo resumido</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-1 bg-card border border-border rounded text-foreground">Visitante clica no anúncio</span>
                <ChevronRight className="h-3 w-3 flex-none" />
                <span className="px-2 py-1 bg-card border border-border rounded text-foreground">utm_content carrega o ID e nome do criativo</span>
                <ChevronRight className="h-3 w-3 flex-none" />
                <span className="px-2 py-1 bg-card border border-border rounded text-foreground">Compra aprovada na Payt</span>
                <ChevronRight className="h-3 w-3 flex-none" />
                <span className="px-2 py-1 bg-primary/20 border border-primary/30 rounded text-primary">Payt envia postback → Clivio atualiza o criativo</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Commission rates reference */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tabela de comissões (54% — base Payt)</CardTitle>
            <CardDescription>Valores que o Clivio usa para calcular ROAS e comissão. Atualizado conforme sua tabela de afiliado.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { plan: "2 meses", value: "R$ 161,38" },
                { plan: "3 meses", value: "R$ 187,38" },
                { plan: "5 meses", value: "R$ 241,38" },
                { plan: "7 meses", value: "R$ 295,38" },
                { plan: "9 meses", value: "R$ 376,38" },
                { plan: "12 meses", value: "R$ 484,38" },
                { plan: "16 meses", value: "R$ 562,38" },
                { plan: "20 meses", value: "R$ 1.026,38" },
              ].map(({ plan, value }) => (
                <div key={plan} className="p-3 rounded-lg bg-muted/40 border border-border text-center">
                  <p className="text-xs text-muted-foreground">{plan}</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              O plano é detectado automaticamente pelo nome do produto no postback (ex: "Rosa Oriental — 7 Meses" → plano 7m).
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

```

---

## Frontend — components/creative-form.tsx

**Arquivo:** `artifacts/creatives-dashboard/src/components/creative-form.tsx`

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useCreateCreative, useUpdateCreative,
  getListCreativesQueryKey, getGetCreativeQueryKey,
  getGetDashboardSummaryQueryKey, getGetDecisionBreakdownQueryKey, getGetDashboardChartsQueryKey,
  CreativeWithMetrics,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  date: z.string().min(1, "Data é obrigatória"),
  spend: z.coerce.number().min(0, "Deve ser >= 0"),
  daysWithoutSales: z.coerce.number().min(0, "Deve ser >= 0"),
  sales5m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales7m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales9m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales12m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales16m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales20m: z.coerce.number().min(0, "Deve ser >= 0"),
});

type FormValues = z.infer<typeof formSchema>;

interface CreativeFormProps {
  onSuccess?: () => void;
  initialData?: CreativeWithMetrics;
}

export function CreativeForm({ onSuccess, initialData }: CreativeFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      date: new Date().toISOString().split("T")[0],
      spend: 0,
      daysWithoutSales: 0,
      sales5m: 0,
      sales7m: 0,
      sales9m: 0,
      sales12m: 0,
      sales16m: 0,
      sales20m: 0,
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        date: initialData.date,
        spend: initialData.spend,
        daysWithoutSales: initialData.daysWithoutSales,
        sales5m: initialData.sales5m,
        sales7m: initialData.sales7m,
        sales9m: initialData.sales9m,
        sales12m: initialData.sales12m,
        sales16m: initialData.sales16m,
        sales20m: initialData.sales20m,
      });
    }
  }, [initialData, form]);

  const createCreative = useCreateCreative();
  const updateCreative = useUpdateCreative();
  const isPending = createCreative.isPending || updateCreative.isPending;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListCreativesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDecisionBreakdownQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardChartsQueryKey() });
  }

  function onSubmit(values: FormValues) {
    if (initialData) {
      updateCreative.mutate(
        { id: initialData.id, data: values },
        {
          onSuccess: () => {
            toast({ title: "Criativo atualizado com sucesso" });
            queryClient.invalidateQueries({ queryKey: getGetCreativeQueryKey(initialData.id) });
            invalidateAll();
            onSuccess?.();
          },
          onError: () => toast({ title: "Erro ao atualizar criativo", variant: "destructive" }),
        }
      );
    } else {
      createCreative.mutate(
        { data: values },
        {
          onSuccess: () => {
            toast({ title: "Criativo criado com sucesso" });
            invalidateAll();
            onSuccess?.();
          },
          onError: () => toast({ title: "Erro ao criar criativo", variant: "destructive" }),
        }
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do Criativo</FormLabel>
              <FormControl><Input placeholder="Nome do criativo" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem>
              <FormLabel>Data</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="spend" render={({ field }) => (
            <FormItem>
              <FormLabel>Gasto (R$)</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="daysWithoutSales" render={({ field }) => (
            <FormItem>
              <FormLabel>Dias sem Venda</FormLabel>
              <FormControl><Input type="number" min="0" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium mb-4 text-muted-foreground uppercase tracking-widest">Vendas por Plano</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {(["5m","7m","9m","12m","16m","20m"] as const).map(plan => (
              <FormField key={plan} control={form.control} name={`sales${plan}` as any} render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendas {plan}</FormLabel>
                  <FormControl><Input type="number" min="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : initialData ? "Atualizar Criativo" : "Criar Criativo"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

```

---

## Frontend — index.css (tema)

**Arquivo:** `artifacts/creatives-dashboard/src/index.css`

```css
@import "tailwindcss";
@import "tw-animate-css";
@plugin "@tailwindcss/typography";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));

  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-card-border: hsl(var(--card-border));

  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-popover-border: hsl(var(--popover-border));

  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));

  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));

  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));

  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));

  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));

  --color-chart-1: hsl(var(--chart-1));
  --color-chart-2: hsl(var(--chart-2));
  --color-chart-3: hsl(var(--chart-3));
  --color-chart-4: hsl(var(--chart-4));
  --color-chart-5: hsl(var(--chart-5));

  --font-sans: var(--app-font-sans);
  --font-mono: var(--app-font-mono);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;

  --border: 240 10% 12%;

  --card: 240 10% 6%;
  --card-foreground: 0 0% 98%;
  --card-border: 240 10% 16%;

  --popover: 240 10% 4%;
  --popover-foreground: 0 0% 98%;
  --popover-border: 240 10% 12%;

  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;

  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;

  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;

  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;

  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;

  --input: 240 10% 12%;
  --ring: 240 4.9% 83.9%;
  
  --chart-1: 220 70% 50%;
  --chart-2: 160 60% 45%;
  --chart-3: 30 80% 55%;
  --chart-4: 280 65% 60%;
  --chart-5: 340 75% 55%;

  --app-font-sans: 'Inter', sans-serif;
  --app-font-mono: Menlo, monospace;
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;

  --border: 240 10% 15%;

  --card: 240 10% 7%;
  --card-foreground: 0 0% 98%;
  --card-border: 240 10% 15%;

  --popover: 240 10% 4%;
  --popover-foreground: 0 0% 98%;
  --popover-border: 240 10% 12%;

  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;

  --secondary: 240 10% 15%;
  --secondary-foreground: 0 0% 98%;

  --muted: 240 10% 15%;
  --muted-foreground: 240 5% 64.9%;

  --accent: 240 10% 15%;
  --accent-foreground: 0 0% 98%;

  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;

  --input: 240 10% 15%;
  --ring: 240 4.9% 83.9%;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply font-sans antialiased bg-background text-foreground;
  }
}
```

---

