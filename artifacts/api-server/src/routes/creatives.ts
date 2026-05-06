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

function computeDecision(roas: number, daysWithoutSales: number): "ESCALAR" | "MONITORAR" | "OTIMIZAR" | "PAUSAR" {
  if (daysWithoutSales >= 2) return "PAUSAR";
  if (roas >= 2) return "ESCALAR";
  if (roas >= 1.5) return "MONITORAR";
  if (roas >= 1) return "OTIMIZAR";
  return "PAUSAR";
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
  const decision = computeDecision(roas, c.daysWithoutSales);
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

// POST /creatives/:id/analyze
router.post("/creatives/:id/analyze", async (req, res) => {
  const parseResult = AnalyzeCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const [row] = await db.select().from(creativesTable).where(eq(creativesTable.id, parseResult.data.id));
  if (!row) { res.status(404).json({ error: "Criativo não encontrado" }); return; }

  const m = withMetrics(row);
  const { decision, roas, cpa, commission, spend, ctr, totalSales, daysWithoutSales, predictabilityScore, predictabilityLabel } = m;

  let explanation = "";
  let nextAction = "";

  const prevText = predictabilityScore > 80
    ? `Com pontuação de previsibilidade de ${predictabilityScore}/100 (${predictabilityLabel}), este criativo pode ser escalado com alta confiança.`
    : predictabilityScore >= 50
    ? `A previsibilidade é moderada (${predictabilityScore}/100 — ${predictabilityLabel}). Monitore de perto antes de aumentar o orçamento.`
    : `Previsibilidade baixa (${predictabilityScore}/100 — ${predictabilityLabel}). O padrão de conversões é instável e exige atenção.`;

  const cpaText = totalSales === 0
    ? `Sem vendas registradas — CPA incalculável.`
    : cpa < 200
    ? `O CPA de R$${cpa.toFixed(0)} está excelente — custo de aquisição muito eficiente.`
    : cpa < 350
    ? `O CPA de R$${cpa.toFixed(0)} está dentro do aceitável, mas há espaço para otimizar.`
    : `O CPA de R$${cpa.toFixed(0)} está alto — o custo por venda está comprimindo a margem.`;

  switch (decision) {
    case "ESCALAR":
      explanation = `"${row.name}" está com desempenho excepcional — ROAS de ${roas.toFixed(2)}x com ${totalSales} venda(s) geradas. A comissão de R$${commission.toFixed(0)} sobre um gasto de R$${spend.toFixed(0)} demonstra alta lucratividade. ${cpaText} ${prevText}`;
      nextAction = `Aumente o orçamento em 20–30% e monitore as próximas 48 horas. Considere duplicar este criativo para novos públicos enquanto o original continua escalando.`;
      break;
    case "MONITORAR":
      explanation = `"${row.name}" apresenta retorno de ${roas.toFixed(2)}x, ainda abaixo do limite de escala de 2,0x. ${totalSales} venda(s) registrada(s). ${cpaText} ${prevText}`;
      nextAction = `Mantenha o orçamento atual. Teste novos hooks ou CTAs para elevar o ROAS acima de 2,0x. Reavalie em 24 a 48 horas.`;
      break;
    case "OTIMIZAR":
      explanation = `"${row.name}" está no ponto de equilíbrio com ROAS de ${roas.toFixed(2)}x. ${totalSales} venda(s) registrada(s). ${cpaText} ${daysWithoutSales > 0 ? `${daysWithoutSales} dia(s) sem vendas — sinal de atenção.` : ""} ${prevText}`;
      nextAction = `Reduza o orçamento em 30–50% imediatamente. Teste novo hook, formato ou segmento. Se não houver melhora em 72 horas, pause.`;
      break;
    case "PAUSAR":
      if (daysWithoutSales >= 2) {
        explanation = `"${row.name}" foi pausado por ${daysWithoutSales} dias consecutivos sem vendas — regra automática de parada. ${prevText}`;
        nextAction = `Pause imediatamente. Analise os últimos públicos que converteram. Reformule o criativo com novo hook e relance para lookalike frio.`;
      } else {
        explanation = `"${row.name}" está gerando prejuízo — ROAS de ${roas.toFixed(2)}x, comissão (R$${commission.toFixed(0)}) abaixo do gasto (R$${spend.toFixed(0)}). ${cpaText} ${prevText}`;
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
