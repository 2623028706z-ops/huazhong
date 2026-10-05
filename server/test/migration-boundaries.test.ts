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
      expect(journal).toHaveLength(
        (
          JSON.parse(
            await readFile(path.join(root, 'server/db/migrations/meta/_journal.json'), 'utf8'),
          ) as { entries: unknown[] }
        ).entries.length,
      )
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
      expect((await pool.query('SELECT * FROM drizzle.__drizzle_migrations')).rows).toHaveLength(
        (
          JSON.parse(
            await readFile(path.join(root, 'server/db/migrations/meta/_journal.json'), 'utf8'),
          ) as { entries: unknown[] }
        ).entries.length,
      )
    })
  })

  it('0010 conservatively protects existing counts at the current per-material move boundary and reruns unchanged', async () => {
    await withEmptyDatabase(async (pool) => {
      await runMigrations(createDb(pool), 9)
      await pool.query(
        `INSERT INTO accounts(id,created_by,type,name,phone) OVERRIDING SYSTEM VALUE VALUES(1,1,'admin','迁移边界','13700000000')`,
      )
      await pool.query(`INSERT INTO material_categories(name,created_by) VALUES('边界分类',1)`)
      await pool.query(
        `INSERT INTO materials(code,name,unit,category_id,created_by) VALUES('M-MIGRATION','边界花材','枝',1,1)`,
      )
      await pool.query(
        `INSERT INTO stock_batches(material_id,in_date,qty,left_qty,source_type,source_id,created_by) VALUES(1,'2026-09-29',10,10,'stocktake',1,1)`,
      )
      await pool.query(`INSERT INTO stocktakes (no,check_date,categories,created_by)
        VALUES ('PD-MIGRATION','2026-09-29','[]',1)`)
      await pool.query(`INSERT INTO stocktake_lines (stocktake_id,material_id,name,unit,book_qty,actual_qty,sort,created_by)
        SELECT c.id,b.material_id,m.name,m.unit,b.left_qty,b.left_qty,0,1
        FROM stocktakes c CROSS JOIN stock_batches b JOIN materials m ON m.id=b.material_id
        WHERE c.no='PD-MIGRATION' ORDER BY b.id LIMIT 1`)
      await pool.query(`INSERT INTO stock_moves (type,material_id,batch_id,qty,doc_type,doc_id,doc_no,created_by)
        SELECT 'manual_out',b.material_id,b.id,-1,'wh',b.id,'MIGRATION-MOVE',1
        FROM stock_batches b JOIN stocktake_lines c ON c.material_id=b.material_id ORDER BY b.id LIMIT 1`)
      const maximum = await pool.query<{ id: string }>(`SELECT max(m.id) AS id FROM stock_moves m
        JOIN stocktake_lines c ON c.material_id=m.material_id`)
      await runMigrations(createDb(pool))
      const lines = await pool.query<{ last_move_id: string }>(
        'SELECT last_move_id FROM stocktake_lines',
      )
      expect(lines.rows).toEqual([{ last_move_id: maximum.rows[0]?.id }])
      await runMigrations(createDb(pool))
      expect((await pool.query('SELECT last_move_id FROM stocktake_lines')).rows).toEqual(
        lines.rows,
      )
      await expect(pool.query('UPDATE stocktake_lines SET last_move_id=-1')).rejects.toMatchObject({
        code: '23514',
        constraint: 'stocktake_lines_last_move',
      })
    })
  })

  it('0015 splits shared products into per-customer products, remaps order lines and snapshots shipped BOMs', async () => {
    await withEmptyDatabase(async (pool) => {
      await runMigrations(createDb(pool), 14)
      await pool.query(
        "INSERT INTO accounts (id,created_by,type,name,phone) OVERRIDING SYSTEM VALUE VALUES (1,1,'admin','管理员','13700000001')",
      )
      await pool.query(`INSERT INTO material_categories (name,created_by) VALUES ('鲜切花',1)`)
      await pool.query(`INSERT INTO materials (code,name,unit,category_id,created_by) VALUES
        ('M-1','玫瑰','枝',1,1),('M-2','尤加利','扎',1,1)`)
      await pool.query(`INSERT INTO product_categories (name,created_by) VALUES ('花束',1)`)
      await pool.query(`INSERT INTO products (name,category_id,unit,created_by) VALUES
        ('玫瑰束',1,'束',1),('旧花束',1,'束',1)`)
      await pool.query(`INSERT INTO product_bom_lines (product_id,material_id,qty,created_by) VALUES
        (1,1,10,1),(2,2,4,1)`)
      await pool.query(`INSERT INTO customers (name,created_by) VALUES ('甲',1),('乙',1),('丙',1)`)
      await pool.query(`INSERT INTO catalog_categories (customer_id,name,created_by) VALUES
        (1,'日常',1),(2,'礼赠',1)`)
      await pool.query(`INSERT INTO catalog_items
        (customer_id,product_id,category_id,customer_code,price_cents,enabled,created_by) VALUES
        (1,1,1,'A-1',6800,true,1),(2,1,2,'',7000,false,1)`)
      await pool.query(
        `INSERT INTO stores (customer_id,name,created_by) VALUES (1,'甲店',1),(3,'丙店',1)`,
      )
      await pool.query(`INSERT INTO orders
        (no,order_date,ship_date,customer_id,store_id,status,origin,shipped_at,created_by) VALUES
        ('SO-1','2026-09-01','2026-09-02',1,1,'shipped','sales','2026-09-02T00:00:00Z',1),
        ('SO-2','2026-09-01','2026-09-02',3,2,'to_ship','sales',null,1)`)
      await pool.query(`INSERT INTO order_lines
        (order_id,product_id,name,unit,qty,price_cents,list_price_cents,shipped_qty,sort,created_by) VALUES
        (1,1,'玫瑰束','束',5,6800,6800,5,0,1),
        (1,2,'旧花束','束',2,5000,5000,2,1,1),
        (2,1,'玫瑰束','束',3,6500,6500,null,0,1)`)
      await runMigrations(createDb(pool))

      const rows =
        await pool.query(`SELECT c.name AS customer, p.name, p.enabled, p.price_cents AS price,
          p.customer_code AS code, cc.name AS category,
          (SELECT string_agg(m.name || '×' || b.qty, ',' ORDER BY m.id) FROM product_bom_lines b
            JOIN materials m ON m.id = b.material_id WHERE b.product_id = p.id) AS bom
        FROM products p JOIN customers c ON c.id = p.customer_id
        JOIN catalog_categories cc ON cc.id = p.category_id ORDER BY c.id, p.name`)
      expect(rows.rows).toEqual([
        {
          customer: '甲',
          name: '旧花束',
          enabled: false,
          price: 5000,
          code: '',
          category: '日常',
          bom: '尤加利×4',
        },
        {
          customer: '甲',
          name: '玫瑰束',
          enabled: true,
          price: 6800,
          code: 'A-1',
          category: '日常',
          bom: '玫瑰×10',
        },
        {
          customer: '乙',
          name: '玫瑰束',
          enabled: false,
          price: 7000,
          code: '',
          category: '礼赠',
          bom: '玫瑰×10',
        },
        {
          customer: '丙',
          name: '玫瑰束',
          enabled: false,
          price: 6500,
          code: '',
          category: '未分类',
          bom: '玫瑰×10',
        },
      ])
      const lines =
        await pool.query(`SELECT l.name, p.name AS product, p.customer_id = o.customer_id AS own
        FROM order_lines l JOIN orders o ON o.id = l.order_id JOIN products p ON p.id = l.product_id
        ORDER BY l.id`)
      expect(
        lines.rows.every(
          (row: { name: string; product: string; own: boolean }) =>
            row.own && row.name === row.product,
        ),
      ).toBe(true)
      const snapshots = await pool.query(`SELECT l.name, b.material_name, b.unit, b.qty
        FROM order_line_bom_lines b JOIN order_lines l ON l.id = b.order_line_id ORDER BY l.id`)
      expect(snapshots.rows).toEqual([
        { name: '玫瑰束', material_name: '玫瑰', unit: '枝', qty: 10 },
        { name: '旧花束', material_name: '尤加利', unit: '扎', qty: 4 },
      ])
      const gone = await pool.query(
        `SELECT to_regclass('product_categories') AS a, to_regclass('catalog_items') AS b`,
      )
      expect(gone.rows).toEqual([{ a: null, b: null }])
      await expect(
        pool.query(`INSERT INTO products (customer_id,name,category_id,unit,price_cents,created_by)
          VALUES (1,'玫瑰束',1,'束',100,1)`),
      ).rejects.toMatchObject({ code: '23505', constraint: 'products_customer_name_unique' })
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

  it('DZ migrations enforce source occupancy, whole-statement settlements and one-source credit uses without old allocation tables', async () => {
    await withEmptyDatabase(async (pool) => {
      await runMigrations(createDb(pool))
      await seed(createDb(pool))
      expect(
        (
          await pool.query(
            "SELECT to_regclass('allocations') AS ar, to_regclass('payment_allocations') AS ap",
          )
        ).rows,
      ).toEqual([{ ar: null, ap: null }])
      const duplicateSource = `INSERT INTO statement_lines
        (statement_id,source_type,source_id,source_no,source_date,amount_cents,previous_period,sort,created_by)
        SELECT (SELECT id FROM statements WHERE id<>l.statement_id ORDER BY id LIMIT 1),
          l.source_type,l.source_id,l.source_no,l.source_date,l.amount_cents,false,99,l.created_by
        FROM statement_lines l ORDER BY l.id LIMIT 1`
      await expect(pool.query(duplicateSource)).rejects.toMatchObject({
        code: '23505',
        constraint: 'statement_lines_live_source',
      })
      await pool.query(
        'UPDATE statement_lines SET released_at=now() WHERE id=(SELECT min(id) FROM statement_lines)',
      )
      await expect(pool.query(duplicateSource)).resolves.toMatchObject({ rowCount: 1 })
      const duplicateSettlement = `INSERT INTO settlement_links
        (statement_id,receipt_id,amount_cents,created_by)
        SELECT statement_id,receipt_id,amount_cents,created_by FROM settlement_links ORDER BY id LIMIT 1`
      await expect(pool.query(duplicateSettlement)).rejects.toMatchObject({
        code: '23505',
        constraint: 'settlement_links_live_statement',
      })
      await pool.query(`INSERT INTO refunds(no,kind,customer_id,refund_date,amount_cents,method_name,created_by)
        SELECT 'TK-MIGRATION','receipt',customer_id,'2026-09-29',1,'微信',created_by
        FROM receipts ORDER BY id LIMIT 1`)
      const use = `INSERT INTO credit_uses(source_receipt_id,refund_id,amount_cents,created_by)
        SELECT r.id,f.id,1,r.created_by FROM receipts r CROSS JOIN refunds f
        WHERE f.no='TK-MIGRATION' ORDER BY r.id LIMIT 1`
      await expect(pool.query(use)).resolves.toMatchObject({ rowCount: 1 })
      await expect(
        pool.query(`INSERT INTO credit_uses(source_statement_id,statement_id,amount_cents,created_by)
        SELECT id,id,1,created_by FROM statements ORDER BY id LIMIT 1`),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'credit_uses_target',
      })
      await expect(
        pool.query(`INSERT INTO credit_uses(source_receipt_id,source_statement_id,refund_id,amount_cents,created_by)
        SELECT r.id,s.id,f.id,1,r.created_by FROM receipts r CROSS JOIN statements s CROSS JOIN refunds f LIMIT 1`),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'credit_uses_source',
      })
      for (const table of ['receipts', 'payments']) {
        const party = table === 'receipts' ? 'customer_id' : 'supplier_id',
          from = table === 'receipts' ? 'customers' : 'suppliers',
          date = table === 'receipts' ? 'receipt_date' : 'pay_date'
        // 优惠原因选填（0013 已删除约束）：不填原因也能写入
        await expect(
          pool.query(`INSERT INTO ${table}
          (no,${party},${date},amount_cents,discount_cents,method_name,created_by)
          SELECT 'FUND-MIGRATION',id,'2026-09-29',100,1,'微信',created_by FROM ${from} ORDER BY id LIMIT 1`),
        ).resolves.toMatchObject({ rowCount: 1 })
      }
    })
  })
})
