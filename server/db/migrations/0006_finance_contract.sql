DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payments) AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'upgrade_audit') THEN
    RAISE EXCEPTION 'Old payments require the independent audited finance upgrade before contraction';
  END IF;
  IF EXISTS (SELECT 1 FROM allocations WHERE revoked_at IS NOT NULL AND (revoked_by IS NULL OR nullif(revoke_reason, '') IS NULL)) THEN
    RAISE EXCEPTION 'Revoked receipt allocations require complete historical metadata';
  END IF;
  IF EXISTS (SELECT 1 FROM payments) THEN
    IF EXISTS (SELECT 1 FROM upgrade_audit.payment_map m FULL JOIN payments p ON p.id=m.payment_id
      LEFT JOIN payment_allocations a ON a.id=m.allocation_id
      WHERE p.id IS NULL OR m.payment_id IS NULL OR a.id IS NULL OR to_jsonb(p) IS DISTINCT FROM m.source) THEN
      RAISE EXCEPTION 'Controlled payment source audit changed or is incomplete';
    END IF;
    IF (SELECT count(*) FROM payment_allocations) <> (SELECT count(*) FROM payments) OR EXISTS (SELECT 1 FROM refunds) THEN
      RAISE EXCEPTION 'Unexpected new finance writes before verified contraction';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM payments p WHERE NOT EXISTS (
    SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id AND a.po_id = p.po_id
      AND a.amount_cents = p.amount_cents AND a.kind = 'direct'
      AND a.created_at = p.created_at AND a.updated_at = p.updated_at AND a.created_by = p.created_by
      AND ((p.status = 'valid' AND a.revoked_at IS NULL) OR
        (p.status = 'voided' AND a.revoked_at = p.voided_at AND a.revoked_by = p.voided_by AND a.revoke_reason = p.void_reason))
  )) THEN
    RAISE EXCEPTION 'Old payment backfill reconciliation failed';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE payments DROP CONSTRAINT payments_po_id_purchase_orders_id_fk;
--> statement-breakpoint
DROP INDEX payments_po_live;
--> statement-breakpoint
ALTER TABLE payments DROP COLUMN po_id;
