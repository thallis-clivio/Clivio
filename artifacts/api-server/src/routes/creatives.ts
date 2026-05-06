import { Router } from "express";
import { db, creativesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateCreativeBody,
  ListCreativesQueryParams,
  GetCreativeParams,
  UpdateCreativeBody,
  UpdateCreativeParams,
  DeleteCreativeParams,
  AnalyzeCreativeParams,
} from "@workspace/api-zod";

const router = Router();

const COMMISSION_RATES = {
  sales5m: 217,
  sales7m: 300,
  sales9m: 380,
  sales12m: 460,
  sales16m: 520,
  sales20m: 650,
} as const;

function computeCommission(c: {
  sales5m: number; sales7m: number; sales9m: number;
  sales12m: number; sales16m: number; sales20m: number;
}): number {
  return (
    c.sales5m * 217 + c.sales7m * 300 + c.sales9m * 380 +
    c.sales12m * 460 + c.sales16m * 520 + c.sales20m * 650
  );
}

function computeTotalSales(c: {
  sales5m: number; sales7m: number; sales9m: number;
  sales12m: number; sales16m: number; sales20m: number;
}): number {
  return c.sales5m + c.sales7m + c.sales9m + c.sales12m + c.sales16m + c.sales20m;
}

function computeDecision(roas: number, _cpa: number, daysWithoutSales: number): {
  decision: "ESCALAR" | "MONITORAR" | "PAUSAR";
  monitorarReason: "lucrativo" | "decaindo" | null;
} {
  if (daysWithoutSales >= 2) return { decision: "PAUSAR", monitorarReason: null };
  if (roas >= 2 && daysWithoutSales === 0) return { decision: "ESCALAR", monitorarReason: null };
  if (roas >= 1 && (roas < 2 || daysWithoutSales === 1)) {
    const reason = daysWithoutSales === 1 && roas >= 2 ? "decaindo" : "lucrativo";
    return { decision: "MONITORAR", monitorarReason: reason };
  }
  return { decision: "PAUSAR", monitorarReason: null };
}

function computePredictability(
  roas: number,
  cpa: number,
  daysWithoutSales: number,
  totalSales: number
): { score: number; label: "ALTA PREVISIBILIDADE" | "MÉDIA PREVISIBILIDADE" | "BAIXA PREVISIBILIDADE" } {
  // Consistency component (0–40 pts)
  let consistencyScore = 0;
  if (daysWithoutSales === 0 && totalSales > 0) consistencyScore = 40;
  else if (daysWithoutSales === 1 && totalSales > 0) consistencyScore = 20;
  else if (daysWithoutSales === 0 && totalSales === 0) consistencyScore = 15;
  else consistencyScore = 0;

  // ROAS quality component (0–35 pts)
  let roasScore = 0;
  if (roas >= 3) roasScore = 35;
  else if (roas >= 2.5) roasScore = 30;
  else if (roas >= 2) roasScore = 25;
  else if (roas >= 1.5) roasScore = 15;
  else if (roas >= 1) roasScore = 8;
  else roasScore = 0;

  // CPA efficiency component (0–25 pts)
  let cpaScore = 0;
  if (totalSales === 0) cpaScore = 0;
  else if (cpa < 100) cpaScore = 25;
  else if (cpa < 200) cpaScore = 20;
  else if (cpa < 300) cpaScore = 14;
  else if (cpa < 450) cpaScore = 7;
  else cpaScore = 0;

  const score = Math.min(100, Math.round(consistencyScore + roasScore + cpaScore));
  const label = score > 80 ? "ALTA PREVISIBILIDADE"
    : score >= 50 ? "MÉDIA PREVISIBILIDADE"
    : "BAIXA PREVISIBILIDADE";

  return { score, label };
}

function filterByDateRange(date: string, dateFilter?: string): boolean {
  if (!dateFilter || dateFilter === "all") return true;
  const now = new Date();
  const d = new Date(date + "T00:00:00");
  if (dateFilter === "daily") {
    return d.toDateString() === now.toDateString();
  }
  if (dateFilter === "weekly") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    return d >= cutoff;
  }
  if (dateFilter === "monthly") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  return true;
}

function withMetrics(c: typeof creativesTable.$inferSelect) {
  const commission = computeCommission(c);
  const totalSales = computeTotalSales(c);
  const roas = c.spend > 0 ? Math.round((commission / c.spend) * 100) / 100 : 0;
  const cpa = totalSales > 0 ? Math.round((c.spend / totalSales) * 100) / 100 : 0;
  const { decision, monitorarReason } = computeDecision(roas, cpa, c.daysWithoutSales);
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
  };
}

// GET /creatives
router.get("/creatives", async (req, res) => {
  const parseResult = ListCreativesQueryParams.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const { decision, sortBy, sortOrder, dateFilter } = parseResult.data;
  const rows = await db.select().from(creativesTable);
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
router.post("/creatives", async (req, res) => {
  const parseResult = CreateCreativeBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.message });
    return;
  }

  const data = parseResult.data;
  const [created] = await db.insert(creativesTable).values({
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
router.get("/creatives/:id", async (req, res) => {
  const parseResult = GetCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const [row] = await db.select().from(creativesTable).where(eq(creativesTable.id, parseResult.data.id));
  if (!row) { res.status(404).json({ error: "Criativo não encontrado" }); return; }

  res.json(withMetrics(row));
});

// PUT /creatives/:id
router.put("/creatives/:id", async (req, res) => {
  const paramsResult = UpdateCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!paramsResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const bodyResult = UpdateCreativeBody.safeParse(req.body);
  if (!bodyResult.success) { res.status(400).json({ error: bodyResult.error.message }); return; }

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
  }).where(eq(creativesTable.id, paramsResult.data.id)).returning();

  if (!updated) { res.status(404).json({ error: "Criativo não encontrado" }); return; }
  res.json(withMetrics(updated));
});

// DELETE /creatives/:id
router.delete("/creatives/:id", async (req, res) => {
  const parseResult = DeleteCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const [deleted] = await db.delete(creativesTable).where(eq(creativesTable.id, parseResult.data.id)).returning();
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
router.get("/creatives/:id/chart", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [base] = await db.select().from(creativesTable).where(eq(creativesTable.id, id));
  if (!base) { res.status(404).json({ error: "Criativo não encontrado" }); return; }

  const dateFilter = req.query.dateFilter as string | undefined;
  const all = await db.select().from(creativesTable);

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
router.post("/creatives/:id/analyze", async (req, res) => {
  const parseResult = AnalyzeCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const [row] = await db.select().from(creativesTable).where(eq(creativesTable.id, parseResult.data.id));
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

export { withMetrics, filterByDateRange, computeCommission, computeTotalSales };
export default router;
