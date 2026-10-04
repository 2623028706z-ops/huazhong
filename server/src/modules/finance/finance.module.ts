import { Module } from '@nestjs/common'
import { FinanceController } from './finance.controller.ts'
import { FinanceService } from './finance.service.ts'
import { StatementReads } from './statement-reads.ts'
import { StatementWrites } from './statement-writes.ts'
import { FundsService } from './funds.ts'
import { MethodService } from './methods.ts'
@Module({
  controllers: [FinanceController],
  providers: [FinanceService, StatementReads, StatementWrites, FundsService, MethodService],
  exports: [FinanceService],
})
export class FinanceModule {}
