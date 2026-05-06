import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionSettingsTable = pgTable("commission_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  commission2m: real("commission_2m").notNull().default(161.38),
  commission3m: real("commission_3m").notNull().default(187.38),
  commission5m: real("commission_5m").notNull().default(241.38),
  commission7m: real("commission_7m").notNull().default(295.38),
  commission9m: real("commission_9m").notNull().default(376.38),
  commission12m: real("commission_12m").notNull().default(484.38),
  commission16m: real("commission_16m").notNull().default(562.38),
  commission20m: real("commission_20m").notNull().default(1026.38),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const creativesTable = pgTable("creatives", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  date: text("date").notNull(),
  spend: real("spend").notNull(),
  sales2m: integer("sales_2m").notNull().default(0),
  sales3m: integer("sales_3m").notNull().default(0),
  sales5m: integer("sales_5m").notNull().default(0),
  sales7m: integer("sales_7m").notNull().default(0),
  sales9m: integer("sales_9m").notNull().default(0),
  sales12m: integer("sales_12m").notNull().default(0),
  sales16m: integer("sales_16m").notNull().default(0),
  sales20m: integer("sales_20m").notNull().default(0),
  ctr: real("ctr").notNull().default(0),
  // hookRate kept in DB for backward compatibility, defaulted to 0
  hookRate: real("hook_rate").notNull().default(0),
  // lastSaleAt: updated automatically on every approved postback (Payt/simulate)
  // daysWithoutSales is computed at read time from this field — NOT stored
  lastSaleAt: timestamp("last_sale_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreativeSchema = createInsertSchema(creativesTable).omit({
  id: true,
  createdAt: true,
  hookRate: true,
  lastSaleAt: true,
});

export type InsertCreative = z.infer<typeof insertCreativeSchema>;
export type Creative = typeof creativesTable.$inferSelect;
