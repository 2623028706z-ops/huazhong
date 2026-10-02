import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { payments, receipts } from '../../../db/schema/index.ts'
import { loadLedger } from '../../common/customer-ledger.ts'
import { lockSupplierLedger } from '../../common/ledger.ts'
import { loadPaymentLedger } from '../../common/payment-ledger.ts'
import { lockCustomer } from '../../common/org.ts'
import { found } from '../../common/scope.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { SalesService } from '../sales/sales.service.ts'
import { ReceiptService } from './receipts.ts'
import { PaymentWrites } from './payment-writes.ts'
import { PaymentReads } from './payment-reads.ts'

@Injectable()
export class RefundSources {
  constructor(
    private readonly sales: SalesService,
    readonly receipts: ReceiptService,
    readonly payments: PaymentWrites,
    readonly paymentReads: PaymentReads,
  ) {}
  async load(ctx: WriteContext, kind: 'receipt' | 'payment', id: number) {
    if (kind === 'receipt') {
      const row = found((await ctx.tx.select().from(receipts).where(eq(receipts.id, id)))[0])
      await lockCustomer(ctx.tx, row.customerId)
      const current = found((await ctx.tx.select().from(receipts).where(eq(receipts.id, id)))[0])
      return {
        row: current,
        owner: row.customerId,
        balance: (await loadLedger(ctx.tx, this.sales, row.customerId)).replay.left.get(id) ?? 0,
      }
    }
    const row = found((await ctx.tx.select().from(payments).where(eq(payments.id, id)))[0])
    await lockSupplierLedger(ctx.tx, row.supplierId)
    const current = found((await ctx.tx.select().from(payments).where(eq(payments.id, id)))[0])
    return {
      row: current,
      owner: row.supplierId,
      balance: (await loadPaymentLedger(ctx.tx, row.supplierId)).replay.left.get(id) ?? 0,
    }
  }
  notify(ctx: WriteContext, kind: 'receipt' | 'payment', owner: number) {
    return kind === 'receipt' ? this.receipts.notify(ctx, owner) : this.payments.notify(ctx, owner)
  }
}
