CREATE TYPE "public"."stocktake_status" AS ENUM('done');--> statement-breakpoint
ALTER TYPE "public"."move_type" ADD VALUE 'po_void';--> statement-breakpoint
CREATE TABLE "stocktake_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stocktake_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"stocktake_id" bigint NOT NULL,
	"material_id" bigint NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"book_qty" integer NOT NULL,
	"actual_qty" integer NOT NULL,
	"diff_qty" integer GENERATED ALWAYS AS (actual_qty - book_qty) STORED,
	"sort" integer NOT NULL,
	CONSTRAINT "stocktake_lines_stocktakeId_materialId_unique" UNIQUE("stocktake_id","material_id"),
	CONSTRAINT "stocktake_lines_book" CHECK ("stocktake_lines"."book_qty" >= 0),
	CONSTRAINT "stocktake_lines_actual" CHECK ("stocktake_lines"."actual_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stocktakes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stocktakes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"no" text NOT NULL,
	"check_date" date NOT NULL,
	"status" "stocktake_status" DEFAULT 'done' NOT NULL,
	"categories" jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "stocktakes_no_unique" UNIQUE("no")
);
--> statement-breakpoint
ALTER TABLE "stock_batches" DROP CONSTRAINT "stock_batches_source_link";--> statement-breakpoint
ALTER TABLE "price_changes" ALTER COLUMN "po_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "out_categories" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "price_changes" ADD COLUMN "wh_doc_id" bigint;--> statement-breakpoint
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_stocktake_id_stocktakes_id_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."stocktakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_wh_doc_id_wh_docs_id_fk" FOREIGN KEY ("wh_doc_id") REFERENCES "public"."wh_docs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wh_docs_out_category" ON "wh_docs" USING btree ("kind","out_category_id","doc_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "price_changes_wh_time" ON "price_changes" USING btree ("wh_doc_id","created_at");--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_source_link" CHECK (("stock_batches"."source_type" = 'seed' AND "stock_batches"."source_id" IS NULL) OR ("stock_batches"."source_type" IN ('po', 'wh', 'stocktake') AND "stock_batches"."source_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_doc" CHECK (num_nonnulls("price_changes"."po_id", "price_changes"."wh_doc_id") = 1);--> statement-breakpoint
INSERT INTO "out_categories" ("name", "sort", "created_by")
SELECT defaults.name, defaults.sort, actor.id
FROM (VALUES ('生产领用',0), ('门店零售',1), ('样品',2), ('其他',3)) AS defaults(name,sort)
CROSS JOIN LATERAL (SELECT id FROM accounts WHERE type='admin' ORDER BY id LIMIT 1) AS actor
ON CONFLICT ("name") DO NOTHING;
