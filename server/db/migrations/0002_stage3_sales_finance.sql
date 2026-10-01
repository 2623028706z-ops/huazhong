CREATE TYPE "public"."after_origin" AS ENUM('store', 'sales');--> statement-breakpoint
CREATE TYPE "public"."after_reason" AS ENUM('damaged', 'qty_mismatch', 'quality', 'other');--> statement-breakpoint
CREATE TYPE "public"."after_status" AS ENUM('pending', 'processed', 'closed', 'voided');--> statement-breakpoint
CREATE TYPE "public"."alloc_kind" AS ENUM('receipt', 'prepaid');--> statement-breakpoint
CREATE TYPE "public"."file_purpose" AS ENUM('after_image', 'product_image');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'ok', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."method_kind" AS ENUM('receive', 'pay');--> statement-breakpoint
CREATE TYPE "public"."order_origin" AS ENUM('store', 'sales');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_confirm', 'to_ship', 'shipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('valid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."store_invite_status" AS ENUM('pending', 'used', 'expired', 'voided');--> statement-breakpoint
CREATE TABLE "files" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"cos_key" text NOT NULL,
	"thumb_key" text,
	"size_bytes" integer NOT NULL,
	"mime" text NOT NULL,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "files_cosKey_unique" UNIQUE("cos_key"),
	CONSTRAINT "files_size_positive" CHECK ("files"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "catalog_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"customer_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"price_cents" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "catalog_items_customerId_productId_unique" UNIQUE("customer_id","product_id"),
	CONSTRAINT "catalog_items_price_nonnegative" CHECK ("catalog_items"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_bom_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_bom_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"material_id" bigint NOT NULL,
	"qty" integer NOT NULL,
	CONSTRAINT "product_bom_lines_productId_materialId_unique" UNIQUE("product_id","material_id"),
	CONSTRAINT "product_bom_lines_qty_positive" CHECK ("product_bom_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"category_id" bigint NOT NULL,
	"unit" text NOT NULL,
	"image_file_id" bigint,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "store_invites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "store_invites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"store_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"status" "store_invite_status" DEFAULT 'pending' NOT NULL,
	"bound_account_id" bigint,
	"bound_at" timestamp (3) with time zone,
	CONSTRAINT "store_invites_tokenHash_unique" UNIQUE("token_hash"),
	CONSTRAINT "store_invites_used_bound" CHECK (("store_invites"."status" = 'used') = ("store_invites"."bound_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "after_line_images" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "after_line_images_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"after_line_id" bigint NOT NULL,
	"file_id" bigint NOT NULL,
	"sort" smallint NOT NULL,
	CONSTRAINT "after_line_images_afterLineId_fileId_unique" UNIQUE("after_line_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "after_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "after_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"after_id" bigint NOT NULL,
	"order_line_id" bigint NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"requested_qty" integer,
	"qty" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"reason" "after_reason" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort" integer NOT NULL,
	CONSTRAINT "after_lines_afterId_orderLineId_unique" UNIQUE("after_id","order_line_id"),
	CONSTRAINT "after_lines_requested_positive" CHECK ("after_lines"."requested_qty" IS NULL OR "after_lines"."requested_qty" > 0),
	CONSTRAINT "after_lines_qty_nonnegative" CHECK ("after_lines"."qty" >= 0),
	CONSTRAINT "after_lines_price_nonnegative" CHECK ("after_lines"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "afters" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "afters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no" text NOT NULL,
	"after_date" date NOT NULL,
	"order_id" bigint NOT NULL,
	"customer_id" bigint NOT NULL,
	"store_id" bigint NOT NULL,
	"status" "after_status" NOT NULL,
	"origin" "after_origin" NOT NULL,
	"amount_cents" integer,
	"note" text DEFAULT '' NOT NULL,
	"processed_by" bigint,
	"processed_at" timestamp (3) with time zone,
	"close_reason" text,
	"void_reason" text,
	"voided_by" bigint,
	"voided_at" timestamp (3) with time zone,
	CONSTRAINT "afters_no_unique" UNIQUE("no"),
	CONSTRAINT "afters_amount_nonnegative" CHECK ("afters"."amount_cents" IS NULL OR "afters"."amount_cents" >= 0),
	CONSTRAINT "afters_processed_amount" CHECK ("afters"."status" <> 'processed' OR "afters"."amount_cents" IS NOT NULL),
	CONSTRAINT "afters_void_reason" CHECK ("afters"."status" <> 'voided' OR "afters"."void_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "order_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"actor_label" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"items" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"qty" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"list_price_cents" integer NOT NULL,
	"shipped_qty" integer,
	"sort" integer NOT NULL,
	CONSTRAINT "order_lines_orderId_productId_unique" UNIQUE("order_id","product_id"),
	CONSTRAINT "order_lines_qty_positive" CHECK ("order_lines"."qty" > 0),
	CONSTRAINT "order_lines_price_nonnegative" CHECK ("order_lines"."price_cents" >= 0 AND "order_lines"."list_price_cents" >= 0),
	CONSTRAINT "order_lines_shipped_range" CHECK ("order_lines"."shipped_qty" IS NULL OR ("order_lines"."shipped_qty" >= 0 AND "order_lines"."shipped_qty" <= "order_lines"."qty"))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no" text NOT NULL,
	"order_date" date NOT NULL,
	"ship_date" date,
	"customer_id" bigint NOT NULL,
	"store_id" bigint NOT NULL,
	"status" "order_status" NOT NULL,
	"origin" "order_origin" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"confirmed_by" bigint,
	"confirmed_at" timestamp (3) with time zone,
	"shipped_by" bigint,
	"shipped_at" timestamp (3) with time zone,
	"ship_note" text DEFAULT '' NOT NULL,
	"cancelled_by" bigint,
	"cancelled_at" timestamp (3) with time zone,
	"cancel_reason" text,
	CONSTRAINT "orders_no_unique" UNIQUE("no"),
	CONSTRAINT "orders_shipped_at" CHECK ("orders"."status" <> 'shipped' OR "orders"."shipped_at" IS NOT NULL),
	CONSTRAINT "orders_pending_no_ship_date" CHECK ("orders"."status" <> 'pending_confirm' OR "orders"."ship_date" IS NULL),
	CONSTRAINT "orders_ship_date_set" CHECK ("orders"."status" NOT IN ('to_ship', 'shipped') OR "orders"."ship_date" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "allocations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"receipt_id" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"amount_cents" integer NOT NULL,
	"kind" "alloc_kind" NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	CONSTRAINT "allocations_amount_positive" CHECK ("allocations"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_methods_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"kind" "method_kind" NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payment_methods_kind_name_unique" UNIQUE("kind","name")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "receipts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no" text NOT NULL,
	"receipt_date" date NOT NULL,
	"customer_id" bigint NOT NULL,
	"amount_cents" integer NOT NULL,
	"method_name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "record_status" DEFAULT 'valid' NOT NULL,
	"void_reason" text,
	"voided_by" bigint,
	"voided_at" timestamp (3) with time zone,
	CONSTRAINT "receipts_no_unique" UNIQUE("no"),
	CONSTRAINT "receipts_amount_positive" CHECK ("receipts"."amount_cents" > 0),
	CONSTRAINT "receipts_void_reason" CHECK ("receipts"."status" <> 'voided' OR "receipts"."void_reason" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "contact" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bom_lines" ADD CONSTRAINT "product_bom_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bom_lines" ADD CONSTRAINT "product_bom_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bom_lines" ADD CONSTRAINT "product_bom_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_invites" ADD CONSTRAINT "store_invites_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_invites" ADD CONSTRAINT "store_invites_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_invites" ADD CONSTRAINT "store_invites_bound_account_id_accounts_id_fk" FOREIGN KEY ("bound_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_line_images" ADD CONSTRAINT "after_line_images_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_line_images" ADD CONSTRAINT "after_line_images_after_line_id_after_lines_id_fk" FOREIGN KEY ("after_line_id") REFERENCES "public"."after_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_line_images" ADD CONSTRAINT "after_line_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_lines" ADD CONSTRAINT "after_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_lines" ADD CONSTRAINT "after_lines_after_id_afters_id_fk" FOREIGN KEY ("after_id") REFERENCES "public"."afters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "after_lines" ADD CONSTRAINT "after_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "afters" ADD CONSTRAINT "afters_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "afters" ADD CONSTRAINT "afters_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "afters" ADD CONSTRAINT "afters_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "afters" ADD CONSTRAINT "afters_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "afters" ADD CONSTRAINT "afters_processed_by_accounts_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "afters" ADD CONSTRAINT "afters_voided_by_accounts_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_changes" ADD CONSTRAINT "order_changes_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_changes" ADD CONSTRAINT "order_changes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_accounts_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipped_by_accounts_id_fk" FOREIGN KEY ("shipped_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_accounts_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_voided_by_accounts_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_invites_store_time" ON "store_invites" USING btree ("store_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "store_invites_one_pending" ON "store_invites" USING btree ("store_id") WHERE "store_invites"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "afters_order_status" ON "afters" USING btree ("order_id","status");--> statement-breakpoint
CREATE INDEX "afters_store_date" ON "afters" USING btree ("store_id","after_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "afters_status_date" ON "afters" USING btree ("status","after_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "order_changes_order_time" ON "order_changes" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_ship_date" ON "orders" USING btree ("status","ship_date");--> statement-breakpoint
CREATE INDEX "orders_store_date" ON "orders" USING btree ("store_id","order_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_customer_status" ON "orders" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "allocations_order_live" ON "allocations" USING btree ("order_id") WHERE "allocations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "allocations_receipt_live" ON "allocations" USING btree ("receipt_id") WHERE "allocations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "receipts_customer_status" ON "receipts" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "receipts_date" ON "receipts" USING btree ("receipt_date" DESC NULLS LAST);