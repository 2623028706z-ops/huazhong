import { appError, copy, type ActionCode } from '@huazhong/shared'
import { eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'
import {
  accounts,
  suppliers,
  receipts,
  orders,
  payments,
  purchaseOrders,
} from '../../db/schema/index.ts'
import { enabledAction } from './domain/actions.ts'
import { hashToken } from './domain/token.ts'
import type { Viewer } from './domain/viewer.ts'
import type { WriteContext } from './write.service.ts'
import { customerStoreIds } from './org.ts'
export async function notifyCustomerFinance(ctx: WriteContext, customerId: number) {
  const money = await ctx.tx
    .select({ id: receipts.id })
    .from(receipts)
    .where(eq(receipts.customerId, customerId))
  const docs = await ctx.tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.customerId, customerId))
  ctx.notify(
    [
      { topic: `ar:${customerId}`, version: null },
      { topic: 'todo:finance', version: null },
      ...money.map((row) => ({ topic: `receipt:${row.id}` as const, version: null })),
      ...docs.map((row) => ({ topic: `order:${row.id}` as const, version: null })),
    ],
    { storeIds: await customerStoreIds(ctx.tx, customerId) },
  )
}

export async function notifySupplierFinance(ctx: WriteContext, supplierId: number) {
  const money = await ctx.tx
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.supplierId, supplierId))
  const docs = await ctx.tx
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, supplierId))
  ctx.notify(
    [
      { topic: `ap:${supplierId}`, version: null },
      { topic: `supplier:${supplierId}`, version: null },
      { topic: 'todo:finance', version: null },
      { topic: 'pos', version: null },
      ...money.map((row) => ({ topic: `payment:${row.id}` as const, version: null })),
      ...docs.flatMap((row) => [
        { topic: `po:${row.id}` as const, version: null },
        { topic: `payable:po:${row.id}` as const, version: null },
      ]),
    ],
    { supplierIds: [String(supplierId)] },
  )
}

export function owns(viewer: Viewer | undefined, createdBy: number) {
  return viewer?.type === 'admin' || viewer?.accountId === createdBy
}

export function ownActions(viewer: Viewer | undefined, createdBy: number, code: ActionCode) {
  return viewer?.modules.includes('finance') && owns(viewer, createdBy)
    ? [enabledAction(code, true)]
    : []
}

export async function actor(executor: Db | Tx, id: number | null) {
  if (id === null) return null
  const [row] = await executor
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, id))
  return { id: String(id), name: row?.name ?? '' }
}
export async function actors(executor: Db | Tx, ids: readonly (number | null)[]) {
  const unique = [...new Set(ids.filter((id): id is number => id !== null))]
  const rows = unique.length
    ? await executor
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(inArray(accounts.id, unique))
    : []
  return new Map(rows.map((row) => [row.id, { id: String(row.id), name: row.name }]))
}

export async function lockSupplierLedger(tx: Tx, id: number) {
  const [row] = await tx.select().from(suppliers).where(eq(suppliers.id, id)).for('update')
  if (!row) throw appError.notFound()
  return row
}

export function ledgerToken(value: unknown) {
  return hashToken(JSON.stringify(value))
}

export function assertSnapshot(
  current: {
    ledgerToken: string
    items: readonly { id: string; version: number; unpaidCents: number }[]
  },
  input: { ledgerToken: string; expected: readonly { version: number; unpaidCents: number }[] },
  ids: readonly string[],
  expectedIds: readonly string[],
) {
  const stale = () => {
    throw appError.stale(copy.rework.ledgerStale, current)
  }
  if (current.ledgerToken !== input.ledgerToken) stale()
  if (
    input.expected.length !== current.items.length ||
    current.items.some((item) => !expectedIds.includes(item.id))
  )
    stale()
  if (
    new Set(expectedIds).size !== expectedIds.length ||
    ids.some((id) => !expectedIds.includes(id))
  )
    stale()
  input.expected.forEach((expected, index) => {
    const actual = current.items.find((item) => item.id === expectedIds[index])
    if (
      !actual ||
      actual.version !== expected.version ||
      actual.unpaidCents !== expected.unpaidCents
    )
      stale()
  })
}
