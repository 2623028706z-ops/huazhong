import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { contract } from '@huazhong/shared'
import { describe, expect, it } from 'vitest'
import { upgradeFinance } from '../db/upgrade-finance.ts'
import { oldDatabase, OLD_PAYMENT_KEY } from './support/finance-upgrade.ts'
import { upgradedApi } from './support/finance-upgrade-api.ts'

async function businessSnapshot(pool: pg.Pool) {
  const snapshot: Record<string, unknown[]> = {}
  for (const table of [
    'payments',
    'payment_allocations',
    'refunds',
    'operation_logs',
    'idempotency_keys',
    'doc_sequences',
  ]) {
    snapshot[table] = (
      await pool.query(`SELECT * FROM ${table} ORDER BY to_jsonb(${table})::text`)
    ).rows
  }
  return snapshot
}

describe('K07: upgraded old payment idempotency identity through actual HTTP', () => {
  it('replays an old successful key into the new supplier ledger view without inserting money, including the original old request body', async () => {
    const { url, pool, report } = await oldDatabase()
    await upgradeFinance({ url, apply: true, contract: true, reportPath: report })
    const api = await upgradedApi(url, pool)
    try {
      const payment = (
        await pool.query<{
          id: string
          supplier_id: string
          amount_cents: number
          method_name: string
        }>("SELECT * FROM payments WHERE status='valid' ORDER BY id LIMIT 1")
      ).rows[0]
      if (!payment) throw new Error('Missing original payment fixture')
      const mapping = (
        await pool.query<{ po_id: string }>(
          'SELECT po_id FROM payment_allocations WHERE payment_id=$1',
          [payment.id],
        )
      ).rows[0]
      if (!mapping) throw new Error('Missing original allocation fixture')
      const oldRequest = {
        docType: 'po',
        docId: mapping.po_id,
        amountCents: payment.amount_cents,
        payDate: '2026-09-27',
        methodName: payment.method_name,
        note: '',
      }
      const unchanged = await businessSnapshot(pool)
      const replay = await api.call('POST', '/finance/payments', oldRequest, OLD_PAYMENT_KEY)
      expect(replay.status).toBe(200)
      const view = contract.getPayment.response.parse(replay.body.data)
      expect(view.id).toBe(payment.id)
      expect(view.amountCents).toBe(payment.amount_cents)
      expect(view.allocations).toHaveLength(1)
      expect(view.prepaidCents).toBe(0)
      expect('docId' in view).toBe(false)
      const simultaneous = await Promise.all([
        api.call('POST', '/finance/payments', oldRequest, OLD_PAYMENT_KEY),
        api.call('POST', '/finance/payments', {}, OLD_PAYMENT_KEY),
        api.call('POST', '/finance/payments', undefined, OLD_PAYMENT_KEY),
      ])
      expect(simultaneous.map((response) => response.status)).toEqual([200, 200, 200])
      expect(
        simultaneous.map((response) => contract.getPayment.response.parse(response.body.data).id),
      ).toEqual([payment.id, payment.id, payment.id])
      expect(await businessSnapshot(pool)).toEqual(unchanged)
      expect(
        (await pool.query<{ count: string }>('SELECT count(*) AS count FROM payments')).rows[0]
          ?.count,
      ).toBe('5')
      const unknown = await api.call('POST', '/finance/payments', oldRequest, randomUUID())
      expect(unknown.status).toBe(422)
      expect(unknown.body.error?.code).toBe('VALIDATION_FAILED')
      expect(await businessSnapshot(pool)).toEqual(unchanged)
      expect(
        (await pool.query<{ count: string }>('SELECT count(*) AS count FROM payments')).rows[0]
          ?.count,
      ).toBe('5')
    } finally {
      await api.close()
      await pool.end()
    }
  })
  it('preserves old keys while new registrations and new-key retries create exactly one supplier payment', async () => {
    const { url, pool, report } = await oldDatabase()
    await upgradeFinance({ url, apply: true, contract: true, reportPath: report })
    const api = await upgradedApi(url, pool)
    try {
      const payment = (
        await pool.query<{ id: string; supplier_id: string }>(
          "SELECT * FROM payments WHERE status='valid' ORDER BY id LIMIT 1",
        )
      ).rows[0]
      const method = (
        await pool.query<{ name: string }>(
          "SELECT name FROM payment_methods WHERE kind='pay' AND enabled=true ORDER BY id LIMIT 1",
        )
      ).rows[0]
      if (!payment || !method) throw new Error('Missing old payment or enabled method')
      const source = await api.call('GET', `/finance/suppliers/${payment.supplier_id}/unpaid-docs`)
      expect(source.status).toBe(200)
      const snapshot = contract.listUnpaidDocuments.response.parse(source.body.data)
      const input = {
        supplierId: payment.supplier_id,
        payDate: '2026-10-03',
        amountCents: 13,
        methodName: method.name,
        note: '',
        ledgerToken: snapshot.ledgerToken,
        expected: snapshot.items.map((row) => ({
          docType: row.docType,
          docId: row.docId,
          version: row.version,
          unpaidCents: row.unpaidCents,
        })),
        allocs: [],
      }
      const oldReplay = await api.call('POST', '/finance/payments', input, OLD_PAYMENT_KEY)
      expect(oldReplay.status).toBe(200)
      expect(contract.getPayment.response.parse(oldReplay.body.data).id).toBe(payment.id)
      const newKey = randomUUID()
      const created = await api.call('POST', '/finance/payments', input, newKey)
      expect(created.status).toBe(200)
      const first = contract.getPayment.response.parse(created.body.data)
      expect(first.amountCents).toBe(13)
      expect(first.prepaidCents).toBe(13)
      const unchanged = await businessSnapshot(pool)
      const repeated = await api.call('POST', '/finance/payments', input, newKey)
      expect(repeated.status).toBe(200)
      expect(contract.getPayment.response.parse(repeated.body.data).id).toBe(first.id)
      expect(await businessSnapshot(pool)).toEqual(unchanged)
      expect(
        (await pool.query<{ count: string }>('SELECT count(*) AS count FROM payments')).rows[0]
          ?.count,
      ).toBe('6')
      expect(
        (
          await pool.query<{ count: string }>(
            'SELECT count(*) AS count FROM idempotency_keys WHERE key=$1',
            [OLD_PAYMENT_KEY],
          )
        ).rows[0]?.count,
      ).toBe('1')
    } finally {
      await api.close()
      await pool.end()
    }
  })
  it('replays an old success that was subsequently voided without reviving payment or allocation history', async () => {
    const { url, pool, report } = await oldDatabase()
    const key = randomUUID()
    const oldPayment = (
      await pool.query<{ id: string; amount_cents: number; po_id: string }>(
        "SELECT * FROM payments WHERE status='voided' ORDER BY id LIMIT 1",
      )
    ).rows[0]
    if (!oldPayment) throw new Error('Missing voided old payment fixture')
    await pool.query(
      `INSERT INTO idempotency_keys (account_id,key,endpoint,response)
      SELECT created_by,$1,'POST /finance/payments',jsonb_build_object('id',id::text,'no',no,'docType','po','docId',po_id::text,'amountCents',amount_cents) FROM payments WHERE id=$2`,
      [key, oldPayment.id],
    )
    await upgradeFinance({ url, apply: true, contract: true, reportPath: report })
    const api = await upgradedApi(url, pool)
    try {
      const unchanged = await businessSnapshot(pool)
      const replay = await api.call(
        'POST',
        '/finance/payments',
        { docType: 'po', docId: oldPayment.po_id },
        key,
      )
      expect(replay.status).toBe(200)
      const view = contract.getPayment.response.parse(replay.body.data)
      expect(view.id).toBe(oldPayment.id)
      expect(view.status).toBe('voided')
      expect(view.amountCents).toBe(oldPayment.amount_cents)
      expect(view.prepaidCents).toBe(0)
      expect(view.allocations[0]).toMatchObject({
        status: 'revoked',
        effectiveCents: 0,
        revokeReason: '旧付款误录',
      })
      expect(await businessSnapshot(pool)).toEqual(unchanged)
    } finally {
      await api.close()
      await pool.end()
    }
  })
})
