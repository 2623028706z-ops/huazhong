import { appError, contract, copy } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { desc, eq, sql } from 'drizzle-orm'
import { accounts, suppliers } from '../../../db/schema/index.ts'
import { assertPhoneFree, versionPlusOne } from '../../common/account-writes.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { SUPPLIER_UNIQUE_FIELDS, supplierLog, supplierView } from './supplier-create.ts'
import { cancelSupplierInvites } from './supplier-invites.ts'
import { SupplierReads } from './supplier-reads.ts'

type Update = ParsedInput<typeof contract.updateSupplier>['body']
type Account = typeof accounts.$inferSelect
@Injectable()
export class SupplierUpdate {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: SupplierReads,
    private readonly clock: Clock,
  ) {}
  update(viewer: Viewer, id: number, input: Update) {
    return guardUnique(
      () => this.writes.run(viewer, (ctx) => this.updateInTx(ctx, id, input)),
      SUPPLIER_UNIQUE_FIELDS,
    )
  }
  private async updateInTx(ctx: WriteContext, id: number, input: Update) {
    const viewer = found(ctx.viewer ?? undefined)
    const row = found(
      (await ctx.tx.select().from(suppliers).where(eq(suppliers.id, id)).for('update'))[0],
    )
    const before = await this.reads.item(ctx.tx, viewer, id)
    gateAction(before, {
      code: 'edit',
      version: input.version,
      missing: copy.finance.supplierStale,
      stale: copy.finance.supplierStale,
    })
    const beforeView = supplierView({
      ...before,
      account: { enabled: before.account.enabled, loginPhone: before.account.loginPhone },
    })
    const afterView = supplierView(input)
    if (JSON.stringify(beforeView) === JSON.stringify(afterView))
      throw appError.businessRule(copy.error.noChange)
    const unbinding = await this.applyAccount(ctx, id, input)
    await this.saveSupplier(ctx, id, input)
    if (!input.enabled || !input.account.enabled) {
      await cancelSupplierInvites(
        ctx,
        id,
        input.enabled ? copy.finance.inviteAutoAccount : copy.finance.inviteAutoSupplier,
        this.clock.now(),
      )
    }
    await ctx.log({
      ...supplierLog(
        row,
        row.enabled && !input.enabled
          ? copy.log.action.disableSupplier
          : copy.log.action.updateSupplier,
      ),
      reason: unbinding ? copy.staff.unbindTogether : '',
      before: beforeView,
      after: afterView,
    })
    ctx.notify([{ topic: `supplier:${id}`, version: null }], { supplierIds: [String(id)] })
    return this.reads.item(ctx.tx, viewer, id)
  }
  private async saveSupplier(ctx: WriteContext, id: number, input: Update) {
    await ctx.tx
      .update(suppliers)
      .set({
        name: input.name,
        contact: input.contact,
        phone: input.phone,
        address: input.address,
        enabled: input.enabled,
        version: sql`${suppliers.version} + 1`,
      })
      .where(eq(suppliers.id, id))
  }
  private async applyAccount(ctx: WriteContext, id: number, input: Update) {
    const rows = await ctx.tx
      .select()
      .from(accounts)
      .where(eq(accounts.supplierId, id))
      .orderBy(desc(accounts.enabled), desc(accounts.id))
      .for('update')
    const current = rows[0]
    if (current === undefined) {
      if (input.account.enabled) await this.createAccount(ctx, id, input)
      return false
    }
    return this.changeAccount(ctx, current, input)
  }
  private async createAccount(ctx: WriteContext, id: number, input: Update) {
    await assertPhoneFree(ctx.tx, input.account.loginPhone, null, 'account.loginPhone')
    await ctx.tx.insert(accounts).values({
      type: 'supplier',
      supplierId: id,
      name: input.contact || input.name,
      phone: input.account.loginPhone,
      createdBy: ctx.viewer?.accountId ?? 0,
    })
  }
  private async changeAccount(ctx: WriteContext, current: Account, input: Update) {
    const phone = input.account.enabled ? input.account.loginPhone : current.phone
    if (input.account.enabled)
      await assertPhoneFree(ctx.tx, phone, current.id, 'account.loginPhone')
    const unbind = phone !== current.phone
    await ctx.tx
      .update(accounts)
      .set({
        name: input.contact || input.name,
        phone,
        enabled: input.account.enabled,
        version: versionPlusOne,
        ...(unbind ? { openid: null, boundAt: null } : {}),
      })
      .where(eq(accounts.id, current.id))
    ctx.notify([{ topic: `account:${current.id}`, version: null }])
    return unbind && current.openid !== null
  }
}
