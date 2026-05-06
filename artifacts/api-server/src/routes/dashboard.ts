import { Router } from "express";
import { db, creativesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { withMetrics, filterByDateRange, getCommissionRates } from "./creatives";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function getGroupKey(dateStr: string, groupBy: "day" | "week" | "month"): string {
  const d = new Date(dateStr + "T00:00:00");
  if (groupBy === "day") return dateStr;
  if (groupBy === "week") {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().split("T")[0];
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatChartLabel(dateStr: string, groupBy: "day" | "week" | "month"): string {
  const [year, month, day] = dateStr.split("-");
  if (groupBy === "day") return `${day}/${month}`;
  if (groupBy === "week") return `Sem ${day}/${month}`;
  const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${monthNames[parseInt(month, 10) - 1]}/${year.slice(2)}`;
}

function determineGroupBy(dateFilter?: string, dateFrom?: string, dateTo?: string): "day" | "week" | "month" {
  if (dateFrom && dateTo) {
    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T00:00:00");
    const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 45) return "day";
    if (days <= 180) return "week";
    return "month";
  }
  if (dateFilter === "all") return "week";
  return "day";
}

// GET /dashboard/summary
router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const dateFilter = req.query.dateFilter as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const rows = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));
  const filtered = rows.filter(r => filterByDateRange(r.date, dateFilter, dateFrom, dateTo));

  if (filtered.length === 0) {
    res.json({ totalSpend: 0, totalCommission: 0, averageRoas: 0, averageCpa: 0, totalSales: 0, totalCreatives: 0 });
    return;
  }

  const rates = await getCommissionRates(userId);
  const results = filtered.map(r => withMetrics(r, rates));
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
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const rows = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));
  const filtered = rows.filter(r => filterByDateRange(r.date, dateFilter, dateFrom, dateTo));
  const rates = await getCommissionRates(userId);
  const results = filtered.map(r => withMetrics(r, rates));

  const breakdown: Record<string, number> = { ESCALAR: 0, LUCRATIVO: 0, MONITORAR: 0, ATENCAO: 0, PAUSAR: 0 };
  for (const c of results) breakdown[c.decision]++;

  res.json(breakdown);
});

// GET /dashboard/performance-summary
router.get("/dashboard/performance-summary", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const dateFilter = req.query.dateFilter as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const rows = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));
  const filtered = rows.filter(r => filterByDateRange(r.date, dateFilter, dateFrom, dateTo));

  if (filtered.length === 0) {
    res.json({
      bestRoas: null,
      worstCpa: null,
      mostSales: null,
      decisions: { ESCALAR: 0, LUCRATIVO: 0, MONITORAR: 0, ATENCAO: 0, PAUSAR: 0 },
      totalCreatives: 0,
    });
    return;
  }

  const rates = await getCommissionRates(userId);
  const results = filtered.map(r => withMetrics(r, rates));

  const bestRoasCreative = results.reduce((best, c) => c.roas > best.roas ? c : best);
  const withSales = results.filter(c => c.totalSales > 0);
  const worstCpaCreative = withSales.length > 0
    ? withSales.reduce((worst, c) => c.cpa > worst.cpa ? c : worst)
    : null;
  const mostSalesCreative = results.reduce((best, c) => c.totalSales > best.totalSales ? c : best);

  const decisions: Record<string, number> = { ESCALAR: 0, LUCRATIVO: 0, MONITORAR: 0, ATENCAO: 0, PAUSAR: 0 };
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
// Groups real sales data by date bucket (day/week/month) — no synthetic data.
// Only points with totalSales > 0 are included.
router.get("/dashboard/charts", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const dateFilter = req.query.dateFilter as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const rows = await db.select().from(creativesTable).where(eq(creativesTable.userId, userId));
  const rates = await getCommissionRates(userId);
  const results = rows.map(r => withMetrics(r, rates));

  // Filter to the requested window
  const filtered = results.filter(r => filterByDateRange(r.date, dateFilter, dateFrom, dateTo));

  // Determine how to group
  const groupBy = determineGroupBy(dateFilter, dateFrom, dateTo);

  // Aggregate real sales by bucket
  const byGroup: Record<string, number> = {};
  for (const c of filtered) {
    if (c.totalSales === 0) continue;
    const key = getGroupKey(c.date, groupBy);
    byGroup[key] = (byGroup[key] ?? 0) + c.totalSales;
  }

  const chartData = Object.entries(byGroup)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalSales]) => ({
      date,
      label: formatChartLabel(date, groupBy),
      totalSales,
      roas: 0,
      cpa: 0,
      spend: 0,
      commission: 0,
    }));

  res.json(chartData);
});

export default router;
