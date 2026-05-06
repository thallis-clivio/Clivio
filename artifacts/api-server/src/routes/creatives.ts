import { Router } from "express";
import { db, creativesTable, commissionSettingsTable } from "@workspace/db";
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
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

// CommissionRates — configurável por usuário via /settings/commissions
export type CommissionRates = {
  commission2m: number;
  commission3m: number;
  commission5m: number;
  commission7m: number;
  commission9m: number;
  commission12m: number;
  commission16m: number;
  commission20m: number;
};

export const DEFAULT_RATES: CommissionRates = {
  commission2m: 161.38,
  commission3m: 187.38,
  commission5m: 241.38,
  commission7m: 295.38,
  commission9m: 376.38,
  commission12m: 484.38,
  commission16m: 562.38,
  commission20m: 1026.38,
};

export async function getCommissionRates(userId: string): Promise<CommissionRates> {
  const [row] = await db.select().from(commissionSettingsTable).where(
    eq(commissionSettingsTable.userId, userId)
  );
  if (!row) return DEFAULT_RATES;
  return {
    commission2m: row.commission2m,
    commission3m: row.commission3m,
    commission5m: row.commission5m,
    commission7m: row.commission7m,
    commission9m: row.commission9m,
    commission12m: row.commission12m,
    commission16m: row.commission16m,
    commission20m: row.commission20m,
  };
}

