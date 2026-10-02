import { Module } from '@nestjs/common'
import { FinanceModule } from '../finance/finance.module.ts'
import { SalesModule } from '../sales/sales.module.ts'
import { PurchaseModule } from '../purchase/purchase.module.ts'
import { TodosController } from './todos.controller.ts'
import { TodosService } from './todos.service.ts'

@Module({
  imports: [SalesModule, FinanceModule, PurchaseModule],
  controllers: [TodosController],
  providers: [TodosService],
})
export class TodosModule {}
