import { createHash } from 'node:crypto'
import type pg from 'pg'

export interface LegacyPayment {
  id: string
  po_id: string
  supplier_id: string
  amount_cents: number
  status: string
  created_at: Date
  updated_at: Date
  created_by: string
  voided_at: Date | null
  voided_by: string | null
  void_reason: string | null
  [key: string]: unknown
}
interface PaymentMapping {
  paymentId: string
  allocationId: string
  fingerprint: string
  source: LegacyPayment
}
export interface DocumentBalance {
  po_id: string
  supplier_id: string
  payable: string
  paid: string
  unpaid: string
}
export type SupplierBalance = Omit<DocumentBalance, 'po_id'>
export interface UpgradeReport {
  phase: string
  payments: number
  anomalies: string[]
  rows: PaymentMapping[]
  documents: DocumentBalance[]
  suppliers: SupplierBalance[]
}
export interface UpgradeOptions {
  url: string
  apply?: boolean
  contract?: boolean
  reportPath?: string
  failAt?: 'expand' | 'backfill' | 'verify'
}
interface IdRow {
  id: string
}
interface NameRow {
  name: string | null
}
type Connection = pg.Pool | pg.PoolClient
function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function auditExists(connection: Connection): Promise<boolean> {
  return Boolean(
    (await connection.query<NameRow>("SELECT to_regclass('upgrade_audit.payment_map') AS name"))
      .rows[0]?.name,
  )
}
export async function alreadyContracted(pool: pg.Pool, report: UpgradeReport): Promise<boolean> {
  const columns = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='po_id' AND table_schema='public'",
  )
  if (columns.rowCount) return false
  if (!(await auditExists(pool)))
    throw new Error('Already contracted database lacks the controlled migration audit')
  report.rows = (
    await pool.query<PaymentMapping>(
      'SELECT payment_id AS "paymentId", allocation_id AS "allocationId", fingerprint, source FROM upgrade_audit.payment_map ORDER BY payment_id',
    )
  ).rows
  report.payments = report.rows.length
  report.phase = 'already-contracted'
  return true
}
export async function balances(
  connection: Connection,
  migrated: boolean,
): Promise<{ documents: DocumentBalance[]; suppliers: SupplierBalance[] }> {
  const source = migrated
    ? "SELECT a.po_id,p.supplier_id,CASE WHEN p.status='valid' AND a.revoked_at IS NULL THEN a.amount_cents ELSE 0 END AS paid FROM payment_allocations a JOIN payments p ON p.id=a.payment_id"
    : "SELECT po_id,supplier_id,CASE WHEN status='valid' THEN amount_cents ELSE 0 END AS paid FROM payments"
  const documents = (
    await connection.query<DocumentBalance>(`WITH sources AS (${source}), paid AS (SELECT po_id,sum(paid) AS paid FROM sources GROUP BY po_id)
    SELECT po.id AS po_id,po.supplier_id,
      (CASE WHEN po.status='received' THEN coalesce(amount.payable,0) ELSE 0 END)::bigint AS payable,
      coalesce(p.paid,0)::bigint AS paid,
      greatest(0,(CASE WHEN po.status='received' THEN coalesce(amount.payable,0) ELSE 0 END)-coalesce(p.paid,0))::bigint AS unpaid
    FROM purchase_orders po LEFT JOIN paid p ON p.po_id=po.id
    LEFT JOIN LATERAL (SELECT sum((coalesce(received_qty,0)-returned_qty)*price_cents) AS payable FROM purchase_order_lines WHERE po_id=po.id) amount ON true
    WHERE po.status='received' OR EXISTS (SELECT 1 FROM sources WHERE po_id=po.id) ORDER BY po.id`)
  ).rows
  const grouped = new Map<
    string,
    { supplier_id: string; payable: bigint; paid: bigint; unpaid: bigint }
  >()
  for (const row of documents) {
    const previous = grouped.get(row.supplier_id) ?? {
      supplier_id: row.supplier_id,
      payable: 0n,
      paid: 0n,
      unpaid: 0n,
    }
    previous.payable += BigInt(row.payable)
    previous.paid += BigInt(row.paid)
    previous.unpaid += BigInt(row.unpaid)
    grouped.set(row.supplier_id, previous)
  }
  const suppliers = [...grouped.values()]
    .sort((first, second) => Number(first.supplier_id) - Number(second.supplier_id))
    .map((row) => ({
      supplier_id: row.supplier_id,
      payable: row.payable.toString(),
      paid: row.paid.toString(),
      unpaid: row.unpaid.toString(),
    }))
  return { documents, suppliers }
}
export async function sourceAnomalies(connection: Connection): Promise<string[]> {
  const invalid = await connection.query<{ id: string; anomaly: string | null }>(`SELECT p.id, CASE
    WHEN po.id IS NULL THEN 'missing_document' WHEN p.supplier_id <> po.supplier_id THEN 'supplier_mismatch'
    WHEN p.amount_cents <= 0 THEN 'invalid_amount'
    WHEN p.created_by IS NULL OR p.created_at IS NULL OR p.updated_at IS NULL THEN 'missing_registration_metadata'
    WHEN p.status='voided' AND (p.voided_at IS NULL OR p.voided_by IS NULL OR nullif(btrim(p.void_reason),'') IS NULL) THEN 'missing_void_metadata'
    WHEN p.status='valid' AND (po.status <> 'received' OR p.amount_cents <> coalesce(amount.payable,0)) THEN 'invalid_effective_payment' END AS anomaly
    FROM payments p LEFT JOIN purchase_orders po ON po.id=p.po_id LEFT JOIN LATERAL (SELECT sum((coalesce(l.received_qty,0)-l.returned_qty)*l.price_cents) AS payable FROM purchase_order_lines l WHERE l.po_id=p.po_id) amount ON true`)
  const duplicates = await connection.query<{ po_id: string }>(
    "SELECT po_id FROM payments WHERE status='valid' GROUP BY po_id HAVING count(*) > 1",
  )
  const receiptInvalid = await connection.query<IdRow>(
    `SELECT a.id FROM allocations a JOIN receipts r ON r.id=a.receipt_id WHERE a.revoked_at IS NOT NULL AND (r.status <> 'voided' OR r.voided_at IS NULL OR r.voided_by IS NULL OR nullif(btrim(r.void_reason),'') IS NULL)`,
  )
  return [
    ...invalid.rows.flatMap((row) => (row.anomaly ? [`payment:${row.id}:${row.anomaly}`] : [])),
    ...duplicates.rows.map((row) => `document:${row.po_id}:duplicate_live_payments`),
    ...receiptInvalid.rows.map((row) => `receipt-allocation:${row.id}:missing_revocation_source`),
  ]
}
export async function mappedAnomalies(
  connection: Connection,
  sources: LegacyPayment[],
): Promise<string[]> {
  if (!(await auditExists(connection))) return []
  const mapped = (
    await connection.query<{ payment_id: string; fingerprint: string }>(
      'SELECT payment_id,fingerprint FROM upgrade_audit.payment_map',
    )
  ).rows
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  return mapped.flatMap((mapping) => {
    const source = sourceById.get(mapping.payment_id)
    return !source || fingerprint(source) !== mapping.fingerprint
      ? [`payment:${mapping.payment_id}:changed_mapped_source`]
      : []
  })
}
async function mappingOf(client: pg.PoolClient, source: LegacyPayment): Promise<PaymentMapping> {
  const hash = fingerprint(source)
  const existing = await client.query<{ allocation_id: string; fingerprint: string }>(
    'SELECT allocation_id,fingerprint FROM upgrade_audit.payment_map WHERE payment_id=$1',
    [source.id],
  )
  const mapped = existing.rows[0]
  if (mapped) {
    if (mapped.fingerprint !== hash) throw new Error(`Changed legacy source payment:${source.id}`)
    return { paymentId: source.id, allocationId: mapped.allocation_id, fingerprint: hash, source }
  }
  const isVoided = source.status === 'voided'
  const inserted = await client.query<IdRow>(
    `INSERT INTO payment_allocations (payment_id,po_id,amount_cents,kind,created_at,updated_at,created_by,revoked_at,revoked_by,revoke_reason) VALUES ($1,$2,$3,'direct',$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      source.id,
      source.po_id,
      source.amount_cents,
      source.created_at,
      source.updated_at,
      source.created_by,
      isVoided ? source.voided_at : null,
      isVoided ? source.voided_by : null,
      isVoided ? source.void_reason : null,
    ],
  )
  const allocationId = inserted.rows[0]?.id
  if (!allocationId) throw new Error('Missing backfilled allocation identity')
  await client.query(
    'INSERT INTO upgrade_audit.payment_map VALUES ($1,$2,$3,(SELECT to_jsonb(p) FROM payments p WHERE id=$1))',
    [source.id, allocationId, hash],
  )
  return { paymentId: source.id, allocationId, fingerprint: hash, source }
}
export async function backfillSources(
  client: pg.PoolClient,
  sources: LegacyPayment[],
  report: UpgradeReport,
): Promise<void> {
  await client.query('CREATE SCHEMA IF NOT EXISTS upgrade_audit')
  await client.query(
    'CREATE TABLE IF NOT EXISTS upgrade_audit.payment_map (payment_id bigint PRIMARY KEY, allocation_id bigint NOT NULL UNIQUE, fingerprint text NOT NULL, source jsonb NOT NULL)',
  )
  for (const source of sources) report.rows.push(await mappingOf(client, source))
  await client.query(
    `UPDATE allocations a SET revoked_by=r.voided_by,revoke_reason=r.void_reason FROM receipts r WHERE a.receipt_id=r.id AND a.revoked_at IS NOT NULL AND a.revoked_by IS NULL`,
  )
}
export async function verifySources(
  client: pg.PoolClient,
  sources: LegacyPayment[],
  report: UpgradeReport,
): Promise<void> {
  const current = (
    await client.query<LegacyPayment>('SELECT * FROM payments ORDER BY created_at,id')
  ).rows
  if (fingerprint(current) !== fingerprint(sources))
    throw new Error('Legacy payments changed during upgrade')
  const mismatch = await client.query(
    `SELECT m.payment_id FROM upgrade_audit.payment_map m LEFT JOIN payment_allocations a ON a.id=m.allocation_id LEFT JOIN payments p ON p.id=m.payment_id WHERE p.id IS NULL OR a.id IS NULL OR a.payment_id<>p.id OR a.po_id IS DISTINCT FROM p.po_id OR a.wh_doc_id IS NOT NULL OR a.kind<>'direct' OR a.amount_cents<>p.amount_cents OR a.created_at<>p.created_at OR a.updated_at<>p.updated_at OR a.created_by<>p.created_by OR (a.revoked_at IS NULL)<>(p.status='valid') OR (p.status='valid' AND (a.revoked_by IS NOT NULL OR a.revoke_reason IS NOT NULL)) OR (p.status='voided' AND (a.revoked_at IS DISTINCT FROM p.voided_at OR a.revoked_by IS DISTINCT FROM p.voided_by OR a.revoke_reason IS DISTINCT FROM p.void_reason))`,
  )
  if (mismatch.rowCount) throw new Error('Row-level reconciliation failed')
  const counts = (
    await client.query<{ allocations: string; refunds: string }>(
      'SELECT (SELECT count(*) FROM payment_allocations) AS allocations,(SELECT count(*) FROM refunds) AS refunds',
    )
  ).rows[0]
  if (!counts || Number(counts.allocations) !== sources.length || Number(counts.refunds) !== 0)
    throw new Error('Unexpected new finance writes before contraction')
  const currentBalances = await balances(client, true)
  if (
    fingerprint(report.documents) !== fingerprint(currentBalances.documents) ||
    fingerprint(report.suppliers) !== fingerprint(currentBalances.suppliers)
  )
    throw new Error('Document/supplier reconciliation failed')
}
export async function lockLegacySources(
  client: pg.PoolClient,
  report: UpgradeReport,
): Promise<void> {
  await client.query(
    'LOCK TABLE suppliers, purchase_orders, purchase_order_lines, payments, allocations, receipts, payment_allocations IN ACCESS EXCLUSIVE MODE',
  )
  if ((await sourceAnomalies(client)).length) throw new Error('Legacy target changed after dry-run')
  const lockedBalances = await balances(client, false)
  if (
    fingerprint(lockedBalances.documents) !== fingerprint(report.documents) ||
    fingerprint(lockedBalances.suppliers) !== fingerprint(report.suppliers)
  )
    throw new Error('Legacy balances changed after dry-run')
}
