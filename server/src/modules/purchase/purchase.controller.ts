import { contract, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { PoReads } from './po-reads.ts'
import { PoWrites } from './po-writes.ts'
import { PurchaseDemand } from './demand.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>

@Controller()
export class PurchaseController {
  constructor(
    private readonly reads: PoReads,
    private readonly writes: PoWrites,
  ) {}
  @Route(contract.listPurchaseOrders)
  list(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'listPurchaseOrders'>,
  ): Promise<OutputOf<typeof contract.listPurchaseOrders>> {
    return this.reads.list(viewer, input.query)
  }
  @Route(contract.getPurchaseOrder)
  detail(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'getPurchaseOrder'>,
  ): Promise<OutputOf<typeof contract.getPurchaseOrder>> {
    return this.reads.get(viewer, Number(input.params.id))
  }
  @Route(contract.createPurchaseOrder)
  create(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'createPurchaseOrder'>,
  ): Promise<OutputOf<typeof contract.createPurchaseOrder>> {
    return this.writes.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.updatePurchaseOrder)
  update(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'updatePurchaseOrder'>,
  ): Promise<OutputOf<typeof contract.updatePurchaseOrder>> {
    return this.writes.update(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.cancelPurchaseOrder)
  cancel(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'cancelPurchaseOrder'>,
  ): Promise<OutputOf<typeof contract.cancelPurchaseOrder>> {
    return this.writes.cancel(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.supplierPurchaseOrders)
  supplierList(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'supplierPurchaseOrders'>,
  ): Promise<OutputOf<typeof contract.supplierPurchaseOrders>> {
    return this.reads.list(viewer, input.query)
  }
  @Route(contract.supplierPurchaseOrder)
  supplierDetail(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'supplierPurchaseOrder'>,
  ): Promise<OutputOf<typeof contract.supplierPurchaseOrder>> {
    return this.reads.get(viewer, Number(input.params.id))
  }
}
@Controller()
export class DemandController {
  constructor(private readonly demand: PurchaseDemand) {}
  @Route(contract.listPurchaseDemand)
  list(
    @Input() input: In<'listPurchaseDemand'>,
  ): Promise<OutputOf<typeof contract.listPurchaseDemand>> {
    return this.demand.demand(input.query)
  }
  @Route(contract.listDemandSources)
  sources(
    @Input() input: In<'listDemandSources'>,
  ): Promise<OutputOf<typeof contract.listDemandSources>> {
    return this.demand.sources(Number(input.params.materialId), input.query)
  }
}
