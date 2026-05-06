import { Router } from "express";
import { db, creativesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const DEMO_CREATIVES = [
  {
    name: "Hipotese_ESCALAR",
    date: "2026-05-06",
    spend: 500,
    sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 3, sales16m: 0, sales20m: 0,
    ctr: 3.5,
    hookRate: 0,
    daysWithoutSales: 0,
  },
  {
    name: "Hipotese_PAUSAR",
    date: "2026-05-06",
    spend: 600,
    sales5m: 0, sales7m: 0, sales9m: 0, sales12m: 0, sales16m: 0, sales20m: 0,
    ctr: 1.2,
    hookRate: 0,
    daysWithoutSales: 3,
  },
  {
    name: "Hipotese_MONITORAR_Lucrativo",
    date: "2026-05-06",
    spend: 400,
    sales5m: 0, sales7m: 2, sales9m: 0, sales12m: 0, sales16m: 0, sales20m: 0,
    ctr: 2.8,
    hookRate: 0,
    daysWithoutSales: 0,
  },
  {
    name: "Hipotese_MONITORAR_Decaindo",
    date: "2026-05-06",
    spend: 350,
    sales5m: 0, sales7m: 0, sales9m: 2, sales12m: 0, sales16m: 0, sales20m: 0,
    ctr: 4.1,
    hookRate: 0,
    daysWithoutSales: 1,
  },
];

router.post("/seed-demo", async (req, res) => {
  const results: string[] = [];

  for (const demo of DEMO_CREATIVES) {
    const existing = await db.select().from(creativesTable)
      .where(eq(creativesTable.name, demo.name));

    if (existing.length === 0) {
      await db.insert(creativesTable).values(demo);
      results.push(`Criado: ${demo.name}`);
    } else {
      results.push(`Já existe: ${demo.name}`);
    }
  }

  req.log.info({ results }, "seed-demo executed");
  res.json({ ok: true, results });
});

export default router;
