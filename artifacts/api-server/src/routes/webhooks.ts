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
// userId param scopes the lookup to a specific user's creatives (prevents cross-tenant writes)
router.post("/webhooks/simulate", async (req, res) => {
  const { creativeName, plan, cancelled, userId } = req.body as {
    creativeName: string;
    plan: string;
    cancelled?: boolean;
    userId?: string;
  };

  if (!creativeName || !plan) {
    res.status(200).json({ ok: false, reason: "missing_fields" });
    return;
  }

  let creative: typeof creativesTable.$inferSelect | undefined;
  if (userId) {
    const rows = await db.select().from(creativesTable).where(
      and(eq(creativesTable.userId, userId), eq(creativesTable.name, creativeName))
    );
    creative = rows[0];
  } else {
    const rows = await db.select().from(creativesTable);
    creative = rows.find(r => r.name.toLowerCase() === creativeName.toLowerCase());
  }

  if (!creative) {
    res.status(200).json({ ok: false, reason: "creative_not_found", utmContent: creativeName });
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
