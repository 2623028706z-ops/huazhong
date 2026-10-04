CREATE TYPE "public"."statement_kind" AS ENUM('customer', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."statement_status" AS ENUM('unsettled', 'settled', 'voided');--> statement-breakpoint
CREATE TABLE "credit_uses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "credit_uses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"source_receipt_id" bigint,
	"source_payment_id" bigint,
	"source_statement_id" bigint,
	"statement_id" bigint,
	"refund_id" bigint,
	"amount_cents" bigint NOT NULL,
	"released_at" timestamp (3) with time zone,
	CONSTRAINT "credit_uses_source" CHECK (num_nonnulls("credit_uses"."source_receipt_id","credit_uses"."source_payment_id","credit_uses"."source_statement_id")=1),
	CONSTRAINT "credit_uses_target" CHECK (num_nonnulls("credit_uses"."statement_id","credit_uses"."refund_id")=1 AND ("credit_uses"."source_statement_id" IS NULL OR "credit_uses"."statement_id" IS NULL OR "credit_uses"."source_statement_id" <> "credit_uses"."statement_id")),
	CONSTRAINT "credit_uses_amount" CHECK ("credit_uses"."amount_cents">0)
);
--> statement-breakpoint
CREATE TABLE "settlement_links" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "settlement_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"statement_id" bigint NOT NULL,
	"receipt_id" bigint,
	"payment_id" bigint,
	"amount_cents" bigint NOT NULL,
	"reversed_at" timestamp (3) with time zone,
	CONSTRAINT "settlement_links_one_fund" CHECK (num_nonnulls("settlement_links"."receipt_id","settlement_links"."payment_id")=1),
	CONSTRAINT "settlement_links_positive" CHECK ("settlement_links"."amount_cents">0)
);
--> statement-breakpoint
CREATE TABLE "statement_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "statement_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"statement_id" bigint NOT NULL,
	"source_type" text NOT NULL,
	"source_id" bigint NOT NULL,
	"source_version" integer,
	"source_no" text NOT NULL,
	"source_date" date NOT NULL,
	"store_id" bigint,
	"store_name" text,
	"amount_cents" bigint NOT NULL,
	"carries_amount" boolean DEFAULT true NOT NULL,
	"previous_period" boolean NOT NULL,
	"sort" integer NOT NULL,
	"released_at" timestamp (3) with time zone,
	CONSTRAINT "statement_lines_statementId_sourceType_sourceId_unique" UNIQUE("statement_id","source_type","source_id"),
	CONSTRAINT "statement_lines_source_type" CHECK ("statement_lines"."source_type" IN ('order','after','po','wh','purchase_return','price_change'))
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "statements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no" text NOT NULL,
	"kind" "statement_kind" NOT NULL,
	"customer_id" bigint,
	"supplier_id" bigint,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"statement_date" date NOT NULL,
	"due_date" date,
	"note" text DEFAULT '' NOT NULL,
	"gross_cents" bigint NOT NULL,
	"opening_debt_cents" integer DEFAULT 0 NOT NULL,
	"credit_deducted_cents" bigint DEFAULT 0 NOT NULL,
	"due_cents" bigint NOT NULL,
	"credit_generated_cents" bigint DEFAULT 0 NOT NULL,
	"status" "statement_status" NOT NULL,
	"settled_at" timestamp (3) with time zone,
	"void_reason" text,
	"voided_by" bigint,
	"voided_at" timestamp (3) with time zone,
	CONSTRAINT "statements_no_unique" UNIQUE("no"),
	CONSTRAINT "statements_party" CHECK (num_nonnulls("statements"."customer_id","statements"."supplier_id")=1 AND (("statements"."kind"='customer')=("statements"."customer_id" IS NOT NULL))),
	CONSTRAINT "statements_period" CHECK ("statements"."period_from"<="statements"."period_to"),
	CONSTRAINT "statements_amounts" CHECK ("statements"."opening_debt_cents">=0 AND "statements"."credit_deducted_cents">=0 AND "statements"."due_cents">=0 AND "statements"."credit_generated_cents">=0 AND "statements"."due_cents"=greatest("statements"."gross_cents"+"statements"."opening_debt_cents"-"statements"."credit_deducted_cents",0) AND "statements"."credit_generated_cents"=greatest(-("statements"."gross_cents"+"statements"."opening_debt_cents"),0) AND "statements"."credit_deducted_cents"<=greatest("statements"."gross_cents"+"statements"."opening_debt_cents",0)),
	CONSTRAINT "statements_state" CHECK (("statements"."status"<>'settled' OR "statements"."settled_at" IS NOT NULL) AND ("statements"."status"<>'unsettled' OR "statements"."settled_at" IS NULL) AND ("statements"."status"<>'voided' OR ("statements"."void_reason" IS NOT NULL AND length(trim("statements"."void_reason"))>0 AND "statements"."voided_by" IS NOT NULL AND "statements"."voided_at" IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "allocations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_allocations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "allocations" CASCADE;--> statement-breakpoint
DROP TABLE "payment_allocations" CASCADE;--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_amount_positive";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_void_reason";--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_amount_positive";--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_void_reason";--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_one_source";--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_kind_source";--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_amount_positive";--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_void_reason";--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_receipt_id_receipts_id_fk";
--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_payment_id_payments_id_fk";
--> statement-breakpoint
DROP INDEX "refunds_receipt_live";--> statement-breakpoint
DROP INDEX "refunds_payment_live";--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "term_days" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opening_debt_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "term_days" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "opening_debt_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "discount_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "credit_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "discount_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "credit_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "customer_id" bigint;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "supplier_id" bigint;--> statement-breakpoint
ALTER TABLE "purchase_return_lines" ADD COLUMN "price_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_source_receipt_id_receipts_id_fk" FOREIGN KEY ("source_receipt_id") REFERENCES "public"."receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_source_payment_id_payments_id_fk" FOREIGN KEY ("source_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_source_statement_id_statements_id_fk" FOREIGN KEY ("source_statement_id") REFERENCES "public"."statements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_links" ADD CONSTRAINT "settlement_links_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_links" ADD CONSTRAINT "settlement_links_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_links" ADD CONSTRAINT "settlement_links_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_links" ADD CONSTRAINT "settlement_links_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_voided_by_accounts_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_uses_receipt" ON "credit_uses" USING btree ("source_receipt_id") WHERE "credit_uses"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "credit_uses_payment" ON "credit_uses" USING btree ("source_payment_id") WHERE "credit_uses"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "credit_uses_statement_source" ON "credit_uses" USING btree ("source_statement_id") WHERE "credit_uses"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "credit_uses_statement" ON "credit_uses" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "credit_uses_refund" ON "credit_uses" USING btree ("refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_links_live_statement" ON "settlement_links" USING btree ("statement_id") WHERE "settlement_links"."reversed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "settlement_links_receipt" ON "settlement_links" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "settlement_links_payment" ON "settlement_links" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_lines_live_source" ON "statement_lines" USING btree ("source_type","source_id") WHERE "statement_lines"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "statement_lines_statement" ON "statement_lines" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "statements_customer" ON "statements" USING btree ("customer_id","statement_date" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "statements_supplier" ON "statements" USING btree ("supplier_id","statement_date" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "statements_waiting" ON "statements" USING btree ("kind","status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "statements_customer_opening" ON "statements" USING btree ("customer_id") WHERE "statements"."opening_debt_cents">0 AND "statements"."status"<>'voided';--> statement-breakpoint
CREATE UNIQUE INDEX "statements_supplier_opening" ON "statements" USING btree ("supplier_id") WHERE "statements"."opening_debt_cents">0 AND "statements"."status"<>'voided';--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_customer" ON "refunds" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "refunds_supplier" ON "refunds" USING btree ("supplier_id","status");--> statement-breakpoint
ALTER TABLE "refunds" DROP COLUMN "receipt_id";--> statement-breakpoint
ALTER TABLE "refunds" DROP COLUMN "payment_id";--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_terms_nonnegative" CHECK ("customers"."term_days" IS NULL OR "customers"."term_days">=0);--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_opening_nonnegative" CHECK ("customers"."opening_debt_cents">=0);--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_terms_nonnegative" CHECK ("suppliers"."term_days" IS NULL OR "suppliers"."term_days">=0);--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_opening_nonnegative" CHECK ("suppliers"."opening_debt_cents">=0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_discount_reason" CHECK ("payments"."discount_cents"=0 OR length(trim("payments"."discount_reason"))>0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_cents">0 AND "payments"."discount_cents">=0 AND "payments"."credit_cents">=0 AND "payments"."credit_cents"<="payments"."amount_cents");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_void_reason" CHECK ("payments"."status"<>'voided' OR ("payments"."void_reason" IS NOT NULL AND length(trim("payments"."void_reason"))>0 AND "payments"."voided_by" IS NOT NULL AND "payments"."voided_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_discount_reason" CHECK ("receipts"."discount_cents"=0 OR length(trim("receipts"."discount_reason"))>0);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_amount_positive" CHECK ("receipts"."amount_cents">0 AND "receipts"."discount_cents">=0 AND "receipts"."credit_cents">=0 AND "receipts"."credit_cents"<="receipts"."amount_cents");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_void_reason" CHECK ("receipts"."status"<>'voided' OR ("receipts"."void_reason" IS NOT NULL AND length(trim("receipts"."void_reason"))>0 AND "receipts"."voided_by" IS NOT NULL AND "receipts"."voided_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_one_party" CHECK (num_nonnulls("refunds"."customer_id","refunds"."supplier_id")=1 AND (("refunds"."kind"='receipt')=("refunds"."customer_id" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_cents">0);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_void_reason" CHECK ("refunds"."status"<>'voided' OR ("refunds"."void_reason" IS NOT NULL AND length(trim("refunds"."void_reason"))>0 AND "refunds"."voided_by" IS NOT NULL AND "refunds"."voided_at" IS NOT NULL));--> statement-breakpoint
DROP TYPE "public"."alloc_kind";