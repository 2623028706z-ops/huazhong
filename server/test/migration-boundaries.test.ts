import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import pg from 'pg'
import { describe, expect, inject, it } from 'vitest'
import { moveTypes } from '@huazhong/shared'
import { createDb } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import { seed } from '../db/seed/seed.ts'

const root = path.resolve(import.meta.dirname, '../..')
const baseline = 'b04a3ce242033c82e283bdf95f0e9073ec910a9f'

async function withEmptyDatabase(work: (pool: pg.Pool) => Promise<void>): Promise<void> {
  const database = `hz_empty_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Client({ connectionString: inject('adminUrl') })
  await admin.connect()
  const url = new URL(inject('adminUrl'))
  url.pathname = `/${database}`
  const pool = new pg.Pool({ connectionString: url.toString() })
  try {
    await admin.query(`CREATE DATABASE "${database}"`)
    await work(pool)
  } finally {
    await pool.end()
    for (let attempt = 0; attempt < 100; attempt++) {
      const connections = await admin.query('SELECT 1 FROM pg_stat_activity WHERE datname=$1', [
        database,
      ])
      if (!connections.rowCount) break
      await setTimeout(10)
    }
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`)
    await admin.end()
  }
}

describe('K06: actual empty-database migrations and committed enum boundaries', () => {
  it('preserves every already-applied baseline SQL file and journal entry byte-for-byte', async () => {
    const journalPath = 'server/db/migrations/meta/_journal.json'
    const original = JSON.parse(
      execFileSync('git', ['show', `${baseline}:${journalPath}`], { cwd: root, encoding: 'utf8' }),
    ) as { entries: { tag: string }[] }
    const current = JSON.parse(await readFile(path.join(root, journalPath), 'utf8')) as {
      entries: { tag: string }[]
    }
    expect(current.entries.slice(0, original.entries.length)).toEqual(original.entries)
    for (const entry of original.entries) {
      const file = `server/db/migrations/${entry.tag}.sql`
      expect(await readFile(path.join(root, file), 'utf8')).toBe(
        execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' }),
      )
    }
  })

  it('builds an actual empty database in the real migrator transaction, retains stock direction checks and reruns without duplication', async () => {
    await withEmptyDatabase(async (pool) => {
      await runMigrations(createDb(pool))
      const journal = (await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id'))
        .rows
      expect(journal).toHaveLength(10)
      const types = await pool.query<{ enumlabel: string }>(
        "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=enumtypid WHERE typname='move_type' ORDER BY enumsortorder",
      )
      expect(types.rows.map((row) => row.enumlabel)).toEqual(moveTypes)
      await seed(createDb(pool))
      const insert = `INSERT INTO stock_moves (type,material_id,batch_id,qty,doc_type,doc_id,doc_no,created_by)
        SELECT $1,b.material_id,b.id,$2,'migration-check',b.id,'migration-check',b.created_by FROM stock_batches b ORDER BY b.id LIMIT 1`
      for (const type of ['out_void', 'loss_void']) {
        await expect(pool.query(insert, [type, 1])).resolves.toMatchObject({ rowCount: 1 })
        await expect(pool.query(insert, [type, -1])).rejects.toMatchObject({
          code: '23514',
          constraint: 'stock_moves_qty_direction',
        })
      }
      await expect(pool.query(insert, ['manual_out', 1])).rejects.toMatchObject({
        code: '23514',
        constraint: 'stock_moves_qty_direction',
      })
      await expect(pool.query(insert, ['po_in', 0])).rejects.toMatchObject({
        code: '23514',
        constraint: 'stock_moves_qty_direction',
      })
      await runMigrations(createDb(pool))
      expect(
        (await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows,
      ).toEqual(journal)
    })
  })

  it('commits expansion before a separate connection consumes the new status enums, then contracts safely', async () => {
    await withEmptyDatabase(async (pool) => {
      await runMigrations(createDb(pool), 4)
      await runMigrations(createDb(pool), 5)
      const observer = new pg.Client(pool.options)
      await observer.connect()
      try {
        expect(
          (
            await observer.query(
              "SELECT 'voided'::order_status AS order_status, 'voided'::po_status AS po_status, 'loss_image'::file_purpose AS purpose, 'direct'::alloc_kind AS kind",
            )
          ).rows,
        ).toEqual([
          { order_status: 'voided', po_status: 'voided', purpose: 'loss_image', kind: 'direct' },
        ])
      } finally {
        await observer.end()
      }
      await runMigrations(createDb(pool))
      expect((await pool.query('SELECT * FROM drizzle.__drizzle_migrations')).rows).toHaveLength(10)
    })
  })

  it('0009 merges same-name receive/pay methods into one row before the unique name constraint', async () => {
    await withEmptyDatabase(async (pool) => {
      await runMigrations(createDb(pool), 8)
      await pool.query(
        "INSERT INTO accounts (id,created_by,type,name,phone) OVERRIDING SYSTEM VALUE VALUES (1,1,'admin','管理员','13700000001')",
      )
      await pool.query(`INSERT INTO payment_methods (kind,name,enabled,sort,created_by) VALUES
        ('receive','微信',false,1,1),('pay','微信',true,3,1),
        ('receive','现金',false,0,1),('pay','现金',false,2,1),
        ('pay','转账',true,4,1)`)
      await runMigrations(createDb(pool))
      const rows = await pool.query<{ name: string; enabled: boolean; sort: number }>(
        'SELECT name,enabled,sort FROM payment_methods ORDER BY id',
      )
      expect(rows.rows).toEqual([
        { name: '微信', enabled: true, sort: 1 },
        { name: '现金', enabled: false, sort: 0 },
        { name: '转账', enabled: true, sort: 4 },
      ])
      await expect(
        pool.query("INSERT INTO payment_methods (name,created_by) VALUES ('微信',1)"),
      ).rejects.toMatchObject({ code: '23505', constraint: 'payment_methods_name_unique' })
    })
  })
})
