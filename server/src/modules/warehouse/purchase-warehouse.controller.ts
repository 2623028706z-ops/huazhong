import { contract, type OutputOf } from '@huazhong/shared'
import { Controller } from '@nestjs/common'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { PoReceiving } from './po-receiving.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>
@Controller()
export class PurchaseWarehouseController {
  constructor(private readonly receiving: PoReceiving) {}
  @Route(contract.receivePurchaseOrder)
  receive(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'receivePurchaseOrder'>,
  ): Promise<OutputOf<typeof contract.receivePurchaseOrder>> {
    return this.receiving.receive(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.returnPurchaseOrder)
  returns(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'returnPurchaseOrder'>,
  ): Promise<OutputOf<typeof contract.returnPurchaseOrder>> {
    return this.receiving.returns(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.repricePurchaseOrder)
  reprice(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'repricePurchaseOrder'>,
  ): Promise<OutputOf<typeof contract.repricePurchaseOrder>> {
    return this.receiving.reprice(viewer, Number(input.params.id), input.body)
  }
}
