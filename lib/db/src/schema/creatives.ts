import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creativesTable = pgTable("creatives", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  spend: real("spend").notNull(),
  sales5m: integer("sales_5m").notNull().default(0),
  sales7m: integer("sales_7m").notNull().default(0),
  sales9m: integer("sales_9m").notNull().default(0),
  sales12m: integer("sales_12m").notNull().default(0),
  sales16m: integer("sales_16m").notNull().default(0),
  sales20m: integer("sales_20m").notNull().default(0),
  ctr: real("ctr").notNull(),
  hookRate: real("hook_rate").notNull(),
  daysWithoutSales: integer("days_without_sales").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreativeSchema = createInsertSchema(creativesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCreative = z.infer<typeof insertCreativeSchema>;
export type Creative = typeof creativesTable.$inferSelect;
