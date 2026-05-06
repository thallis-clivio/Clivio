import { Router } from "express";
import { db, commissionSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { DEFAULT_RATES, CommissionRates } from "./creatives";

const router = Router();

// GET /settings/commissions
router.get("/settings/commissions", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const [row] = await db.select().from(commissionSettingsTable).where(
    eq(commissionSettingsTable.userId, userId)
  );
  if (!row) {
    res.json(DEFAULT_RATES);
    return;
  }
  const rates: CommissionRates = {
    commission2m: row.commission2m,
    commission3m: row.commission3m,
    commission5m: row.commission5m,
    commission7m: row.commission7m,
    commission9m: row.commission9m,
    commission12m: row.commission12m,
    commission16m: row.commission16m,
    commission20m: row.commission20m,
  };
  res.json(rates);
});

// PUT /settings/commissions
router.put("/settings/commissions", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const body = req.body as Partial<CommissionRates>;

  const rates: CommissionRates = {
    commission2m: Number(body.commission2m ?? DEFAULT_RATES.commission2m),
    commission3m: Number(body.commission3m ?? DEFAULT_RATES.commission3m),
    commission5m: Number(body.commission5m ?? DEFAULT_RATES.commission5m),
    commission7m: Number(body.commission7m ?? DEFAULT_RATES.commission7m),
    commission9m: Number(body.commission9m ?? DEFAULT_RATES.commission9m),
    commission12m: Number(body.commission12m ?? DEFAULT_RATES.commission12m),
    commission16m: Number(body.commission16m ?? DEFAULT_RATES.commission16m),
    commission20m: Number(body.commission20m ?? DEFAULT_RATES.commission20m),
  };

  await db.insert(commissionSettingsTable)
    .values({ userId, ...rates })
    .onConflictDoUpdate({
      target: commissionSettingsTable.userId,
      set: { ...rates, updatedAt: new Date() },
    });

  res.json(rates);
});

export default router;
