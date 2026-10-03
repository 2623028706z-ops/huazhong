import { Module } from '@nestjs/common'
import { SalesModule } from '../sales/sales.module.ts'
import { ArReads } from './ar-reads.ts'
import { FinanceController } from './finance.controller.ts'
import { FinanceService } from './finance.service.ts'
import { MethodService } from './methods.ts'
import { ReceiptService } from './receipts.ts'
import { ApReads } from './ap-reads.ts'
import { PaymentWrites } from './payment-writes.ts'
import { PurchaseModule } from '../purchase/purchase.module.ts'
import { PaymentReads } from './payment-reads.ts'
import { ApController } from './ap.controller.ts'
import { PaymentsController } from './payments.controller.ts'
import { RefundService, RefundController } from './refunds.ts'
import { RefundSources } from './refund-sources.ts'
import { WarehouseModule } from '../warehouse/warehouse.module.ts'

// 财务收款部分：客户对账、门店对账、登记收款、核销预收、作废收款、收付款方式
@Module({
  imports: [SalesModule, PurchaseModule, WarehouseModule],
  controllers: [FinanceController, ApController, PaymentsController, RefundController],
  providers: [
    ArReads,
    ReceiptService,
    MethodService,
    FinanceService,
    ApReads,
    PaymentReads,
    PaymentWrites,
    RefundService,
    RefundSources,
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
