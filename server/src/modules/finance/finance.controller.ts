import { contract, type OutputOf, type PaymentMethod, type ReceiptDetail } from '@huazhong/shared'
import { Controller, Inject } from '@nestjs/common'
import type { Db } from '../../../db/client.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { ArReads } from './ar-reads.ts'
import { MethodService } from './methods.ts'
import { ReceiptService } from './receipts.ts'

type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>

@Controller()
export class FinanceController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ar: ArReads,
    private readonly receipts: ReceiptService,
    private readonly methods: MethodService,
  ) {}

  @Route(contract.listArCustomers)
  customers(
    @Input() input: In<'listArCustomers'>,
  ): Promise<OutputOf<typeof contract.listArCustomers>> {
    return this.ar.customers(input.query)
  }

  @Route(contract.getArCustomer)
  customer(@Input() input: In<'getArCustomer'>): Promise<OutputOf<typeof contract.getArCustomer>> {
    return this.ar.customer(Number(input.params.id), input.query)
  }

  @Route(contract.listUnpaidOrders)
  unpaid(
    @Input() input: In<'listUnpaidOrders'>,
  ): Promise<OutputOf<typeof contract.listUnpaidOrders>> {
    return this.ar.unpaidOrders(Number(input.params.id))
  }

  @Route(contract.getArOrder)
  order(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'getArOrder'>,
  ): Promise<OutputOf<typeof contract.getArOrder>> {
    return this.ar.order(viewer, Number(input.params.id))
  }

  @Route(contract.storeStatement)
  storeStatement(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'storeStatement'>,
  ): Promise<OutputOf<typeof contract.storeStatement>> {
    return this.ar.storeStatement(viewer, input.query)
  }

  @Route(contract.createReceipt)
  createReceipt(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createReceipt'>,
  ): Promise<ReceiptDetail> {
    return this.receipts.create(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.allocatePrepaid)
  allocate(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'allocatePrepaid'>,
  ): Promise<OutputOf<typeof contract.allocatePrepaid>> {
    return this.receipts.allocatePrepaid(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.getReceipt)
  receipt(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'getReceipt'>,
  ): Promise<ReceiptDetail> {
    return this.db.transaction((tx) => this.receipts.detail(tx, Number(input.params.id), viewer), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  }

  @Route(contract.voidReceipt)
  voidReceipt(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'voidReceipt'>,
  ): Promise<ReceiptDetail> {
    return this.receipts.void(viewer, Number(input.params.id), input.body)
  }

  @Route(contract.listMethods)
  listMethods(@Input() input: In<'listMethods'>): Promise<OutputOf<typeof contract.listMethods>> {
    return this.methods.list(input.query.kind)
  }

  @Route(contract.createMethod)
  createMethod(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createMethod'>,
  ): Promise<PaymentMethod> {
    return this.methods.create(viewer, input.body, input.idempotencyKey)
  }

  @Route(contract.updateMethod)
  updateMethod(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updateMethod'>,
  ): Promise<PaymentMethod> {
    return this.methods.setEnabled(viewer, Number(input.params.id), input.body.enabled)
  }
}
