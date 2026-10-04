import { contract, type ReceiptCreate, type PaymentCreate, type InputOf } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import type { Db, Tx } from '../../../db/client.ts'
import { Clock } from '../../common/clock.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { WriteService } from '../../common/write.service.ts'
import { StatementReads, type Query } from './statement-reads.ts'
import { fundRow, fundDetails, fundRecords, type FundKind } from './fund-reads.ts'
import { registerFund, voidFund } from './fund-commands.ts'
import { registerRefund, voidRefund } from './fund-refunds.ts'
@Injectable()
export class FundsService {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: StatementReads,
    private readonly clock: Clock,
  ) {}
  async detail(tx: Db | Tx, kind: FundKind, id: number, viewer: Viewer) {
    return found((await fundDetails(tx, kind, [await fundRow(tx, { kind, id })], viewer))[0])
  }
  create(viewer: Viewer, kind: FundKind, input: ReceiptCreate | PaymentCreate, key: string) {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const row = await registerFund(ctx, input, { kind, clock: this.clock, reads: this.reads })
        return this.detail(ctx.tx, kind, row.id, viewer)
      },
      { endpoint: kind === 'receipt' ? contract.createReceipt : contract.createPayment, key },
    )
  }
  void(viewer: Viewer, kind: FundKind, id: number, input: { version: number; reason: string }) {
    return this.writes.run(viewer, async (ctx) => {
      await voidFund(ctx, { kind, id, input }, this.clock)
      return this.detail(ctx.tx, kind, id, viewer)
    })
  }
  records(
    tx: Db | Tx,
    viewer: Viewer,
    query: Omit<Query, 'status'> & { kind: FundKind; status?: 'valid' | 'voided' | undefined },
  ) {
    return fundRecords(tx, viewer, query)
  }
  refund(viewer: Viewer, input: InputOf<typeof contract.createRefund>['body'], key: string) {
    return this.writes.run(viewer, (ctx) => registerRefund(ctx, input, this.clock), {
      endpoint: contract.createRefund,
      key,
    })
  }
  voidRefund(viewer: Viewer, id: number, input: { version: number; reason: string }) {
    return this.writes.run(viewer, (ctx) => voidRefund(ctx, id, input, this.clock))
  }
}
