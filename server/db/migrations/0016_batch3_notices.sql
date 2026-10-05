ALTER TABLE "afters" ADD COLUMN "store_notice_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "afters" ADD COLUMN "store_seen_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "store_notice_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "store_seen_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "diff_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "diff_by" bigint;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "buyer_seen_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "buyer_seen_by" bigint;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_diff_by_accounts_id_fk" FOREIGN KEY ("diff_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_buyer_seen_by_accounts_id_fk" FOREIGN KEY ("buyer_seen_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- 上线前已有的结果、差异当作已经看过（旧单不亮红点、不进待办）
UPDATE "afters" SET "store_notice_at"=coalesce("voided_at","processed_at","updated_at"),"store_seen_at"=coalesce("voided_at","processed_at","updated_at") WHERE "status"::text<>'pending';--> statement-breakpoint
UPDATE "orders" o SET "store_notice_at"=r."handled_at","store_seen_at"=r."handled_at"
FROM (SELECT "order_id",max("handled_at") AS "handled_at" FROM "order_cancel_requests" WHERE "status"::text IN ('approved','rejected') GROUP BY "order_id") r
WHERE r."order_id"=o."id";--> statement-breakpoint
UPDATE "purchase_orders" po SET "diff_at"=coalesce(po."voided_at",po."received_at"),"diff_by"=coalesce(po."voided_by",po."received_by"),"buyer_seen_at"=coalesce(po."voided_at",po."received_at"),"buyer_seen_by"=po."buyer_id"
WHERE po."received_at" IS NOT NULL AND (po."status"::text='voided' OR EXISTS (SELECT 1 FROM "purchase_order_lines" l WHERE l."po_id"=po."id" AND (coalesce(l."received_qty",0)<>l."qty" OR l."price_cents"<>l."order_price_cents" OR l."returned_qty">0)));
