CREATE TABLE "order_line_bom_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_line_bom_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"order_line_id" bigint NOT NULL,
	"material_id" bigint NOT NULL,
	"material_name" text NOT NULL,
	"unit" text NOT NULL,
	"qty" integer NOT NULL,
	CONSTRAINT "order_line_bom_lines_orderLineId_materialId_unique" UNIQUE("order_line_id","material_id"),
	CONSTRAINT "order_line_bom_lines_qty_positive" CHECK ("order_line_bom_lines"."qty" > 0)
);--> statement-breakpoint
ALTER TABLE "order_line_bom_lines" ADD CONSTRAINT "order_line_bom_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_bom_lines" ADD CONSTRAINT "order_line_bom_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_bom_lines" ADD CONSTRAINT "order_line_bom_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- 产品改成按客户：每条订货目录记录拆成这个客户自己的产品（配方照抄），订单明细改指向新产品
ALTER TABLE "products" DROP CONSTRAINT "products_name_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_product_categories_id_fk";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "customer_id" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "customer_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_product_id" bigint;--> statement-breakpoint
INSERT INTO "products" ("created_by","customer_id","name","category_id","unit","image_file_id","customer_code","price_cents","enabled","source_product_id")
SELECT ci."created_by",ci."customer_id",p."name",ci."category_id",p."unit",p."image_file_id",ci."customer_code",ci."price_cents",ci."enabled" AND p."enabled",p."id"
FROM "catalog_items" ci JOIN "products" p ON p."id"=ci."product_id" ORDER BY ci."id";--> statement-breakpoint
-- 订单里用过、但这个客户目录里已经没有的产品：给这个客户复制一份停用的（没有订货分类的先建「未分类」）
INSERT INTO "catalog_categories" ("customer_id","name","sort","created_by")
SELECT o."customer_id",'未分类',0,min(o."created_by")
FROM "order_lines" ol JOIN "orders" o ON o."id"=ol."order_id"
WHERE NOT EXISTS (SELECT 1 FROM "catalog_items" ci WHERE ci."customer_id"=o."customer_id" AND ci."product_id"=ol."product_id")
  AND NOT EXISTS (SELECT 1 FROM "catalog_categories" c WHERE c."customer_id"=o."customer_id")
GROUP BY o."customer_id";--> statement-breakpoint
INSERT INTO "products" ("created_by","customer_id","name","category_id","unit","image_file_id","price_cents","enabled","source_product_id")
SELECT DISTINCT ON (o."customer_id",p."id") p."created_by",o."customer_id",p."name",
  (SELECT c."id" FROM "catalog_categories" c WHERE c."customer_id"=o."customer_id" ORDER BY c."sort",c."id" LIMIT 1),
  p."unit",p."image_file_id",ol."list_price_cents",false,p."id"
FROM "order_lines" ol JOIN "orders" o ON o."id"=ol."order_id" JOIN "products" p ON p."id"=ol."product_id"
WHERE NOT EXISTS (SELECT 1 FROM "catalog_items" ci WHERE ci."customer_id"=o."customer_id" AND ci."product_id"=ol."product_id")
ORDER BY o."customer_id",p."id",ol."id" DESC;--> statement-breakpoint
INSERT INTO "product_bom_lines" ("product_id","material_id","qty","created_by")
SELECT np."id",b."material_id",b."qty",b."created_by"
FROM "products" np JOIN "product_bom_lines" b ON b."product_id"=np."source_product_id" ORDER BY np."id",b."id";--> statement-breakpoint
UPDATE "order_lines" ol SET "product_id"=np."id"
FROM "orders" o, "products" np
WHERE o."id"=ol."order_id" AND np."source_product_id"=ol."product_id" AND np."customer_id"=o."customer_id";--> statement-breakpoint
-- 已发货的明细按迁移时的配方补一份发货配方
INSERT INTO "order_line_bom_lines" ("order_line_id","material_id","material_name","unit","qty","created_by")
SELECT ol."id",b."material_id",m."name",m."unit",b."qty",ol."created_by"
FROM "order_lines" ol JOIN "product_bom_lines" b ON b."product_id"=ol."product_id" JOIN "materials" m ON m."id"=b."material_id"
WHERE ol."shipped_qty" > 0 ORDER BY ol."id",b."id";--> statement-breakpoint
DROP TABLE "catalog_items" CASCADE;--> statement-breakpoint
DELETE FROM "product_bom_lines" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "customer_id" IS NULL);--> statement-breakpoint
DELETE FROM "products" WHERE "customer_id" IS NULL;--> statement-breakpoint
DROP TABLE "product_categories" CASCADE;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "source_product_id";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "customer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_catalog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."catalog_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_customer_code_unique" ON "products" USING btree ("customer_id","customer_code") WHERE "products"."customer_code" <> '';--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_customer_name_unique" UNIQUE("customer_id","name");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_nonnegative" CHECK ("products"."price_cents" >= 0);