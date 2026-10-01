import { Module } from '@nestjs/common'
import { SalesModule } from '../sales/sales.module.ts'
import { ArReads } from './ar-reads.ts'
import { FinanceController } from './finance.controller.ts'
import { FinanceService } from './finance.service.ts'
import { MethodService } from './methods.ts'
import { ReceiptService } from './receipts.ts'

// 财务收款部分：客户对账、门店对账、登记收款、核销预收、作废收款、收付款方式
@Module({
  imports: [SalesModule],
  controllers: [FinanceController],
  providers: [ArReads, ReceiptService, MethodService, FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
