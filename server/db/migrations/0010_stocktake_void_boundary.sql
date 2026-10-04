ALTER TABLE "stocktake_lines" ADD COLUMN "last_move_id" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "stocktake_lines" c SET "last_move_id" =
  (SELECT coalesce(max(m.id), 0) FROM "stock_moves" m WHERE m.material_id = c.material_id);--> statement-breakpoint
CREATE INDEX "stocktake_lines_material_move" ON "stocktake_lines" USING btree ("material_id","last_move_id");--> statement-breakpoint
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_last_move" CHECK ("stocktake_lines"."last_move_id" >= 0);
