import { contract, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import {
  CurrentViewer,
  Input,
  Route,
  PaymentInput,
  type PaymentInputValue,
  type ParsedInput,
} from '../../common/endpoint.ts'
import { PaymentReads } from './payment-reads.ts'
import { PaymentWrites } from './payment-writes.ts'
import { ReceiptService } from './receipts.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>
@Controller()
export class PaymentsController {
  constructor(
    private readonly reads: PaymentReads,
    private readonly writes: PaymentWrites,
    private readonly receipts: ReceiptService,
  ) {}
  @Route(contract.createPayment)
  create(
    @CurrentViewer() viewer: Viewer,
    @PaymentInput() input: PaymentInputValue,
  ): Promise<OutputOf<typeof contract.createPayment>> {
    if ('replayPaymentId' in input) return this.reads.get(input.replayPaymentId, viewer)
    return this.writes.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.getPayment)
  detail(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'getPayment'>,
  ): Promise<OutputOf<typeof contract.getPayment>> {
    return this.reads.get(Number(input.params.id), viewer)
  }
  @Route(contract.voidPayment)
  void(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'voidPayment'>,
  ): Promise<OutputOf<typeof contract.voidPayment>> {
    return this.writes.void(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.listFinanceRecords)
  records(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listFinanceRecords'>,
  ): Promise<OutputOf<typeof contract.listFinanceRecords>> {
    return input.query.kind === 'payment'
      ? this.reads.records(input.query, viewer)
      : this.receipts.records(input.query, viewer)
  }
  @Route(contract.allocatePaymentPrepaid)
  allocate(@CurrentViewer() viewer: Viewer, @Input() input: In<'allocatePaymentPrepaid'>) {
    return this.writes.allocate(viewer, input.body, input.idempotencyKey)
  }
}
