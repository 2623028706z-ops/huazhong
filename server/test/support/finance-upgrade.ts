import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { beforeAll, afterAll, expect, inject } from 'vitest'
import { createDb } from '../../db/client.ts'
import { runMigrations } from '../../db/migrate.ts'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const BASE = 'b04a3ce242033c82e283bdf95f0e9073ec910a9f'
export const OLD_PAYMENT_KEY = 'ec991f07-6500-4907-bdb0-dce1c1ef0001'
let legacy: string
const databases: string[] = []
export async function snapshotOldDatabase(url: string): Promise<string> {
  const source = new URL(url)
  const database = `hz_upgrade_backup_${randomUUID().replaceAll('-', '')}`
  databases.push(database)
  const admin = new pg.Client({ connectionString: inject('adminUrl') })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE "${source.pathname.slice(1)}"`)
  } finally {
    await admin.end()
  }
  source.pathname = `/${database}`
  return source.toString()
}
export async function restoreOldDatabase(url: string, snapshotUrl: string): Promise<void> {
  const destination = new URL(url).pathname.slice(1)
  const source = new URL(snapshotUrl).pathname.slice(1)
  const admin = new pg.Client({ connectionString: inject('adminUrl') })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE "${destination}" WITH (FORCE)`)
    await admin.query(`CREATE DATABASE "${destination}" TEMPLATE "${source}"`)
  } finally {
    await admin.end()
  }
}
beforeAll(async () => {
  legacy = await mkdtemp(path.join(tmpdir(), 'huazhong-original-finance-'))
  const files = execFileSync(
    'git',
    [
      'ls-tree',
      '-r',
      '--name-only',
      BASE,
      'server/db/schema',
      'server/db/seed',
      'server/db/client.ts',
      'server/package.json',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
  for (const file of files) {
    const target = path.join(legacy, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, execFileSync('git', ['show', `${BASE}:${file}`], { cwd: ROOT }))
  }
  await symlink(path.join(ROOT, 'server/node_modules'), path.join(legacy, 'server/node_modules'))
}, 120_000)
afterAll(async () => {
  const admin = new pg.Client({ connectionString: inject('adminUrl') })
  await admin.connect()
  for (const database of databases) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`)
  await admin.end()
  await rm(legacy, { recursive: true, force: true })
})

export async function oldDatabase(): Promise<{ url: string; pool: pg.Pool; report: string }> {
  const database = `hz_upgrade_${randomUUID().replaceAll('-', '')}`
  databases.push(database)
  const admin = new pg.Client({ connectionString: inject('adminUrl') })
  await admin.connect()
  await admin.query(`CREATE DATABASE "${database}"`)
  await admin.end()
  const url = new URL(inject('adminUrl'))
  url.pathname = `/${database}`
  const pool = new pg.Pool({ connectionString: url.toString() })
  await runMigrations(createDb(pool), 4)
  const clientFile = pathToFileURL(path.join(legacy, 'server/db/client.ts')).href
  const seedFile = pathToFileURL(path.join(legacy, 'server/db/seed/seed.ts')).href
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {createDb,createPool} from ${JSON.stringify(clientFile)}; import {seed} from ${JSON.stringify(seedFile)}; const pool=createPool(${JSON.stringify(url.toString())}); try {await seed(createDb(pool));} finally {await pool.end();}`,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  )
  expect(
    (await pool.query<Record<string, unknown>>('SELECT count(*) AS count FROM payments')).rows[0]
      ?.count,
  ).toBe('0')
  await pool.query<
    Record<string, unknown>
  >(`INSERT INTO purchase_orders (no,order_date,supplier_id,buyer_id,status,received_at,received_by,created_by)
    SELECT 'PO-OLD-UPGRADE-SECOND','2026-09-28',s.id,p.buyer_id,'received',p.received_at,p.received_by,p.created_by FROM purchase_orders p JOIN suppliers s ON s.id<>p.supplier_id WHERE p.status='received' LIMIT 1`)
  await pool.query<
    Record<string, unknown>
  >(`INSERT INTO purchase_orders (no,order_date,supplier_id,buyer_id,status,received_at,received_by,created_by)
    SELECT 'PO-OLD-UPGRADE-VOID','2026-09-28',supplier_id,buyer_id,'received',received_at,received_by,created_by FROM purchase_orders WHERE status='received' LIMIT 1`)
  await pool.query<
    Record<string, unknown>
  >(`INSERT INTO purchase_order_lines (po_id,material_id,name,unit,qty,received_qty,price_cents,order_price_cents,sort,created_by)
    SELECT p.id,l.material_id,l.name,l.unit,20,20,100,100,0,p.created_by FROM purchase_orders p CROSS JOIN LATERAL (SELECT * FROM purchase_order_lines LIMIT 1) l WHERE p.no IN ('PO-OLD-UPGRADE-SECOND','PO-OLD-UPGRADE-VOID')`)
  await pool.query<
    Record<string, unknown>
  >(`INSERT INTO payments (no,po_id,supplier_id,pay_date,amount_cents,method_name,status,created_by,created_at,updated_at,void_reason,voided_by,voided_at)
    SELECT 'FK-OLD-'||p.id||'-'||v.status,p.id,p.supplier_id,CASE WHEN v.status='valid' THEN '2026-09-27'::date ELSE '2026-09-28'::date END,
    (SELECT sum((received_qty-returned_qty)*price_cents) FROM purchase_order_lines WHERE po_id=p.id),'旧停用付款方式',v.status::record_status,(SELECT id FROM accounts WHERE phone='13700000006'),
    CASE WHEN v.status='valid' THEN '2026-09-30T02:00:00Z'::timestamptz ELSE '2026-09-30T01:00:00Z'::timestamptz END,'2026-09-30T03:00:00Z',
    CASE WHEN v.status='voided' THEN '旧付款误录' END,CASE WHEN v.status='voided' THEN (SELECT id FROM accounts WHERE phone='13700000006') END,CASE WHEN v.status='voided' THEN '2026-09-30T03:00:00Z'::timestamptz END
    FROM purchase_orders p CROSS JOIN (VALUES ('valid'),('voided')) v(status) WHERE p.status='received' AND (v.status='voided' OR p.no<>'PO-OLD-UPGRADE-VOID')`)
  await pool.query<Record<string, unknown>>(
    'UPDATE suppliers SET enabled=false WHERE id=(SELECT supplier_id FROM payments LIMIT 1)',
  )
  await pool.query<Record<string, unknown>>(
    "INSERT INTO payment_methods (kind,name,enabled,created_by) SELECT 'pay','旧停用付款方式',false,created_by FROM payments LIMIT 1",
  )
  await pool.query<Record<string, unknown>>(
    `INSERT INTO idempotency_keys (account_id,key,endpoint,response) SELECT created_by,$1,'POST /finance/payments',jsonb_build_object('id',id::text,'no',no,'docType','po','docId',po_id::text,'docNo','旧采购单','amountCents',amount_cents) FROM payments WHERE status='valid' ORDER BY id LIMIT 1`,
    [OLD_PAYMENT_KEY],
  )
  return { url: url.toString(), pool, report: path.join(legacy, `${database}-report.json`) }
}
