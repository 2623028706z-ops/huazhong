import { contract, copy } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { accounts, suppliers } from '../../../db/schema/index.ts'
import { assertPhoneFree, ENABLED_PHONE_INDEX } from '../../common/account-writes.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService } from '../../common/write.service.ts'
import { SupplierReads } from './supplier-reads.ts'

export const SUPPLIER_UNIQUE_FIELDS = {
  suppliers_name_unique: { name: copy.finance.supplierNameTaken },
  [ENABLED_PHONE_INDEX]: { 'account.loginPhone': copy.staff.phoneTaken },
}
export function supplierLog(row: { id: number; name: string }, action: string) {
  return {
    module: 'purchase' as const,
    kind: copy.log.kind.supplier,
    action,
    targetType: 'suppliers',
    targetId: row.id,
    targetLabel: row.name,
  }
}
export function supplierView(input: ParsedInput<typeof contract.createSupplier>['body']) {
  return {
    [copy.field.name]: input.name,
    [copy.field.contact]: input.contact,
    [copy.field.storePhone]: input.phone,
    [copy.field.address]: input.address,
    [copy.field.status]: input.enabled ? copy.statusValue.enabled : copy.statusValue.disabled,
    [copy.field.phone]: input.account.enabled
      ? input.account.loginPhone
      : copy.statusValue.disabled,
  }
}
@Injectable()
export class SupplierCreate {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: SupplierReads,
  ) {}
  create(viewer: Viewer, input: ParsedInput<typeof contract.createSupplier>['body'], key: string) {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            const { account, ...fields } = input
            const row = found(
              (
                await ctx.tx
                  .insert(suppliers)
                  .values({ ...fields, createdBy: viewer.accountId })
                  .returning()
              )[0],
            )
            if (account.enabled) {
              await assertPhoneFree(ctx.tx, account.loginPhone, null, 'account.loginPhone')
              await ctx.tx.insert(accounts).values({
                type: 'supplier',
                name: input.contact || input.name,
                phone: account.loginPhone,
                supplierId: row.id,
                createdBy: viewer.accountId,
              })
            }
            await ctx.log({
              ...supplierLog(row, copy.log.action.createSupplier),
              after: supplierView(input),
            })
            return this.reads.item(ctx.tx, viewer, row.id)
          },
          { endpoint: contract.createSupplier, key },
        ),
      SUPPLIER_UNIQUE_FIELDS,
    )
  }
}
