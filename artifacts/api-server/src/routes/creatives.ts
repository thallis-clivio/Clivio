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
  sales5m: number;
  sales7m: number;
  sales9m: number;
  sales12m: number;
  sales16m: number;
  sales20m: number;
}): number {
  return (
    c.sales5m * COMMISSION_RATES.sales5m +
    c.sales7m * COMMISSION_RATES.sales7m +
    c.sales9m * COMMISSION_RATES.sales9m +
    c.sales12m * COMMISSION_RATES.sales12m +
    c.sales16m * COMMISSION_RATES.sales16m +
    c.sales20m * COMMISSION_RATES.sales20m
  );
}

function computeRoas(commission: number, spend: number): number {
  if (spend === 0) return 0;
  return commission / spend;
}

function computeDecision(
  roas: number,
  daysWithoutSales: number
): "ESCALAR" | "MONITORAR" | "OTIMIZAR" | "PAUSAR" {
  if (daysWithoutSales >= 2) return "PAUSAR";
  if (roas >= 2) return "ESCALAR";
  if (roas >= 1.5) return "MONITORAR";
  if (roas >= 1) return "OTIMIZAR";
  return "PAUSAR";
}

function withMetrics(c: typeof creativesTable.$inferSelect) {
  const commission = computeCommission(c);
  const roas = computeRoas(commission, c.spend);
  const decision = computeDecision(roas, c.daysWithoutSales);
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
    hookRate: c.hookRate,
    daysWithoutSales: c.daysWithoutSales,
    commission,
    roas: Math.round(roas * 100) / 100,
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

  const { decision, sortBy, sortOrder } = parseResult.data;

  const rows = await db.select().from(creativesTable);
  let results = rows.map(withMetrics);

  if (decision) {
    results = results.filter((c) => c.decision === decision);
  }

  if (sortBy) {
    const order = sortOrder === "asc" ? 1 : -1;
    results.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] as number | string;
      const bVal = b[sortBy as keyof typeof b] as number | string;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal) * order;
      }
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
  const [created] = await db
    .insert(creativesTable)
    .values({
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
      hookRate: data.hookRate,
      daysWithoutSales: data.daysWithoutSales,
    })
    .returning();

  res.status(201).json(withMetrics(created));
});

// GET /creatives/:id
router.get("/creatives/:id", async (req, res) => {
  const parseResult = GetCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [row] = await db
    .select()
    .from(creativesTable)
    .where(eq(creativesTable.id, parseResult.data.id));

  if (!row) {
    res.status(404).json({ error: "Criativo não encontrado" });
    return;
  }

  res.json(withMetrics(row));
});

// PUT /creatives/:id
router.put("/creatives/:id", async (req, res) => {
  const paramsResult = UpdateCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!paramsResult.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const bodyResult = UpdateCreativeBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: bodyResult.error.message });
    return;
  }

  const data = bodyResult.data;
  const [updated] = await db
    .update(creativesTable)
    .set({
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
      hookRate: data.hookRate,
      daysWithoutSales: data.daysWithoutSales,
    })
    .where(eq(creativesTable.id, paramsResult.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Criativo não encontrado" });
    return;
  }

  res.json(withMetrics(updated));
});

// DELETE /creatives/:id
router.delete("/creatives/:id", async (req, res) => {
  const parseResult = DeleteCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [deleted] = await db
    .delete(creativesTable)
    .where(eq(creativesTable.id, parseResult.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Criativo não encontrado" });
    return;
  }

  res.status(204).send();
});

// POST /creatives/:id/analyze
router.post("/creatives/:id/analyze", async (req, res) => {
  const parseResult = AnalyzeCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [row] = await db
    .select()
    .from(creativesTable)
    .where(eq(creativesTable.id, parseResult.data.id));

  if (!row) {
    res.status(404).json({ error: "Criativo não encontrado" });
    return;
  }

  const m = withMetrics(row);
  const { decision, roas, commission, spend, ctr, hookRate, daysWithoutSales } = m;

  let explanation = "";
  let nextAction = "";

  switch (decision) {
    case "ESCALAR":
      explanation = `"${row.name}" está com desempenho excepcional, com um ROAS de ${roas.toFixed(2)}x. A comissão de R$${commission.toFixed(0)} sobre um gasto de R$${spend.toFixed(0)} demonstra alta lucratividade. O CTR de ${ctr.toFixed(2)}% e a taxa de hook de ${hookRate.toFixed(2)}% indicam forte engajamento do público.`;
      nextAction = `Aumente o orçamento em 20-30% e monitore o desempenho nas próximas 48 horas. Considere duplicar este criativo para testar novos públicos enquanto o original continua escalando.`;
      break;
    case "MONITORAR":
      explanation = `"${row.name}" apresenta retorno aceitável com um ROAS de ${roas.toFixed(2)}x, mas ainda não cruzou o limite de escala de 2,0x. A receita cobre o gasto com uma margem de ${((roas - 1) * 100).toFixed(0)}%. ${daysWithoutSales > 0 ? `Atenção: ${daysWithoutSales} dia(s) sem vendas, o que pode indicar fadiga criativa.` : ""}`;
      nextAction = `Mantenha o orçamento atual. Revise o criativo e a sobreposição de públicos. Teste novos hooks ou CTAs para elevar o ROAS acima de 2,0x. Reavalie em 24 a 48 horas.`;
      break;
    case "OTIMIZAR":
      explanation = `"${row.name}" está no ponto de equilíbrio com um ROAS de ${roas.toFixed(2)}x, ou seja, o gasto mal é coberto pela comissão. O CTR de ${ctr.toFixed(2)}% e a taxa de hook de ${hookRate.toFixed(2)}% precisam melhorar. ${daysWithoutSales > 0 ? `${daysWithoutSales} dia(s) sem vendas é um sinal de alerta.` : ""}`;
      nextAction = `Reduza o orçamento em 30 a 50% imediatamente. Teste um novo hook, formato de criativo ou segmento de público. Considere renovar o texto e os visuais do anúncio. Defina uma janela de 72 horas — se não houver melhora, pause.`;
      break;
    case "PAUSAR":
      if (daysWithoutSales >= 2) {
        explanation = `"${row.name}" foi pausado devido a ${daysWithoutSales} dias consecutivos sem vendas — uma regra de parada automática independente do ROAS. Fadiga criativa ou esgotamento de público é a causa mais provável.`;
        nextAction = `Pause este criativo imediatamente. Analise em quais segmentos de público ele converteu pela última vez. Reformule o conceito criativo com um novo hook e relance para um público lookalike frio.`;
      } else {
        explanation = `"${row.name}" está gerando prejuízo com um ROAS de ${roas.toFixed(2)}x — a comissão (R$${commission.toFixed(0)}) está abaixo do gasto (R$${spend.toFixed(0)}). O CTR baixo (${ctr.toFixed(2)}%) sugere que o anúncio não está sendo atraente o suficiente para capturar a atenção.`;
        nextAction = `Pause este criativo imediatamente para estancar o prejuízo. Faça uma análise pós-campanha: o hook era fraco? Público errado? Oferta desalinhada? Registre os aprendizados antes de relançar com um ângulo completamente diferente.`;
      }
      break;
  }

  res.json({
    creativeId: row.id,
    decision,
    explanation,
    nextAction,
    metrics: { roas, commission, spend, ctr, hookRate },
  });
});

export default router;
