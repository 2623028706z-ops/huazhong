CREATE TYPE "public"."account_type" AS ENUM('admin', 'staff', 'store', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."module_key" AS ENUM('sales', 'shipping', 'purchase', 'warehouse', 'finance');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "customers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"customer_id" bigint NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "stores_customerId_name_unique" UNIQUE("customer_id","name")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suppliers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "account_modules" (
	"account_id" bigint NOT NULL,
	"module" "module_key" NOT NULL,
	CONSTRAINT "account_modules_account_id_module_pk" PRIMARY KEY("account_id","module")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"type" "account_type" NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"openid" text,
	"store_id" bigint,
	"supplier_id" bigint,
	"enabled" boolean DEFAULT true NOT NULL,
	"bound_at" timestamp (3) with time zone,
	CONSTRAINT "accounts_phone_format" CHECK ("accounts"."phone" ~ '^1[0-9]{10}$'),
	CONSTRAINT "accounts_store_link" CHECK (("accounts"."type" = 'store') = ("accounts"."store_id" IS NOT NULL)),
	CONSTRAINT "accounts_supplier_link" CHECK (("accounts"."type" = 'supplier') = ("accounts"."supplier_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "doc_sequences" (
	"prefix" text NOT NULL,
	"day" date NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "doc_sequences_prefix_day_pk" PRIMARY KEY("prefix","day")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"account_id" bigint NOT NULL,
	"key" text NOT NULL,
	"endpoint" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_account_id_key_pk" PRIMARY KEY("account_id","key")
);
--> statement-breakpoint
CREATE TABLE "operation_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "operation_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"module" "module_key" NOT NULL,
	"kind" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" bigint,
	"target_label" text NOT NULL,
	"actor_label" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_modules" ADD CONSTRAINT "account_modules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_logs" ADD CONSTRAINT "operation_logs_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_enabled_phone" ON "accounts" USING btree ("phone") WHERE "accounts"."enabled";--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_openid" ON "accounts" USING btree ("openid") WHERE "accounts"."openid" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_one_per_store" ON "accounts" USING btree ("store_id") WHERE "accounts"."type" = 'store' AND "accounts"."enabled";--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_one_per_supplier" ON "accounts" USING btree ("supplier_id") WHERE "accounts"."type" = 'supplier' AND "accounts"."enabled";--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_at" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "operation_logs_module_time" ON "operation_logs" USING btree ("module","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "operation_logs_target" ON "operation_logs" USING btree ("target_type","target_id");