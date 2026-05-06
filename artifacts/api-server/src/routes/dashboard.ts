import { Router } from "express";
import { db, creativesTable } from "@workspace/db";

const router = Router();

function computeCommission(c: {
  sales5m: number;
  sales7m: number;
  sales9m: number;
  sales12m: number;
  sales16m: number;
  sales20m: number;
}): number {
  return (
    c.sales5m * 217 +
    c.sales7m * 300 +
    c.sales9m * 380 +
    c.sales12m * 460 +
    c.sales16m * 520 +
    c.sales20m * 650
  );
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
  const roas = c.spend > 0 ? commission / c.spend : 0;
  const decision = computeDecision(roas, c.daysWithoutSales);
  return { ...c, commission, roas: Math.round(roas * 100) / 100, decision };
}

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res) => {
  const rows = await db.select().from(creativesTable);

  if (rows.length === 0) {
    res.json({
      totalSpend: 0,
      totalCommission: 0,
      averageRoas: 0,
      totalCreatives: 0,
    });
    return;
  }

  const results = rows.map(withMetrics);
  const totalSpend = results.reduce((sum, c) => sum + c.spend, 0);
  const totalCommission = results.reduce((sum, c) => sum + c.commission, 0);
  const averageRoas =
    totalSpend > 0 ? Math.round((totalCommission / totalSpend) * 100) / 100 : 0;

  const topCreativeByRoas = results.reduce((best, c) =>
    c.roas > best.roas ? c : best
  );

  res.json({
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalCommission: Math.round(totalCommission * 100) / 100,
    averageRoas,
    totalCreatives: results.length,
    topCreativeByRoas: {
      id: topCreativeByRoas.id,
      name: topCreativeByRoas.name,
      date: topCreativeByRoas.date,
      spend: topCreativeByRoas.spend,
      sales5m: topCreativeByRoas.sales5m,
      sales7m: topCreativeByRoas.sales7m,
      sales9m: topCreativeByRoas.sales9m,
      sales12m: topCreativeByRoas.sales12m,
      sales16m: topCreativeByRoas.sales16m,
      sales20m: topCreativeByRoas.sales20m,
      ctr: topCreativeByRoas.ctr,
      hookRate: topCreativeByRoas.hookRate,
      daysWithoutSales: topCreativeByRoas.daysWithoutSales,
      commission: topCreativeByRoas.commission,
      roas: topCreativeByRoas.roas,
      decision: topCreativeByRoas.decision,
    },
  });
});

// GET /dashboard/decision-breakdown
router.get("/dashboard/decision-breakdown", async (req, res) => {
  const rows = await db.select().from(creativesTable);
  const results = rows.map(withMetrics);

  const breakdown = { ESCALAR: 0, MONITORAR: 0, OTIMIZAR: 0, PAUSAR: 0 };
  for (const c of results) {
    breakdown[c.decision]++;
  }

  res.json(breakdown);
});

export default router;
