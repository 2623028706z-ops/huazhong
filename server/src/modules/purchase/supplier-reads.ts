import { contract, type OutputOf, type Supplier } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, ilike, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { accounts, suppliers } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { afterCursor } from '../../common/page.ts'
import { found } from '../../common/scope.ts'

function supplierRows(executor: Db | Tx) {
  const latest = executor
    .selectDistinctOn([accounts.supplierId], {
      supplierId: accounts.supplierId,
      accountId: accounts.id,
      accountEnabled: accounts.enabled,
      loginPhone: accounts.phone,
      openid: accounts.openid,
    })
    .from(accounts)
    .where(eq(accounts.type, 'supplier'))
    .orderBy(asc(accounts.supplierId), desc(accounts.enabled), desc(accounts.id))
    .as('supplier_account')
  return {
    latest,
    query: executor
      .select({
        supplier: suppliers,
        accountId: latest.accountId,
        accountEnabled: latest.accountEnabled,
        loginPhone: latest.loginPhone,
        openid: latest.openid,
        openPoCount:
          sql<number>`(SELECT count(*) FROM purchase_orders WHERE supplier_id = ${suppliers.id} AND status = 'to_receive')`.mapWith(
            Number,
          ),
      })
      .from(suppliers)
      .leftJoin(latest, eq(latest.supplierId, suppliers.id)),
  }
}
type Row = Awaited<ReturnType<typeof supplierRows>['query']>[number]
function supplierOf(row: Row, viewer: Viewer): Supplier {
  const s = row.supplier
  return {
    id: String(s.id),
    version: s.version,
    name: s.name,
    contact: s.contact,
    phone: s.phone,
    address: s.address,
    enabled: s.enabled,
    hasAccount: row.accountEnabled === true,
    account: {
      id: row.accountId === null ? null : String(row.accountId),
      enabled: row.accountEnabled === true,
      loginPhone: row.loginPhone ?? '',
      bound: row.openid !== null,
    },
    openPoCount: row.openPoCount,
    actions: viewer.modules.includes('purchase') ? [enabledAction('edit', false)] : [],
    lockedReason: null,
  }
}
@Injectable()
export class SupplierReads {
  constructor(@Inject(DB) private readonly db: Db) {}
  get(viewer: Viewer, id: number) {
    return this.item(this.db, viewer, id)
  }
  async item(executor: Db | Tx, viewer: Viewer, id: number) {
    const { query } = supplierRows(executor)
    return supplierOf(found((await query.where(eq(suppliers.id, id)))[0]), viewer)
  }
  async list(
    viewer: Viewer,
    input: ParsedInput<typeof contract.listSuppliers>['query'],
  ): Promise<OutputOf<typeof contract.listSuppliers>> {
    const { query, latest } = supplierRows(this.db)
    const pattern = input.q?.replace(/[\\%_]/g, (char) => `\\${char}`)
    const accountFilter: SQL | undefined =
      input.hasAccount === undefined
        ? undefined
        : input.hasAccount === 'true'
          ? eq(latest.accountEnabled, true)
          : sql`coalesce(${latest.accountEnabled}, false) = false`
    const rows = await query
      .where(
        and(
          pattern ? ilike(suppliers.name, `%${pattern}%`) : undefined,
          input.enabled ? eq(suppliers.enabled, input.enabled === 'true') : undefined,
          accountFilter,
          afterCursor(suppliers.name, suppliers.id, input.cursor),
        ),
      )
      .orderBy(asc(suppliers.name), asc(suppliers.id))
      .limit(input.limit + 1)
    const page = pageOf(rows, input.limit, (row) => [row.supplier.name, row.supplier.id])
    return {
      items: page.items.map((row) => supplierOf(row, viewer)),
      nextCursor: page.nextCursor,
      actions: viewer.modules.includes('purchase') ? [enabledAction('create', null)] : [],
    }
  }
}
