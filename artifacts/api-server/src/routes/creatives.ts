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

// Commission rates per plan
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
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { decision, sortBy, sortOrder } = parseResult.data;

  let rows = await db.select().from(creativesTable);
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
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db
    .select()
    .from(creativesTable)
    .where(eq(creativesTable.id, parseResult.data.id));

  if (!row) {
    res.status(404).json({ error: "Creative not found" });
    return;
  }

  res.json(withMetrics(row));
});

// PUT /creatives/:id
router.put("/creatives/:id", async (req, res) => {
  const paramsResult = UpdateCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!paramsResult.success) {
    res.status(400).json({ error: "Invalid id" });
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
    res.status(404).json({ error: "Creative not found" });
    return;
  }

  res.json(withMetrics(updated));
});

// DELETE /creatives/:id
router.delete("/creatives/:id", async (req, res) => {
  const parseResult = DeleteCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(creativesTable)
    .where(eq(creativesTable.id, parseResult.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Creative not found" });
    return;
  }

  res.status(204).send();
});

// POST /creatives/:id/analyze
router.post("/creatives/:id/analyze", async (req, res) => {
  const parseResult = AnalyzeCreativeParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db
    .select()
    .from(creativesTable)
    .where(eq(creativesTable.id, parseResult.data.id));

  if (!row) {
    res.status(404).json({ error: "Creative not found" });
    return;
  }

  const m = withMetrics(row);
  const { decision, roas, commission, spend, ctr, hookRate, daysWithoutSales } = m;

  let explanation = "";
  let nextAction = "";

  switch (decision) {
    case "ESCALAR":
      explanation = `"${row.name}" is performing exceptionally well with a ROAS of ${roas.toFixed(2)}x. Commission of $${commission.toFixed(0)} on $${spend.toFixed(0)} spend shows strong profitability. CTR of ${ctr.toFixed(2)}% and hook rate of ${hookRate.toFixed(2)}% indicate high audience engagement.`;
      nextAction = `Increase budget by 20-30% and monitor performance over the next 48 hours. Consider duplicating this creative to test new audiences while the original continues to scale.`;
      break;
    case "MONITORAR":
      explanation = `"${row.name}" is showing acceptable returns with a ROAS of ${roas.toFixed(2)}x, but hasn't crossed the scale threshold of 2.0x yet. Revenue is covering spend with a ${((roas - 1) * 100).toFixed(0)}% margin. ${daysWithoutSales > 0 ? `Note: ${daysWithoutSales} day(s) without sales, which could indicate fatigue.` : ""}`;
      nextAction = `Hold current budget. Review ad creative and audience overlap. A/B test new hooks or CTAs to push ROAS above 2.0x. Reassess within 24-48 hours.`;
      break;
    case "OTIMIZAR":
      explanation = `"${row.name}" is breaking even with a ROAS of ${roas.toFixed(2)}x, meaning spend is barely covered by commission revenue. CTR of ${ctr.toFixed(2)}% and hook rate of ${hookRate.toFixed(2)}% need improvement. ${daysWithoutSales > 0 ? `${daysWithoutSales} day(s) without sales is a warning sign.` : ""}`;
      nextAction = `Reduce budget by 30-50% immediately. Test a new hook, creative format, or audience segment. Consider refreshing ad copy and visuals. Set a 72-hour window — if no improvement, pause.`;
      break;
    case "PAUSAR":
      if (daysWithoutSales >= 2) {
        explanation = `"${row.name}" has been paused due to ${daysWithoutSales} consecutive days without sales — a hard stop rule regardless of ROAS. Creative fatigue or audience exhaustion is likely.`;
        nextAction = `Pause this creative immediately. Analyze which audience segments it last converted on. Rework the creative concept with a fresh hook and relaunch to a cold lookalike audience.`;
      } else {
        explanation = `"${row.name}" is losing money with a ROAS of ${roas.toFixed(2)}x — commission ($${commission.toFixed(0)}) is below spend ($${spend.toFixed(0)}). Low CTR (${ctr.toFixed(2)}%) suggests the ad isn't compelling enough to capture attention.`;
        nextAction = `Pause this creative immediately to stop the bleed. Do a post-mortem: was the hook weak? Wrong audience? Poor offer alignment? Archive learnings before relaunching with a completely different angle.`;
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
