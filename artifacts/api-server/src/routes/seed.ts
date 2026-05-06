import { Router } from "express";
import { db, creativesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

const DEMO_NAMES = [
  "Verão-Camiseta-BF",
  "BlackFriday-Calçado",
  "Natal-Perfume-Rosa",
  "Copa-Camisa-BR",
  "Dia-Maes-Bolsa",
  "Carnaval-Fantasia",
  "Inverno-Jaqueta-23",
  "Páscoa-Chocolate",
  "Dia-Namorados-Kit",
];

router.post("/seed-demo", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;

  for (const name of DEMO_NAMES) {
    await db.delete(creativesTable).where(
      and(eq(creativesTable.userId, userId), eq(creativesTable.name, name))
    );
  }

  // 1. Verão-Camiseta-BF → ESCALAR (ROAS 3.67×, dias=0)
  //    spend=1400, 5×20m → commission=5131.90, ROAS=3.67×
  //    Rodando há 14 dias; +LTV
  const [c1] = await db.insert(creativesTable).values({
    userId, name: "Verão-Camiseta-BF", date: daysAgo(14),
    spend: 1400, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 0, sales16m: 0, sales20m: 5,
    ctr: 4.2, hookRate: 0,
  }).returning();

  // 2. BlackFriday-Calçado → LUCRATIVO (ROAS 2.42×, dias=0)
  //    spend=1000, 5×12m → commission=2421.90, ROAS=2.42×
  //    Rodando há 10 dias; +LTV
  const [c2] = await db.insert(creativesTable).values({
    userId, name: "BlackFriday-Calçado", date: daysAgo(10),
    spend: 1000, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 5, sales16m: 0, sales20m: 0,
    ctr: 3.6, hookRate: 0,
  }).returning();

  // 3. Natal-Perfume-Rosa → ATENÇÃO (ROAS 1.18×, dias=0)
  //    spend=750, 3×7m → commission=886.14, ROAS=1.18×
  //    Rodando há 8 dias; ROAS < 2 → ATENÇÃO
  await db.insert(creativesTable).values({
    userId, name: "Natal-Perfume-Rosa", date: daysAgo(8),
    spend: 750, sales5m: 0, sales7m: 3, sales9m: 0, sales12m: 0, sales16m: 0, sales20m: 0,
    ctr: 2.4, hookRate: 0,
  });

  // 4. Copa-Camisa-BR → MONITORAR Lucrativo (ROAS 3.42×, dias=1)
  //    spend=1200 (12 dias × R$100), 4×20m → commission=4105.52, ROAS=3.42×
  //    Rodando há 12 dias; lastSaleAt=1 dia → MONITORAR lucrativo (ROAS>=3)
  const [c4] = await db.insert(creativesTable).values({
    userId, name: "Copa-Camisa-BR", date: daysAgo(12),
    spend: 1200, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 0, sales16m: 0, sales20m: 4,
    ctr: 4.8, hookRate: 0,
  }).returning();

  // 5. Dia-Maes-Bolsa → MONITORAR Decaindo (ROAS 2.08×, dias=1)
  //    spend=700, 3×12m → commission=1453.14, ROAS=2.08×
  //    Rodando há 7 dias; lastSaleAt=1 dia → MONITORAR decaindo (ROAS 2–3)
  const [c5] = await db.insert(creativesTable).values({
    userId, name: "Dia-Maes-Bolsa", date: daysAgo(7),
    spend: 700, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 3, sales16m: 0, sales20m: 0,
    ctr: 3.0, hookRate: 0,
  }).returning();

  // 6. Carnaval-Fantasia → MONITORAR Decaindo (ROAS 4.56×, dias=2)
  //    spend=900 (9 dias × R$100), 4×20m → commission=4105.52, ROAS=4.56×
  //    Rodando há 9 dias; lastSaleAt=2 dias → MONITORAR decaindo (ROAS>=3.5 salva do corte)
  const [c6] = await db.insert(creativesTable).values({
    userId, name: "Carnaval-Fantasia", date: daysAgo(9),
    spend: 900, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 0, sales16m: 0, sales20m: 4,
    ctr: 3.3, hookRate: 0,
  }).returning();

  // 7. Inverno-Jaqueta-23 → PAUSAR Sem Vendas (ROAS 1.74×, dias=2, ROAS<3.5)
  //    spend=600, 1×16m + 1×12m → commission=1046.76, ROAS=1.74×
  //    Rodando há 6 dias; lastSaleAt=2 dias → PAUSAR semVendas (ROAS<3.5)
  const [c7] = await db.insert(creativesTable).values({
    userId, name: "Inverno-Jaqueta-23", date: daysAgo(6),
    spend: 600, sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 1, sales16m: 1, sales20m: 0,
    ctr: 1.8, hookRate: 0,
  }).returning();

  // 8. Páscoa-Chocolate → PAUSAR Sem Vendas (ROAS 1.37×, dias=3)
  //    spend=900, 2×9m + 1×12m → commission=1237.14, ROAS=1.37×
  //    Rodando há 9 dias; lastSaleAt=3 dias → PAUSAR semVendas (3 dias = corte sempre)
  const [c8] = await db.insert(creativesTable).values({
    userId, name: "Páscoa-Chocolate", date: daysAgo(9),
    spend: 900, sales5m: 0, sales7m: 0, sales9m: 2, sales12m: 1, sales16m: 0, sales20m: 0,
    ctr: 2.1, hookRate: 0,
  }).returning();

  // 9. Dia-Namorados-Kit → PAUSAR Prejuízo (ROAS 0.40×)
  //    spend=600, 1×5m → commission=241.38, ROAS=0.40×
  //    Rodando há 5 dias; ROAS < 1 → PAUSAR prejuízo
  await db.insert(creativesTable).values({
    userId, name: "Dia-Namorados-Kit", date: daysAgo(5),
    spend: 600, sales5m: 1, sales7m: 0, sales9m: 0, sales12m: 0, sales16m: 0, sales20m: 0,
    ctr: 1.2, hookRate: 0,
  });

  // Ajusta lastSaleAt para simular dias sem venda
  await db.update(creativesTable).set({ lastSaleAt: sql`NOW() - INTERVAL '1 day'` }).where(sql`id = ${c4.id}`);
  await db.update(creativesTable).set({ lastSaleAt: sql`NOW() - INTERVAL '1 day'` }).where(sql`id = ${c5.id}`);
  await db.update(creativesTable).set({ lastSaleAt: sql`NOW() - INTERVAL '2 days'` }).where(sql`id = ${c6.id}`);
  await db.update(creativesTable).set({ lastSaleAt: sql`NOW() - INTERVAL '2 days'` }).where(sql`id = ${c7.id}`);
  await db.update(creativesTable).set({ lastSaleAt: sql`NOW() - INTERVAL '3 days'` }).where(sql`id = ${c8.id}`);

  // LTV para criativos 1 e 2
  // c1: 3×9m LTV = 3×376.38 = 1129.14
  await db.update(creativesTable).set({ ltvCommission: 1129.14 }).where(sql`id = ${c1.id}`);
  // c2: 2×16m LTV = 2×562.38 = 1124.76
  await db.update(creativesTable).set({ ltvCommission: 1124.76 }).where(sql`id = ${c2.id}`);

  req.log.info({ userId }, "seed-demo executed");
  res.json({ ok: true, count: DEMO_NAMES.length });
});

export default router;
