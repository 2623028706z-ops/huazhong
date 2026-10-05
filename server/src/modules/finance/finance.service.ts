import { statementCopy } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { statements } from '../../../db/schema/index.ts'
import { and, eq } from 'drizzle-orm'
import { StatementReads } from './statement-reads.ts'
import { readyPartyCount } from './party-reads.ts'
import { overdueDays } from '../../common/statements.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
@Injectable()
export class FinanceService {
  constructor(private readonly reads: StatementReads) {}
  // 首页待办只放财务该动手的事（03 章第 8.4 节）：逾期未收、可开对账单；
  // 待收款、待付款是在等对方付钱，不进待办
  async todos(_viewer: Viewer) {
    return this.reads.read(async (tx) => {
      const receivable = await tx
        .select({ dueDate: statements.dueDate })
        .from(statements)
        .where(and(eq(statements.status, 'unsettled'), eq(statements.kind, 'customer')))
      const today = this.reads.clock.today()
      const overdue = receivable.filter((r) => overdueDays(r.dueDate, today) > 0).length
      const customers = await readyPartyCount(tx, 'customer')
      const suppliers = await readyPartyCount(tx, 'supplier')
      return {
        count: overdue + customers + suppliers,
        rows: [
          { key: 'overdueReceivable', label: statementCopy.overdueTodo, count: overdue },
          {
            key: 'customerStatementReady',
            label: statementCopy.customerReadyTodo,
            count: customers,
          },
          {
            key: 'supplierStatementReady',
            label: statementCopy.supplierReadyTodo,
            count: suppliers,
          },
        ],
      }
    })
  }
}