function computeCommission(
  c: { sales2m: number; sales3m: number; sales5m: number; sales7m: number;
       sales9m: number; sales12m: number; sales16m: number; sales20m: number },
  rates: CommissionRates
): number {
  return (
    c.sales2m * rates.commission2m + c.sales3m * rates.commission3m +
    c.sales5m * rates.commission5m + c.sales7m * rates.commission7m +
    c.sales9m * rates.commission9m + c.sales12m * rates.commission12m +
    c.sales16m * rates.commission16m + c.sales20m * rates.commission20m
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

function filterByDateRange(date: string, dateFilter?: string, dateFrom?: string, dateTo?: string): boolean {
  if (dateFrom && dateTo) {
    const d = new Date(date + "T00:00:00");
    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T23:59:59");
    return d >= from && d <= to;
  }
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

export function withMetrics(c: typeof creativesTable.$inferSelect, rates: CommissionRates = DEFAULT_RATES) {
  const commission = computeCommission(c, rates);
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
  const [rows, rates] = await Promise.all([
    db.select().from(creativesTable).where(eq(creativesTable.userId, userId)),
    getCommissionRates(userId),
  ]);
  let results = rows
    .filter(r => filterByDateRange(r.date, dateFilter))
    .map(r => withMetrics(r, rates));

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

  const rates = await getCommissionRates(userId);
  res.status(201).json(withMetrics(created, rates));
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

  const rates = await getCommissionRates(userId);
  res.json(withMetrics(row, rates));
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
  const rates = await getCommissionRates(userId);
  res.json(withMetrics(updated, rates));
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
    const rates = await getCommissionRates(userId);
    const m = withMetrics(base, rates);
    res.json(generateSyntheticHistory(base.date, m.decision, m.monitorarReason, base.daysWithoutSales, m.totalSales));
    return;
  }

  res.json(chartData);
});

type PlanLabel = { key: keyof typeof creativesTable.$inferSelect; label: string; rateKey: keyof CommissionRates };
const PLAN_LABELS: PlanLabel[] = [
  { key: "sales2m",  label: "2 meses",  rateKey: "commission2m" },
  { key: "sales3m",  label: "3 meses",  rateKey: "commission3m" },
  { key: "sales5m",  label: "5 meses",  rateKey: "commission5m" },
  { key: "sales7m",  label: "7 meses",  rateKey: "commission7m" },
  { key: "sales9m",  label: "9 meses",  rateKey: "commission9m" },
  { key: "sales12m", label: "12 meses", rateKey: "commission12m" },
  { key: "sales16m", label: "16 meses", rateKey: "commission16m" },
  { key: "sales20m", label: "20 meses", rateKey: "commission20m" },
];

function fmtBRL(v: number) {
  return `R$${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildSalesBreakdown(row: typeof creativesTable.$inferSelect, rates: CommissionRates): { text: string; commission: number } {
  const lines: string[] = [];
  let total = 0;
  for (const p of PLAN_LABELS) {
    const qty = row[p.key] as number;
    if (qty > 0) {
      const rate = rates[p.rateKey];
      const sub = qty * rate;
      total += sub;
      lines.push(`${qty}× Plano ${p.label} (${fmtBRL(rate)}) = ${fmtBRL(sub)}`);
    }
  }
  return {
    text: lines.length > 0 ? lines.join(" | ") : "Nenhuma venda registrada",
    commission: total,
  };
}

// POST /creatives/:id/analyze  — streaming SSE via Claude
router.post("/creatives/:id/analyze", requireAuth, async (req, res) => {
  const parseResult = AnalyzeCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const userId = (req as typeof req & { userId: string }).userId;
  const [row] = await db.select().from(creativesTable).where(
    and(eq(creativesTable.id, parseResult.data.id), eq(creativesTable.userId, userId))
  );
  if (!row) { res.status(404).json({ error: "Criativo não encontrado" }); return; }

  const rates = await getCommissionRates(userId);
  const m = withMetrics(row, rates);
  const { decision, roas, cpa, commission, spend, totalSales, daysWithoutSales, predictabilityScore, predictabilityLabel, monitorarReason, pausarReason } = m;
  const { text: salesBreakdown } = buildSalesBreakdown(row, rates);

  const decisionLabel = decision === "ESCALAR" ? "ESCALAR"
    : decision === "MONITORAR" ? `MONITORAR (${monitorarReason === "decaindo" ? "em queda" : "lucrativo"})`
    : `PAUSAR (${pausarReason === "semVendas" ? "sem vendas" : "prejuízo"})`;

  const prompt = `Você é um analista sênior de mídia paga especializado em campanhas CTWA (Click-to-WhatsApp) no Meta Ads para o mercado brasileiro, com foco em produtos de assinatura vendidos via comissão de afiliado.

## Dados do Criativo
- Nome: "${row.name}"
- Data de criação: ${row.date}
- Decisão do motor automático: **${decisionLabel}**
- Score de desempenho: ${predictabilityScore}/100 (${predictabilityLabel})

## Métricas Financeiras
- Investimento total: ${fmtBRL(spend)}
- Comissão gerada: ${fmtBRL(commission)}
- ROAS: ${roas.toFixed(2)}x  ← referência: ≥2x escala, <1x prejuízo
- CPA: ${totalSales > 0 ? fmtBRL(cpa) : "—"}  ← referência: <R$200 excelente, >R$350 crítico
- Total de vendas: ${totalSales}
- Dias consecutivos sem venda: ${daysWithoutSales}

## Distribuição de Vendas por Plano
${salesBreakdown}

## Tarefa
Analise este criativo com objetividade e precisão. Estruture a resposta em exatamente três seções:

**1. Diagnóstico**
Em 2-3 frases diretas, descreva o estado atual do criativo com base nos números reais acima.

**2. Pontos críticos**
Liste até 3 fatores que explicam o desempenho (positivos e/ou negativos). Use dados concretos.

**3. Próximos passos**
Indique 1-2 ações para as próximas 24-48h com justificativa baseada nos dados. Seja específico.

Regras: use os números reais da análise, escreva em português brasileiro, seja direto e sem floreios.`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "Claude analysis failed");
    res.write(`data: ${JSON.stringify({ error: "Falha ao conectar com Claude. Tente novamente." })}\n\n`);
  }

  res.end();
});

export { filterByDateRange, computeCommission, computeTotalSales, generateSyntheticHistory };
export default router;
