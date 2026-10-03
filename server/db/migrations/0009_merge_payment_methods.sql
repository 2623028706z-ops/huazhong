-- 2026-10-03 确认：收款方式、付款方式合并成一份收付款方式。
-- 先把同名的多行合并成一行（留 id 最小的，任一启用则启用，顺序取最小），再删 kind 列、加名称唯一约束。
UPDATE "payment_methods" AS m
SET "enabled" = g."enabled", "sort" = g."sort", "updated_at" = now()
FROM (
	SELECT min("id") AS "keep_id", bool_or("enabled") AS "enabled", min("sort") AS "sort"
	FROM "payment_methods"
	GROUP BY "name"
	HAVING count(*) > 1
) AS g
WHERE m."id" = g."keep_id";--> statement-breakpoint
DELETE FROM "payment_methods" AS m
USING "payment_methods" AS keep
WHERE keep."name" = m."name" AND keep."id" < m."id";--> statement-breakpoint
ALTER TABLE "payment_methods" DROP CONSTRAINT "payment_methods_kind_name_unique";--> statement-breakpoint
ALTER TABLE "payment_methods" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_name_unique" UNIQUE("name");--> statement-breakpoint
DROP TYPE "public"."method_kind";
