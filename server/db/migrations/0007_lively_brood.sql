ALTER TABLE "stock_moves" DROP CONSTRAINT "stock_moves_qty_direction";--> statement-breakpoint
ALTER TABLE "stock_moves" ALTER COLUMN "type" TYPE text USING "type"::text;--> statement-breakpoint
DROP TYPE "public"."move_type";--> statement-breakpoint
CREATE TYPE "public"."move_type" AS ENUM('po_in','po_return','manual_in','in_void','out_void','loss_void','manual_out','loss','check_gain','check_loss');--> statement-breakpoint
ALTER TABLE "stock_moves" ALTER COLUMN "type" TYPE "public"."move_type" USING "type"::"public"."move_type";--> statement-breakpoint
CREATE TABLE "wh_doc_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wh_doc_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"doc_id" bigint NOT NULL,
	"material_id" bigint NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"qty" integer NOT NULL,
	"price_cents" integer,
	"order_price_cents" integer,
	"sort" integer NOT NULL,
	CONSTRAINT "wh_doc_lines_docId_materialId_unique" UNIQUE("doc_id","material_id"),
	CONSTRAINT "wh_doc_lines_qty_positive" CHECK ("wh_doc_lines"."qty" > 0),
	CONSTRAINT "wh_doc_lines_price_nonnegative" CHECK ("wh_doc_lines"."price_cents" IS NULL OR "wh_doc_lines"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_ship_date_set";--> statement-breakpoint
ALTER TABLE "wh_doc_lines" ADD CONSTRAINT "wh_doc_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_doc_lines" ADD CONSTRAINT "wh_doc_lines_doc_id_wh_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."wh_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_doc_lines" ADD CONSTRAINT "wh_doc_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_qty_direction" CHECK (("stock_moves"."type" IN ('po_in', 'manual_in', 'check_gain', 'out_void', 'loss_void')) = ("stock_moves"."qty" > 0) AND "stock_moves"."qty" <> 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_void_reason" CHECK ("orders"."status"::text <> 'voided' OR ("orders"."shipped_at" IS NOT NULL AND "orders"."void_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ship_date_set" CHECK ("orders"."status"::text NOT IN ('to_ship', 'shipped', 'voided') OR "orders"."ship_date" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_void_reason" CHECK ("purchase_orders"."status"::text <> 'voided' OR ("purchase_orders"."received_at" IS NOT NULL AND "purchase_orders"."void_reason" IS NOT NULL));
