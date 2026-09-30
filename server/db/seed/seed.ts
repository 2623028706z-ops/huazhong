// 写入示例数据（data.ts）。第一个管理员的 id 和 created_by 相同（04 章第 3.1 节）
import { sql } from 'drizzle-orm'
import type { Db, Tx } from '../client.ts'
import {
  accountModules,
  accounts,
  customers,
  materialCategories,
  materials,
  stockBatches,
  stores,
  suppliers,
} from '../schema/index.ts'
import {
  seedAccounts,
  seedCustomers,
  seedMaterialCategories,
  seedMaterials,
  seedStores,
  seedSuppliers,
} from './data.ts'

async function insertMaterials(tx: Tx, createdBy: number): Promise<void> {
  const categoryIds = new Map<string, number>()
  for (const c of seedMaterialCategories) {
    const [row] = await tx
      .insert(materialCategories)
      .values({ name: c.name, sort: c.sort, createdBy })
      .returning()
    if (row) categoryIds.set(c.key, row.id)
  }
  for (const m of seedMaterials) {
    const categoryId = categoryIds.get(m.category) ?? 0
    const values = { code: m.code, name: m.name, categoryId, unit: m.unit, createdBy }
    const [row] = await tx.insert(materials).values(values).returning()
    if (!row) continue
    await tx
      .insert(stockBatches)
      .values(m.batches.map((b) => ({ ...b, materialId: row.id, createdBy })))
  }
}

type Admin = (typeof seedAccounts)[0]

async function insertFirstAdmin(tx: Tx, admin: Admin): Promise<number> {
  const result = await tx.execute<{ id: string }>(sql`SELECT nextval('accounts_id_seq') AS id`)
  const id = Number(result.rows[0]?.id)
  await tx.execute(sql`
    INSERT INTO accounts (id, created_by, type, name, phone)
    OVERRIDING SYSTEM VALUE
    VALUES (${id}, ${id}, ${admin.type}, ${admin.name}, ${admin.phone})`)
  return id
}

async function insertOrg(tx: Tx, createdBy: number) {
  const customerIds = new Map<string, number>()
  for (const c of seedCustomers) {
    const [row] = await tx.insert(customers).values({ name: c.name, createdBy }).returning()
    if (row) customerIds.set(c.key, row.id)
  }
  const storeIds = new Map<string, number>()
  for (const s of seedStores) {
    const customerId = customerIds.get(s.customer) ?? 0
    const values = { customerId, name: s.name, enabled: s.enabled, createdBy }
    const [row] = await tx.insert(stores).values(values).returning()
    if (row) storeIds.set(s.key, row.id)
  }
  const supplierIds = new Map<string, number>()
  for (const s of seedSuppliers) {
    const [row] = await tx.insert(suppliers).values({ name: s.name, createdBy }).returning()
    if (row) supplierIds.set(s.key, row.id)
  }
  return { storeIds, supplierIds }
}

export async function seed(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const [admin, ...rest] = seedAccounts
    const adminId = await insertFirstAdmin(tx, admin)
    const { storeIds, supplierIds } = await insertOrg(tx, adminId)
    await insertMaterials(tx, adminId)
    for (const a of rest) {
      const storeId = 'store' in a ? (storeIds.get(a.store) ?? null) : null
      const supplierId = 'supplier' in a ? (supplierIds.get(a.supplier) ?? null) : null
      const values = {
        type: a.type,
        name: a.name,
        phone: a.phone,
        storeId,
        supplierId,
        createdBy: adminId,
      }
      const [row] = await tx.insert(accounts).values(values).returning()
      if (row && 'modules' in a) {
        await tx
          .insert(accountModules)
          .values(a.modules.map((module) => ({ accountId: row.id, module })))
      }
    }
  })
}
