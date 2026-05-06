import { Router } from "express";
import { db, creativesTable } from "@workspace/db";
import { withMetrics, filterByDateRange } from "./creatives";

const router = Router();

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res) => {
  const dateFilter = req.query.dateFilter as string | undefined;
  const rows = await db.select().from(creativesTable);

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
router.get("/dashboard/decision-breakdown", async (req, res) => {
  const dateFilter = req.query.dateFilter as string | undefined;
  const rows = await db.select().from(creativesTable);

  const filtered = rows.filter(r => filterByDateRange(r.date, dateFilter));
  const results = filtered.map(withMetrics);

  const breakdown = { ESCALAR: 0, PAUSAR: 0 };
  for (const c of results) breakdown[c.decision]++;

  res.json(breakdown);
});

// GET /dashboard/performance-summary
router.get("/dashboard/performance-summary", async (req, res) => {
  const dateFilter = req.query.dateFilter as string | undefined;
  const rows = await db.select().from(creativesTable);

  const filtered = rows.filter(r => filterByDateRange(r.date, dateFilter));

  if (filtered.length === 0) {
    res.json({
      bestRoas: null,
      worstCpa: null,
      mostSales: null,
      decisions: { ESCALAR: 0, PAUSAR: 0 },
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

  const decisions = { ESCALAR: 0, PAUSAR: 0 };
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
router.get("/dashboard/charts", async (req, res) => {
  const dateFilter = req.query.dateFilter as string | undefined;
  const rows = await db.select().from(creativesTable);

  const filtered = rows.filter(r => filterByDateRange(r.date, dateFilter));
  const results = filtered.map(withMetrics);

  const byDate: Record<string, { spend: number; commission: number; totalSales: number; count: number; roasSum: number; cpaSum: number; cpaCount: number }> = {};

  for (const c of results) {
    if (!byDate[c.date]) {
      byDate[c.date] = { spend: 0, commission: 0, totalSales: 0, count: 0, roasSum: 0, cpaSum: 0, cpaCount: 0 };
    }
    const d = byDate[c.date];
    d.spend += c.spend;
    d.commission += c.commission;
    d.totalSales += c.totalSales;
    d.count += 1;
    d.roasSum += c.roas;
    if (c.cpa > 0) { d.cpaSum += c.cpa; d.cpaCount += 1; }
  }

  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      roas: d.count > 0 ? Math.round((d.roasSum / d.count) * 100) / 100 : 0,
      cpa: d.cpaCount > 0 ? Math.round((d.cpaSum / d.cpaCount) * 100) / 100 : 0,
      totalSales: d.totalSales,
      spend: Math.round(d.spend * 100) / 100,
      commission: Math.round(d.commission * 100) / 100,
    }));

  res.json(chartData);
});

export default router;
