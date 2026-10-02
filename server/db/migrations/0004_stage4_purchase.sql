CREATE TYPE "public"."invite_status" AS ENUM('pending', 'submitted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."move_type" AS ENUM('po_in', 'po_return', 'manual_in', 'in_void', 'manual_out', 'loss', 'check_gain', 'check_loss');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('to_receive', 'received', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_moves_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"moved_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"type" "move_type" NOT NULL,
	"material_id" bigint NOT NULL,
	"batch_id" bigint NOT NULL,
	"qty" integer NOT NULL,
	"doc_type" text NOT NULL,
	"doc_id" bigint NOT NULL,
	"doc_no" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "stock_moves_qty_direction" CHECK (("stock_moves"."type" IN ('po_in', 'manual_in', 'check_gain')) = ("stock_moves"."qty" > 0) AND "stock_moves"."qty" <> 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no" text NOT NULL,
	"po_id" bigint NOT NULL,
	"supplier_id" bigint NOT NULL,
	"pay_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"method_name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "record_status" DEFAULT 'valid' NOT NULL,
	"void_reason" text,
	"voided_by" bigint,
	"voided_at" timestamp (3) with time zone,
	CONSTRAINT "payments_no_unique" UNIQUE("no"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payments_void_reason" CHECK ("payments"."status" <> 'voided' OR "payments"."void_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "invite_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invite_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"invite_id" bigint NOT NULL,
	"material_id" bigint NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"need_qty" integer NOT NULL,
	"sort" integer NOT NULL,
	CONSTRAINT "invite_lines_inviteId_materialId_unique" UNIQUE("invite_id","material_id"),
	CONSTRAINT "invite_lines_need_positive" CHECK ("invite_lines"."need_qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "invite_supply_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invite_supply_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"invite_id" bigint NOT NULL,
	"material_id" bigint NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"qty" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"sort" integer NOT NULL,
	CONSTRAINT "invite_supply_lines_inviteId_materialId_unique" UNIQUE("invite_id","material_id"),
	CONSTRAINT "invite_supply_lines_qty_positive" CHECK ("invite_supply_lines"."qty" > 0),
	CONSTRAINT "invite_supply_lines_price_nonnegative" CHECK ("invite_supply_lines"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no" text NOT NULL,
	"invite_date" date NOT NULL,
	"supplier_id" bigint NOT NULL,
	"buyer_id" bigint NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp (3) with time zone,
	"cancelled_by" bigint,
	"cancelled_at" timestamp (3) with time zone,
	"cancel_note" text,
	CONSTRAINT "invites_no_unique" UNIQUE("no"),
	CONSTRAINT "invites_submitted_at" CHECK ("invites"."status" <> 'submitted' OR "invites"."submitted_at" IS NOT NULL),
	CONSTRAINT "invites_cancelled_at" CHECK ("invites"."status" <> 'cancelled' OR "invites"."cancelled_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "po_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "po_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"po_id" bigint NOT NULL,
	"actor_label" text NOT NULL,
	"reason" text NOT NULL,
	"items" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"po_id" bigint NOT NULL,
	"actor_label" text NOT NULL,
	"reason" text NOT NULL,
	"items" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_order_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"po_id" bigint NOT NULL,
	"material_id" bigint NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"qty" integer NOT NULL,
	"order_price_cents" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"received_qty" integer,
	"returned_qty" integer DEFAULT 0 NOT NULL,
	"sort" integer NOT NULL,
	CONSTRAINT "purchase_order_lines_poId_materialId_unique" UNIQUE("po_id","material_id"),
	CONSTRAINT "purchase_order_lines_qty_positive" CHECK ("purchase_order_lines"."qty" > 0),
	CONSTRAINT "purchase_order_lines_price_nonnegative" CHECK ("purchase_order_lines"."order_price_cents" >= 0 AND "purchase_order_lines"."price_cents" >= 0),
	CONSTRAINT "purchase_order_lines_received_nonnegative" CHECK ("purchase_order_lines"."received_qty" IS NULL OR "purchase_order_lines"."received_qty" >= 0),
	CONSTRAINT "purchase_order_lines_returned_range" CHECK ("purchase_order_lines"."returned_qty" >= 0 AND "purchase_order_lines"."returned_qty" <= coalesce("purchase_order_lines"."received_qty", 0))
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no" text NOT NULL,
	"order_date" date NOT NULL,
	"supplier_id" bigint NOT NULL,
	"buyer_id" bigint NOT NULL,
	"invite_id" bigint,
	"status" "po_status" DEFAULT 'to_receive' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"received_by" bigint,
	"received_at" timestamp (3) with time zone,
	"recv_note" text DEFAULT '' NOT NULL,
	"cancel_reason" text,
	"cancelled_by" bigint,
	"cancelled_at" timestamp (3) with time zone,
	CONSTRAINT "purchase_orders_no_unique" UNIQUE("no"),
	CONSTRAINT "purchase_orders_invite_unique" UNIQUE("invite_id"),
	CONSTRAINT "purchase_orders_received_at" CHECK ("purchase_orders"."status" NOT IN ('received', 'rejected') OR "purchase_orders"."received_at" IS NOT NULL),
	CONSTRAINT "purchase_orders_cancel_reason" CHECK ("purchase_orders"."status" <> 'cancelled' OR "purchase_orders"."cancel_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "purchase_return_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_return_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"return_id" bigint NOT NULL,
	"po_line_id" bigint NOT NULL,
	"name" text NOT NULL,
	"qty" integer NOT NULL,
	CONSTRAINT "purchase_return_lines_qty_positive" CHECK ("purchase_return_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_returns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_returns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"po_id" bigint NOT NULL,
	"actor_label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "contact" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD COLUMN "source_type" text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD COLUMN "source_id" bigint;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_accounts_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_lines" ADD CONSTRAINT "invite_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_lines" ADD CONSTRAINT "invite_lines_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_lines" ADD CONSTRAINT "invite_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_supply_lines" ADD CONSTRAINT "invite_supply_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_supply_lines" ADD CONSTRAINT "invite_supply_lines_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_supply_lines" ADD CONSTRAINT "invite_supply_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_buyer_id_accounts_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_cancelled_by_accounts_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_changes" ADD CONSTRAINT "po_changes_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_changes" ADD CONSTRAINT "po_changes_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_buyer_id_accounts_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_received_by_accounts_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancelled_by_accounts_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_return_id_purchase_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."purchase_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_moves_material_time" ON "stock_moves" USING btree ("material_id","moved_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_moves_doc" ON "stock_moves" USING btree ("doc_type","doc_id");--> statement-breakpoint
CREATE INDEX "stock_moves_type_time" ON "stock_moves" USING btree ("type","moved_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "payments_po_live" ON "payments" USING btree ("po_id") WHERE "payments"."status" = 'valid';--> statement-breakpoint
CREATE INDEX "payments_supplier_status" ON "payments" USING btree ("supplier_id","status");--> statement-breakpoint
CREATE INDEX "payments_date" ON "payments" USING btree ("pay_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invites_status_supplier" ON "invites" USING btree ("status","supplier_id");--> statement-breakpoint
CREATE INDEX "po_changes_order_time" ON "po_changes" USING btree ("po_id","created_at");--> statement-breakpoint
CREATE INDEX "price_changes_po_time" ON "price_changes" USING btree ("po_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_date" ON "purchase_orders" USING btree ("status","order_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_status" ON "purchase_orders" USING btree ("supplier_id","status");--> statement-breakpoint
CREATE INDEX "purchase_returns_po_time" ON "purchase_returns" USING btree ("po_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_batches_source" ON "stock_batches" USING btree ("source_type","source_id");--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_source_link" CHECK (("stock_batches"."source_type" = 'seed' AND "stock_batches"."source_id" IS NULL) OR ("stock_batches"."source_type" = 'po' AND "stock_batches"."source_id" IS NOT NULL));