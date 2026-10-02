import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { upgradeFinance, type UpgradeReport } from '../db/upgrade-finance.ts'
import { oldDatabase } from './support/finance-upgrade.ts'

describe('K01/K06/K08: standalone local finance upgrade and full reconciliation', () => {
  it('rejects contraction without a report before changing even the expansion schema', async () => {
    const { url, pool } = await oldDatabase()
    try {
      await expect(upgradeFinance({ url, apply: true, contract: true })).rejects.toThrow(
        'exported reconciliation report',
      )
      expect(
        (
          await pool.query<{ name: string | null }>(
            "SELECT to_regclass('public.payment_allocations') AS name",
          )
        ).rows[0]?.name,
      ).toBeNull()
      expect(
        (await pool.query<{ count: string }>('SELECT count(*) AS count FROM payments')).rows[0]
          ?.count,
      ).toBe('5')
    } finally {
      await pool.end()
    }
  })
  it('K08: reconciles every received document including those without any historical payment', async () => {
    const { url, pool, report } = await oldDatabase()
    try {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO purchase_orders (no,order_date,supplier_id,buyer_id,status,received_at,received_by,created_by)
        SELECT 'PO-OLD-UNPAID','2026-09-28',supplier_id,buyer_id,'received',received_at,received_by,created_by FROM purchase_orders WHERE status='received' LIMIT 1 RETURNING id`,
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('Missing unpaid legacy fixture')
      await pool.query(
        `INSERT INTO purchase_order_lines (po_id,material_id,name,unit,qty,received_qty,price_cents,order_price_cents,sort,created_by)
        SELECT $1,material_id,name,unit,3,3,100,100,0,created_by FROM purchase_order_lines LIMIT 1`,
        [id],
      )
      const preview = await upgradeFinance({ url })
      expect(preview.documents.find((row) => row.po_id === id)).toMatchObject({
        payable: '300',
        paid: '0',
        unpaid: '300',
      })
      const result = await upgradeFinance({ url, apply: true, contract: true, reportPath: report })
      expect(result.documents).toEqual(preview.documents)
      expect(result.suppliers).toEqual(preview.suppliers)
      expect(result.rows).toHaveLength(5)
    } finally {
      await pool.end()
    }
  })
  it('runs the standalone CLI against the original seeded database, never uses environment URLs, and exports a reconciled audit', async () => {
    const { url, pool, report } = await oldDatabase()
    const run = (...flags: string[]) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--conditions=source',
            'db/upgrade-finance.ts',
            '--url',
            url,
            '--report',
            report,
            ...flags,
          ],
          {
            cwd: new URL('../', import.meta.url),
            encoding: 'utf8',
            env: { ...process.env, DATABASE_URL: 'postgres://unused.invalid/production' },
          },
        ),
      ) as UpgradeReport
    try {
      const original = (
        await pool.query<Record<string, unknown>>('SELECT * FROM payments ORDER BY id')
      ).rows
      const preview = run()
      expect(preview.phase).toBe('dry-run')
      expect(preview.payments).toBe(5)
      expect(preview.anomalies).toEqual([])
      expect(
        (
          await pool.query<{ name: string | null }>(
            "SELECT to_regclass('public.payment_allocations') AS name",
          )
        ).rows[0]?.name,
      ).toBeNull()
      const applied = run('--apply', '--contract')
      expect(applied.phase).toBe('contracted')
      expect(applied.anomalies).toEqual([])
      expect(applied.rows).toHaveLength(5)
      expect(applied.documents).toEqual(preview.documents)
      expect(applied.suppliers).toEqual(preview.suppliers)
      expect(JSON.parse(await readFile(report, 'utf8'))).toEqual(applied)
      expect(
        (await pool.query<Record<string, unknown>>('SELECT * FROM payments ORDER BY id')).rows,
      ).toEqual(original.map(({ po_id: _poId, ...row }) => row))
      expect(run('--apply', '--contract').phase).toBe('already-contracted')
      expect(JSON.parse(await readFile(report, 'utf8'))).toEqual(applied)
      expect(
        (await pool.query<{ count: string }>('SELECT count(*) AS count FROM payment_allocations'))
          .rows[0]?.count,
      ).toBe('5')
    } finally {
      await pool.end()
    }
  })
})
