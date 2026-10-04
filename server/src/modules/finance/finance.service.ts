import { statementCopy } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { statements } from '../../../db/schema/index.ts'
import { eq } from 'drizzle-orm'
import { StatementReads } from './statement-reads.ts'
import { overdueDays } from '../../common/statements.ts'
import { sumOf } from '../../common/domain/units.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
@Injectable()
export class FinanceService {
  constructor(private readonly reads: StatementReads) {}
  async todos(_viewer: Viewer) {
    return this.reads.read(async (tx) => {
      const rows = await tx.select().from(statements).where(eq(statements.status, 'unsettled'))
      const receivable = rows.filter((r) => r.kind === 'customer')
      const payable = rows.filter((r) => r.kind === 'supplier')
      const overdue = receivable.filter((r) => overdueDays(r.dueDate, this.reads.clock.today()) > 0)
      return {
        count: receivable.length + payable.length + overdue.length,
        rows: [
          {
            key: 'receivable',
            label: statementCopy.receivableTodo,
            count: receivable.length,
            amountCents: sumOf(receivable, (r) => r.dueCents),
          },
          { key: 'overdueReceivable', label: statementCopy.overdueTodo, count: overdue.length },
          {
            key: 'payable',
            label: statementCopy.payableTodo,
            count: payable.length,
            amountCents: sumOf(payable, (r) => r.dueCents),
          },
        ],
      }
    })
  }
}
