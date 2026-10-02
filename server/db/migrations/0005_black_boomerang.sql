CREATE TYPE "public"."cancel_request_status" AS ENUM('pending', 'withdrawn', 'approved', 'rejected', 'lapsed');--> statement-breakpoint
CREATE TYPE "public"."refund_kind" AS ENUM('receipt', 'payment');--> statement-breakpoint
CREATE TYPE "public"."wh_doc_kind" AS ENUM('in', 'out', 'loss');--> statement-breakpoint
CREATE TYPE "public"."wh_doc_status" AS ENUM('stocked_in', 'stocked_out', 'lost', 'voided');--> statement-breakpoint
ALTER TYPE "public"."alloc_kind" RENAME VALUE 'receipt' TO 'direct';--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'loss_image';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'voided';--> statement-breakpoint
ALTER TYPE "public"."po_status" ADD VALUE 'voided';--> statement-breakpoint
CREATE TABLE "out_categories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "out_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "out_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "wh_doc_images" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wh_doc_images_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"doc_id" bigint NOT NULL,
	"file_id" bigint NOT NULL,
	"sort" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wh_docs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wh_docs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no" text NOT NULL,
	"kind" "wh_doc_kind" NOT NULL,
	"doc_date" date NOT NULL,
	"status" "wh_doc_status" NOT NULL,
	"supplier_id" bigint,
	"out_category_id" bigint,
	"reason" text DEFAULT '' NOT NULL,
	"void_reason" text,
	"voided_by" bigint,
	"voided_at" timestamp (3) with time zone,
	CONSTRAINT "wh_docs_no_unique" UNIQUE("no"),
	CONSTRAINT "wh_docs_supplier" CHECK (("wh_docs"."kind" = 'in') = ("wh_docs"."supplier_id" IS NOT NULL)),
	CONSTRAINT "wh_docs_category" CHECK (("wh_docs"."kind" = 'out') = ("wh_docs"."out_category_id" IS NOT NULL)),
	CONSTRAINT "wh_docs_loss_reason" CHECK ("wh_docs"."kind" <> 'loss' OR "wh_docs"."reason" <> ''),
	CONSTRAINT "wh_docs_status" CHECK (("wh_docs"."kind" = 'in' AND "wh_docs"."status" IN ('stocked_in','voided')) OR ("wh_docs"."kind" = 'out' AND "wh_docs"."status" IN ('stocked_out','voided')) OR ("wh_docs"."kind" = 'loss' AND "wh_docs"."status" IN ('lost','voided'))),
	CONSTRAINT "wh_docs_void_reason" CHECK ("wh_docs"."status" <> 'voided' OR "wh_docs"."void_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "order_cancel_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_cancel_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"status" "cancel_request_status" DEFAULT 'pending' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"requested_by" bigint NOT NULL,
	"requested_at" timestamp (3) with time zone NOT NULL,
	"handled_by" bigint,
	"handled_at" timestamp (3) with time zone,
	"reject_reason" text,
	CONSTRAINT "order_cancel_requests_reject_reason" CHECK ("order_cancel_requests"."status" <> 'rejected' OR "order_cancel_requests"."reject_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_allocations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"payment_id" bigint NOT NULL,
	"po_id" bigint,
	"wh_doc_id" bigint,
	"amount_cents" integer NOT NULL,
	"kind" "alloc_kind" NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by" bigint,
	"revoke_reason" text,
	CONSTRAINT "payment_allocations_amount_positive" CHECK ("payment_allocations"."amount_cents" > 0),
	CONSTRAINT "payment_allocations_one_doc" CHECK (num_nonnulls("payment_allocations"."po_id", "payment_allocations"."wh_doc_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "refunds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no" text NOT NULL,
	"kind" "refund_kind" NOT NULL,
	"receipt_id" bigint,
	"payment_id" bigint,
	"refund_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"method_name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "record_status" DEFAULT 'valid' NOT NULL,
	"void_reason" text,
	"voided_by" bigint,
	"voided_at" timestamp (3) with time zone,
	CONSTRAINT "refunds_no_unique" UNIQUE("no"),
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_cents" > 0),
	CONSTRAINT "refunds_one_source" CHECK (num_nonnulls("refunds"."receipt_id", "refunds"."payment_id") = 1),
	CONSTRAINT "refunds_kind_source" CHECK (("refunds"."kind" = 'receipt') = ("refunds"."receipt_id" IS NOT NULL)),
	CONSTRAINT "refunds_void_reason" CHECK ("refunds"."status" <> 'voided' OR ("refunds"."void_reason" <> '' AND "refunds"."voided_at" IS NOT NULL AND "refunds"."voided_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_shipped_range";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "voided_by" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "voided_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "revoked_by" bigint;--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "voided_by" bigint;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "voided_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "out_categories" ADD CONSTRAINT "out_categories_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_doc_images" ADD CONSTRAINT "wh_doc_images_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_doc_images" ADD CONSTRAINT "wh_doc_images_doc_id_wh_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."wh_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_doc_images" ADD CONSTRAINT "wh_doc_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_docs" ADD CONSTRAINT "wh_docs_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_docs" ADD CONSTRAINT "wh_docs_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_docs" ADD CONSTRAINT "wh_docs_out_category_id_out_categories_id_fk" FOREIGN KEY ("out_category_id") REFERENCES "public"."out_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wh_docs" ADD CONSTRAINT "wh_docs_voided_by_accounts_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancel_requests" ADD CONSTRAINT "order_cancel_requests_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancel_requests" ADD CONSTRAINT "order_cancel_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancel_requests" ADD CONSTRAINT "order_cancel_requests_requested_by_accounts_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancel_requests" ADD CONSTRAINT "order_cancel_requests_handled_by_accounts_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_wh_doc_id_wh_docs_id_fk" FOREIGN KEY ("wh_doc_id") REFERENCES "public"."wh_docs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_revoked_by_accounts_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_voided_by_accounts_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wh_docs_kind_date" ON "wh_docs" USING btree ("kind","doc_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "wh_docs_supplier" ON "wh_docs" USING btree ("kind","supplier_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_cancel_requests_pending" ON "order_cancel_requests" USING btree ("order_id") WHERE "order_cancel_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "order_cancel_requests_status_time" ON "order_cancel_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "payment_allocations_po_live" ON "payment_allocations" USING btree ("po_id") WHERE "payment_allocations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payment_allocations_wh_live" ON "payment_allocations" USING btree ("wh_doc_id") WHERE "payment_allocations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_live" ON "payment_allocations" USING btree ("payment_id") WHERE "payment_allocations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "refunds_receipt_live" ON "refunds" USING btree ("receipt_id") WHERE "refunds"."status" = 'valid';--> statement-breakpoint
CREATE INDEX "refunds_payment_live" ON "refunds" USING btree ("payment_id") WHERE "refunds"."status" = 'valid';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_voided_by_accounts_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_revoked_by_accounts_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_voided_by_accounts_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_shipped_range" CHECK ("order_lines"."shipped_qty" IS NULL OR "order_lines"."shipped_qty" >= 0);
