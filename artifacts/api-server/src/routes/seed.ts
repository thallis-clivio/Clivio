import { Router } from "express";
import { db, creativesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

const DEMO_NAMES = [
  "Verão-Camiseta-BF",
  "BlackFriday-Calçado",
  "Natal-Perfume-Rosa",
  "Dia-Maes-Bolsa",
  "Copa-Camisa-BR",
  "Inverno-Jaqueta-23",
  "Páscoa-Chocolate",
  "Carnaval-Fantasia",
];

router.post("/seed-demo", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;
  const today = new Date().toISOString().split("T")[0];

  // Remove any previous demo creatives for this user (idempotent)
  for (const name of DEMO_NAMES) {
    await db.delete(creativesTable).where(
      and(eq(creativesTable.userId, userId), eq(creativesTable.name, name))
    );
  }

  // 1. Verão-Camiseta-BF — ESCALAR, score 95/EXCELENTE + LTV
  //    spend=300, 2×12m → commission=968.76, ROAS=3.23x, days=0
  const [c1] = await db.insert(creativesTable).values({
    userId, name: "Verão-Camiseta-BF", date: today,
    spend: 300, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 2, sales16m: 0, sales20m: 0,
    ctr: 3.5, hookRate: 0,
  }).returning();

  // 2. BlackFriday-Calçado — ESCALAR, score 90/EXCELENTE + LTV
  //    spend=400, 2×16m → commission=1124.76, ROAS=2.81x, days=0
  const [c2] = await db.insert(creativesTable).values({
    userId, name: "BlackFriday-Calçado", date: today,
    spend: 400, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 0, sales16m: 2, sales20m: 0,
    ctr: 4.1, hookRate: 0,
  }).returning();

  // 3. Natal-Perfume-Rosa — MONITORAR lucrativo, score 55/BOM
  //    spend=350, 1×9m → commission=376.38, ROAS=1.08x, days=0
  await db.insert(creativesTable).values({
    userId, name: "Natal-Perfume-Rosa", date: today,
    spend: 350, sales5m: 0, sales7m: 0, sales9m: 1, sales12m: 0, sales16m: 0, sales20m: 0,
    ctr: 2.8, hookRate: 0,
  });

  // 4. Dia-Maes-Bolsa — MONITORAR decaindo, score 80/EXCELENTE, days=1
  //    spend=200, 1×12m → commission=484.38, ROAS=2.42x
  const [c4] = await db.insert(creativesTable).values({
    userId, name: "Dia-Maes-Bolsa", date: today,
    spend: 200, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 1, sales16m: 0, sales20m: 0,
    ctr: 3.1, hookRate: 0,
  }).returning();

  // 5. Copa-Camisa-BR — MONITORAR decaindo (roas>=3.5 salva do corte), score 68/BOM, days=2
  //    spend=100, 1×12m → commission=484.38, ROAS=4.84x
  const [c5] = await db.insert(creativesTable).values({
    userId, name: "Copa-Camisa-BR", date: today,
    spend: 100, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 1, sales16m: 0, sales20m: 0,
    ctr: 4.5, hookRate: 0,
  }).returning();

  // 6. Inverno-Jaqueta-23 — PAUSAR semVendas, score 0/RUIM, days=2, roas<3.5
  //    spend=400, 1×5m → commission=241.38, ROAS=0.60x
  const [c6] = await db.insert(creativesTable).values({
    userId, name: "Inverno-Jaqueta-23", date: today,
    spend: 400, sales5m: 1, sales7m: 0, sales9m: 0, sales12m: 0, sales16m: 0, sales20m: 0,
    ctr: 1.9, hookRate: 0,
  }).returning();

  // 7. Páscoa-Chocolate — PAUSAR semVendas, score 30/RUIM, days=3
  //    spend=500, 2×9m → commission=752.76, ROAS=1.51x
  const [c7] = await db.insert(creativesTable).values({
    userId, name: "Páscoa-Chocolate", date: today,
    spend: 500, sales5m: 0, sales7m: 0, sales9m: 2, sales12m: 0, sales16m: 0, sales20m: 0,
    ctr: 2.3, hookRate: 0,
  }).returning();

  // 8. Carnaval-Fantasia — PAUSAR prejuízo (zero vendas), score 0/RUIM
  //    spend=600, no sales → ROAS=0
  await db.insert(creativesTable).values({
    userId, name: "Carnaval-Fantasia", date: today,
    spend: 600, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 0, sales16m: 0, sales20m: 0,
    ctr: 1.5, hookRate: 0,
  });

  // Ajusta lastSaleAt para simular dias sem venda (computed at read time)
  await db.update(creativesTable)
    .set({ lastSaleAt: sql`NOW() - INTERVAL '1 day'` })
    .where(sql`id = ${c4.id}`);

  await db.update(creativesTable)
    .set({ lastSaleAt: sql`NOW() - INTERVAL '2 days'` })
    .where(sql`id = ${c5.id}`);

  await db.update(creativesTable)
    .set({ lastSaleAt: sql`NOW() - INTERVAL '2 days'` })
    .where(sql`id = ${c6.id}`);

  await db.update(creativesTable)
    .set({ lastSaleAt: sql`NOW() - INTERVAL '3 days'` })
    .where(sql`id = ${c7.id}`);

  // Adiciona comissão LTV para dois criativos (não afeta ROAS/decisão)
  // c1: 3 vendas LTV 9m = 3 × 376.38 = 1129.14
  await db.update(creativesTable)
    .set({ ltvCommission: 1129.14 })
    .where(sql`id = ${c1.id}`);

  // c2: 2 vendas LTV 12m = 2 × 484.38 = 968.76
  await db.update(creativesTable)
    .set({ ltvCommission: 968.76 })
    .where(sql`id = ${c2.id}`);

  req.log.info({ userId }, "seed-demo executed");
  res.json({ ok: true, count: DEMO_NAMES.length });
});

export default router;
