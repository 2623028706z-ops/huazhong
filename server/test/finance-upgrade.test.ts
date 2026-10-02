import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { createDb } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import { assertLocalUpgradeUrl, upgradeFinance, type UpgradeReport } from '../db/upgrade-finance.ts'
import { oldDatabase, snapshotOldDatabase, restoreOldDatabase } from './support/finance-upgrade.ts'

describe('K01–K08: current-project old finance upgrade (local only)', () => {
  it('preserves original identities, chronology, void history and per-document/supplier balances; safely contracts and reruns', async () => {
    const { url, pool, report } = await oldDatabase()
    try {
      const before = (
        await pool.query<Record<string, unknown>>('SELECT * FROM payments ORDER BY id')
      ).rows
      const receiptBefore = (
        await pool.query<Record<string, unknown>>('SELECT * FROM allocations ORDER BY id')
      ).rows
      const keys = (await pool.query<Record<string, unknown>>('SELECT * FROM idempotency_keys'))
        .rows
      const dryRun = await upgradeFinance({ url })
      expect(dryRun.anomalies).toEqual([])
      expect(dryRun.payments).toBe(5)
      const first = await upgradeFinance({ url, apply: true, reportPath: report })
      expect(first.phase).toBe('verified')
      expect(first.rows).toHaveLength(5)
      const second = await upgradeFinance({ url, apply: true, reportPath: report })
      expect(second.rows).toEqual(first.rows)
      expect(
        (
          await pool.query<Record<string, unknown>>(
            'SELECT count(*) AS count FROM payment_allocations',
          )
        ).rows[0]?.count,
      ).toBe('5')
      expect(
        (await pool.query<Record<string, unknown>>('SELECT * FROM payments ORDER BY id')).rows,
      ).toEqual(before)
      expect(
        (
          await pool.query<Record<string, unknown>>('SELECT * FROM allocations ORDER BY id')
        ).rows.map(({ kind, revoked_by: _revokedBy, revoke_reason: _revokeReason, ...row }) => ({
          ...row,
          kind: kind === 'direct' ? 'receipt' : kind,
        })),
      ).toEqual(receiptBefore)
      const voids = (
        await pool.query<Record<string, unknown>>(
          "SELECT p.id,a.revoked_at,a.revoked_by,a.revoke_reason FROM payments p JOIN payment_allocations a ON a.payment_id=p.id WHERE p.status='voided'",
        )
      ).rows
      expect(voids).toHaveLength(3)
      expect(
        voids.every(
          (row) => row.revoked_at && row.revoked_by && row.revoke_reason === '旧付款误录',
        ),
      ).toBe(true)
      const contracted = await upgradeFinance({
        url,
        apply: true,
        contract: true,
        reportPath: report,
      })
      expect(contracted.phase).toBe('contracted')
      expect(
        (await pool.query<Record<string, unknown>>('SELECT * FROM payments ORDER BY id')).rows,
      ).toEqual(before.map(({ po_id: _poId, ...row }) => row))
      expect(
        (await pool.query<Record<string, unknown>>('SELECT * FROM idempotency_keys')).rows,
      ).toEqual(keys)
      expect(
        (await pool.query<Record<string, unknown>>('SELECT count(*) AS count FROM refunds')).rows[0]
          ?.count,
      ).toBe('0')
      expect((await upgradeFinance({ url, apply: true })).phase).toBe('already-contracted')
      const artifact = JSON.parse(await readFile(report, 'utf8')) as UpgradeReport
      expect(artifact.documents).toHaveLength(3)
      expect(artifact.suppliers).toHaveLength(2)
      await pool.query<Record<string, unknown>>(
        `INSERT INTO payment_allocations (payment_id,po_id,amount_cents,kind,created_by) SELECT payment_id,po_id,1,'prepaid',created_by FROM payment_allocations LIMIT 1`,
      )
    } finally {
      await pool.end()
    }
  })
  it('blocks anomalous data and refuses unverified ordinary migration contraction', async () => {
    const { url, pool } = await oldDatabase()
    try {
      await pool.query<Record<string, unknown>>(
        "UPDATE payments SET amount_cents=amount_cents+1 WHERE status='valid'",
      )
      const report = await upgradeFinance({ url, apply: true })
      expect(
        report.anomalies.filter((item) => item.includes('invalid_effective_payment')),
      ).toHaveLength(2)
      expect(
        (
          await pool.query<Record<string, unknown>>(
            "SELECT to_regclass('public.payment_allocations') AS name",
          )
        ).rows[0]?.name,
      ).toBeNull()
      await expect(runMigrations(createDb(pool))).rejects.toThrow()
      expect(
        (
          await pool.query<Record<string, unknown>>(
            "SELECT to_regclass('public.payment_allocations') AS name",
          )
        ).rows[0]?.name,
      ).toBeNull()
      expect(
        (
          await pool.query<Record<string, unknown>>(
            "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=enumtypid WHERE typname='alloc_kind' ORDER BY enumsortorder",
          )
        ).rows.map((row) => row.enumlabel),
      ).toEqual(['receipt', 'prepaid'])
    } finally {
      await pool.end()
    }
  })
  it.each(['expand', 'backfill', 'verify'] as const)(
    'rolls back injected %s failure, retains committed expansion, and resumes without duplicate allocations',
    async (failAt) => {
      const { url, pool, report } = await oldDatabase()
      try {
        await expect(upgradeFinance({ url, apply: true, failAt })).rejects.toThrow('Injected')
        expect(
          (
            await pool.query<Record<string, unknown>>(
              'SELECT count(*) AS count FROM payment_allocations',
            )
          ).rows[0]?.count,
        ).toBe('0')
        expect(
          (
            await pool.query<Record<string, unknown>>(
              "SELECT to_regclass('upgrade_audit.payment_map') AS name",
            )
          ).rows[0]?.name,
        ).toBeNull()
        expect(
          (await upgradeFinance({ url, apply: true, contract: true, reportPath: report })).phase,
        ).toBe('contracted')
      } finally {
        await pool.end()
      }
    },
  )
  it('blocks changed already-mapped sources even when the effective balance is unchanged', async () => {
    const { url, pool } = await oldDatabase()
    try {
      await upgradeFinance({ url, apply: true })
      await pool.query<Record<string, unknown>>(
        "UPDATE payments SET note='源数据变化' WHERE status='voided'",
      )
      expect((await upgradeFinance({ url, apply: true })).anomalies).toContainEqual(
        expect.stringContaining('changed_mapped_source'),
      )
      expect(
        (
          await pool.query<Record<string, unknown>>(
            'SELECT count(*) AS count FROM payment_allocations',
          )
        ).rows[0]?.count,
      ).toBe('5')
    } finally {
      await pool.end()
    }
  })
  it.each([
    [
      'missing_document',
      'ALTER TABLE payments DROP CONSTRAINT payments_po_id_purchase_orders_id_fk; UPDATE payments SET po_id=999999999 WHERE id=(SELECT id FROM payments LIMIT 1)',
    ],
    [
      'supplier_mismatch',
      "UPDATE payments SET supplier_id=(SELECT id FROM suppliers WHERE id<>payments.supplier_id LIMIT 1) WHERE id=(SELECT id FROM payments WHERE status='valid' LIMIT 1)",
    ],
    [
      'invalid_amount',
      "ALTER TABLE payments DROP CONSTRAINT payments_amount_positive; UPDATE payments SET amount_cents=0 WHERE id=(SELECT id FROM payments WHERE status='valid' LIMIT 1)",
    ],
    [
      'missing_registration_metadata',
      'ALTER TABLE payments ALTER COLUMN created_by DROP NOT NULL; UPDATE payments SET created_by=NULL WHERE id=(SELECT id FROM payments LIMIT 1)',
    ],
    ['missing_void_metadata', "UPDATE payments SET voided_at=NULL WHERE status='voided'"],
    [
      'duplicate_live_payments',
      "DROP INDEX payments_po_live; INSERT INTO payments (no,po_id,supplier_id,pay_date,amount_cents,method_name,status,created_by,created_at,updated_at) SELECT no||'-DUP',po_id,supplier_id,pay_date,amount_cents,method_name,status,created_by,created_at,updated_at FROM payments WHERE status='valid' LIMIT 1",
    ],
    [
      'invalid_effective_payment',
      "UPDATE purchase_orders SET status='to_receive' WHERE id=(SELECT po_id FROM payments WHERE status='valid' LIMIT 1)",
    ],
  ])(
    'K03: lists and blocks %s without automatic corrections or contraction',
    async (anomaly, corruption) => {
      const { url, pool, report } = await oldDatabase()
      try {
        await pool.query<Record<string, unknown>>(corruption)
        const before = (
          await pool.query<Record<string, unknown>>('SELECT * FROM payments ORDER BY id')
        ).rows
        const result = await upgradeFinance({
          url,
          apply: true,
          contract: true,
          reportPath: report,
        })
        expect(result.anomalies).toContainEqual(expect.stringContaining(anomaly))
        expect(
          (
            await pool.query<Record<string, unknown>>(
              "SELECT to_regclass('public.payment_allocations') AS name",
            )
          ).rows[0]?.name,
        ).toBeNull()
        expect(
          (await pool.query<Record<string, unknown>>('SELECT * FROM payments ORDER BY id')).rows,
        ).toEqual(before)
        expect((JSON.parse(await readFile(report, 'utf8')) as UpgradeReport).anomalies).toEqual(
          result.anomalies,
        )
      } finally {
        await pool.end()
      }
    },
  )
  it('K02/K06: preserves receipt allocations and prepaid enum while filling historical whole-receipt revocation metadata', async () => {
    const { url, pool, report } = await oldDatabase()
    try {
      await pool.query<Record<string, unknown>>(
        "UPDATE receipts SET status='voided',void_reason='旧收款误录',voided_by=created_by,voided_at='2026-09-30T04:00:00Z' WHERE id=(SELECT receipt_id FROM allocations LIMIT 1)",
      )
      await pool.query<Record<string, unknown>>(
        "UPDATE allocations SET revoked_at='2026-09-30T04:00:00Z' WHERE receipt_id=(SELECT id FROM receipts WHERE status='voided' LIMIT 1)",
      )
      await pool.query<Record<string, unknown>>(
        "UPDATE allocations SET kind='prepaid' WHERE id=(SELECT id FROM allocations ORDER BY id DESC LIMIT 1)",
      )
      const before = (
        await pool.query<Record<string, unknown>>('SELECT * FROM allocations ORDER BY id')
      ).rows
      expect(
        (await upgradeFinance({ url, apply: true, contract: true, reportPath: report })).phase,
      ).toBe('contracted')
      const after = (
        await pool.query<Record<string, unknown>>('SELECT * FROM allocations ORDER BY id')
      ).rows
      expect(
        after.map(({ revoked_by: _revokedBy, revoke_reason: _revokeReason, kind, ...row }) => ({
          ...row,
          kind: kind === 'direct' ? 'receipt' : kind,
        })),
      ).toEqual(before)
      expect(
        after
          .filter((row) => row.revoked_at)
          .every((row) => row.revoked_by && row.revoke_reason === '旧收款误录'),
      ).toBe(true)
    } finally {
      await pool.end()
    }
  })
  it('K04: ordinary contraction refuses a changed audited source even if allocations still match its money', async () => {
    const { url, pool } = await oldDatabase()
    try {
      await upgradeFinance({ url, apply: true })
      await pool.query<Record<string, unknown>>(
        "UPDATE payments SET note='收缩前被改' WHERE status='voided'",
      )
      await expect(runMigrations(createDb(pool))).rejects.toThrow()
      expect(
        (
          await pool.query<Record<string, unknown>>(
            "SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='po_id'",
          )
        ).rowCount,
      ).toBe(1)
    } finally {
      await pool.end()
    }
  })
  it('K04: reused mappings verify the exact allocation identity and metadata rather than creating a substitute', async () => {
    const { url, pool } = await oldDatabase()
    try {
      await upgradeFinance({ url, apply: true })
      await pool.query<Record<string, unknown>>(
        'UPDATE payment_allocations SET amount_cents=amount_cents+1 WHERE id=(SELECT id FROM payment_allocations LIMIT 1)',
      )
      await expect(upgradeFinance({ url, apply: true })).rejects.toThrow(
        'Row-level reconciliation failed',
      )
      expect(
        (
          await pool.query<Record<string, unknown>>(
            'SELECT count(*) AS count FROM payment_allocations',
          )
        ).rows[0]?.count,
      ).toBe('5')
    } finally {
      await pool.end()
    }
  })
  it('never accepts remote or application database URLs', () => {
    expect(() => {
      assertLocalUpgradeUrl('postgres://user@production.example/hz_test')
    }).toThrow()
    expect(() => {
      assertLocalUpgradeUrl('postgres://user@localhost/huazhong')
    }).toThrow()
    expect(() => {
      assertLocalUpgradeUrl('postgres://user@localhost/hz_test?host=production.example')
    }).toThrow()
    expect(() => {
      assertLocalUpgradeUrl('postgres://user@127.0.0.1/hz_test')
    }).not.toThrow()
  })
  it('K05: restores an actual local PostgreSQL snapshot before enabling new finance writes', async () => {
    const { url, pool } = await oldDatabase()
    const before = (await pool.query<Record<string, unknown>>('SELECT * FROM payments ORDER BY id'))
      .rows
    const allocations = (
      await pool.query<Record<string, unknown>>('SELECT * FROM allocations ORDER BY id')
    ).rows
    await pool.end()
    const snapshot = await snapshotOldDatabase(url)
    await expect(upgradeFinance({ url, apply: true, failAt: 'backfill' })).rejects.toThrow(
      'Injected',
    )
    await restoreOldDatabase(url, snapshot)
    const restored = new pg.Pool({ connectionString: url })
    try {
      expect(
        (await restored.query<Record<string, unknown>>('SELECT * FROM payments ORDER BY id')).rows,
      ).toEqual(before)
      expect(
        (await restored.query<Record<string, unknown>>('SELECT * FROM allocations ORDER BY id'))
          .rows,
      ).toEqual(allocations)
      expect(
        (
          await restored.query<{ name: string | null }>(
            "SELECT to_regclass('public.payment_allocations') AS name",
          )
        ).rows[0]?.name,
      ).toBeNull()
      expect((await upgradeFinance({ url, apply: true })).phase).toBe('verified')
    } finally {
      await restored.end()
    }
  })
})
