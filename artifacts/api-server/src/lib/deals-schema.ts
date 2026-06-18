import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";

export const dealsTable = sqliteTable("deals", {
  dealId: text("deal_id").primaryKey(),
  itemTitle: text("item_title").notNull(),
  buyerPhone: text("buyer_phone").notNull(),
  sellerPhone: text("seller_phone").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("released"),
  timestamp: text("timestamp").notNull(),
});

export type Deal = typeof dealsTable.$inferSelect;
export type InsertDeal = typeof dealsTable.$inferInsert;
