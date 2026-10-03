// 写入示例数据（data.ts、sales-data.ts）。第一个管理员的 id 和 created_by 相同（04 章第 3.1 节）
import { sql } from 'drizzle-orm'
import type { Db, Tx } from '../client.ts'
import {
  accountModules,
  accounts,
  customers,
  materialCategories,
  materials,
  outCategories,
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
import { insertSales } from './seed-sales.ts'
import { insertPurchase } from './seed-purchase.ts'

async function insertMaterials(tx: Tx, createdBy: number): Promise<Map<string, number>> {
  const categoryIds = new Map<string, number>()
  for (const c of seedMaterialCategories) {
    const [row] = await tx
      .insert(materialCategories)
      .values({ name: c.name, sort: c.sort, createdBy })
      .returning()
    if (row) categoryIds.set(c.key, row.id)
  }
  const materialIds = new Map<string, number>()
  for (const m of seedMaterials) {
    const categoryId = categoryIds.get(m.category) ?? 0
    const values = { code: m.code, name: m.name, categoryId, unit: m.unit, createdBy }
    const [row] = await tx.insert(materials).values(values).returning()
    if (!row) continue
    materialIds.set(m.key, row.id)
    await tx
      .insert(stockBatches)
      .values(m.batches.map((b) => ({ ...b, materialId: row.id, createdBy })))
  }
  return materialIds
}

async function insertOutCategories(tx: Tx, createdBy: number) {
  await tx
    .insert(outCategories)
    .values(
      ['生产领用', '门店零售', '样品', '其他'].map((name, sort) => ({ name, sort, createdBy })),
    )
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
  for (const { key, customer, ...store } of seedStores) {
    const customerId = customerIds.get(customer) ?? 0
    const [row] = await tx
      .insert(stores)
      .values({ ...store, customerId, createdBy })
      .returning()
    if (row) storeIds.set(key, row.id)
  }
  const supplierIds = new Map<string, number>()
  for (const { key, ...fields } of seedSuppliers) {
    const [row] = await tx
      .insert(suppliers)
      .values({ ...fields, createdBy })
      .returning()
    if (row) supplierIds.set(key, row.id)
  }
  return { customerIds, storeIds, supplierIds }
}

export async function seed(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const [admin, ...rest] = seedAccounts
    const adminId = await insertFirstAdmin(tx, admin)
    const { customerIds, storeIds, supplierIds } = await insertOrg(tx, adminId)
    const materialIds = await insertMaterials(tx, adminId)
    const accountIds = new Map<string, number>([[admin.key, adminId]])
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
      if (!row) continue
      accountIds.set(a.key, row.id)
      if ('modules' in a) {
        await tx
          .insert(accountModules)
          .values(a.modules.map((module) => ({ accountId: row.id, module })))
      }
    }
    await insertSales(tx, {
      admin: adminId,
      accounts: accountIds,
      customers: customerIds,
      stores: storeIds,
      materials: materialIds,
    })
    await insertPurchase(tx, {
      admin: adminId,
      accounts: accountIds,
      suppliers: supplierIds,
      materials: materialIds,
    })
    await insertOutCategories(tx, adminId)
  })
}
